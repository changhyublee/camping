import type {
  DurableMetadataJobStatusResponse,
  DurableEquipmentItem,
} from "@camping/shared";
import type { CampingRepository } from "../file-store/camping-repository";
import type { EquipmentMetadataSearchClient } from "./equipment-metadata-service";
import { AppError, isAppError, toApiError } from "./app-error";
import { isAbortError } from "./openai-client";

export class EquipmentMetadataJobManager {
  private readonly activeJobs = new Map<string, Promise<void>>();
  private readonly activeAbortControllers = new Map<string, AbortController>();
  private readonly pendingEnqueues = new Map<
    string,
    Promise<DurableMetadataJobStatusResponse>
  >();
  private readonly itemLocks = new Map<string, Promise<void>>();
  private readonly latestRequestedFingerprints = new Map<string, string>();
  private readonly jobGenerations = new Map<string, number>();
  private readonly rerunRequested = new Set<string>();
  private readonly cancelledItems = new Set<string>();
  private readonly executionWaiters: Array<() => void> = [];
  private runningCount = 0;

  constructor(
    private readonly repository: CampingRepository,
    private readonly metadataClient: EquipmentMetadataSearchClient,
    private readonly maxConcurrentJobs = 3,
  ) {}

  async recoverInterruptedJobs() {
    await this.repository.markPendingDurableMetadataJobStatusesInterrupted();
  }

  async listDurableMetadataJobStatuses() {
    return this.repository.listDurableMetadataJobStatuses();
  }

  async cancelAllDurableMetadataRefreshes() {
    const statuses = await this.repository.listDurableMetadataJobStatuses();
    const itemIds = new Set<string>([
      ...statuses.map((status) => status.item_id),
      ...this.activeJobs.keys(),
      ...this.pendingEnqueues.keys(),
    ]);
    let cancelledItemCount = 0;

    for (const itemId of itemIds) {
      cancelledItemCount += await this.interruptDurableMetadataRefresh(itemId);
    }

    return { cancelledItemCount };
  }

  async enqueueDurableMetadataRefresh(
    itemId: string,
  ): Promise<DurableMetadataJobStatusResponse> {
    const existingEnqueue = this.pendingEnqueues.get(itemId);

    if (existingEnqueue) {
      return existingEnqueue;
    }

    const enqueuePromise = this.withItemLock(itemId, async () => {
      this.cancelledItems.delete(itemId);

      const item = await this.repository.readDurableItem(itemId);
      const nextFingerprint = buildDurableMetadataFingerprint(item);
      const currentStatus = await this.repository.readDurableMetadataJobStatus(itemId);
      const activeJob = this.activeJobs.get(itemId);

      if (currentStatus && isPendingDurableMetadataJobStatus(currentStatus.status)) {
        if (activeJob) {
          return this.reusePendingJobStatus(currentStatus, nextFingerprint);
        }

        await this.repository.saveDurableMetadataJobStatus(
          buildInterruptedDurableMetadataJobStatus(currentStatus),
        );
      }

      this.latestRequestedFingerprints.set(itemId, nextFingerprint);
      this.rerunRequested.delete(itemId);
      const generation = this.bumpJobGeneration(itemId);

      const queuedStatus = await this.repository.saveDurableMetadataJobStatus({
        item_id: itemId,
        status: "queued",
        requested_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
      });

      const job = this.runQueuedJob(
        itemId,
        queuedStatus.requested_at ?? new Date().toISOString(),
        generation,
      );
      this.activeJobs.set(itemId, job);
      void job.finally(() => {
        if (this.activeJobs.get(itemId) === job) {
          this.activeJobs.delete(itemId);
        }

        this.activeAbortControllers.delete(itemId);

        if (!this.cancelledItems.has(itemId)) {
          this.latestRequestedFingerprints.delete(itemId);
        }

        this.rerunRequested.delete(itemId);
      });

      return queuedStatus;
    });

    this.pendingEnqueues.set(itemId, enqueuePromise);

    try {
      return await enqueuePromise;
    } finally {
      if (this.pendingEnqueues.get(itemId) === enqueuePromise) {
        this.pendingEnqueues.delete(itemId);
      }
    }
  }

  async cancelDurableMetadataRefresh(itemId: string): Promise<void> {
    this.cancelledItems.add(itemId);
    this.rerunRequested.delete(itemId);
    this.latestRequestedFingerprints.delete(itemId);
    this.bumpJobGeneration(itemId);
    this.activeAbortControllers.get(itemId)?.abort();
    await this.repository.deleteDurableMetadataJobStatus(itemId);
  }

  private async interruptDurableMetadataRefresh(itemId: string): Promise<number> {
    return this.withItemLock(itemId, async () => {
      const currentStatus = await this.repository.readDurableMetadataJobStatus(itemId);

      this.cancelledItems.add(itemId);
      this.rerunRequested.delete(itemId);
      this.latestRequestedFingerprints.delete(itemId);
      this.bumpJobGeneration(itemId);
      this.activeAbortControllers.get(itemId)?.abort();

      if (
        !currentStatus ||
        !isPendingDurableMetadataJobStatus(currentStatus.status)
      ) {
        return 0;
      }

      await this.repository.saveDurableMetadataJobStatus({
        item_id: itemId,
        status: "interrupted",
        requested_at: currentStatus.requested_at ?? null,
        started_at: currentStatus.started_at ?? null,
        finished_at: new Date().toISOString(),
        error: {
          code: "INTERNAL_ERROR",
          message: "사용자 요청으로 모든 AI 요청을 중단했습니다.",
        },
      });

      return 1;
    });
  }

  private async reusePendingJobStatus(
    currentStatus: DurableMetadataJobStatusResponse,
    nextFingerprint: string,
  ): Promise<DurableMetadataJobStatusResponse> {
    const itemId = currentStatus.item_id;
    const previousFingerprint = this.latestRequestedFingerprints.get(itemId);

    if (previousFingerprint === nextFingerprint) {
      return currentStatus;
    }

    this.latestRequestedFingerprints.set(itemId, nextFingerprint);

    if (currentStatus.status === "running") {
      this.rerunRequested.add(itemId);
      return currentStatus;
    }

    const queuedStatus = {
      ...currentStatus,
      status: "queued" as const,
      requested_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
    };

    return this.repository.saveDurableMetadataJobStatus(queuedStatus);
  }

  private async runQueuedJob(
    itemId: string,
    initialRequestedAt: string,
    generation: number,
  ) {
    let requestedAt = initialRequestedAt;

    while (true) {
      if (!this.isCurrentGeneration(itemId, generation)) {
        return;
      }

      if (this.cancelledItems.has(itemId)) {
        await this.repository.deleteDurableMetadataJobStatus(itemId);
        return;
      }

      const input = await this.loadCollectionInput(itemId);

      if (!input) {
        await this.repository.deleteDurableMetadataJobStatus(itemId);
        return;
      }

      const releaseSlot = await this.acquireExecutionSlot();
      const startedAt = new Date().toISOString();

      if (!this.isCurrentGeneration(itemId, generation)) {
        releaseSlot();
        return;
      }

      await this.repository.saveDurableMetadataJobStatus({
        item_id: itemId,
        status: "running",
        requested_at: requestedAt,
        started_at: startedAt,
        finished_at: null,
      });

      const controller = new AbortController();
      this.activeAbortControllers.set(itemId, controller);

      if (!this.isCurrentGeneration(itemId, generation)) {
        return;
      }

      try {
        const metadata = await this.metadataClient.collectDurableEquipmentMetadata({
          item: input.item,
          categoryLabel: input.categoryLabel,
          signal: controller.signal,
        });

        if (
          !this.isCurrentGeneration(itemId, generation) ||
          controller.signal.aborted
        ) {
          return;
        }

        const rerunDecision = await this.checkLatestRequest(itemId, input.fingerprint);

        if (rerunDecision.action === "delete") {
          await this.repository.deleteDurableMetadataJobStatus(itemId);
          return;
        }

        if (rerunDecision.action === "rerun") {
          this.rerunRequested.delete(itemId);
          requestedAt = new Date().toISOString();
          await this.repository.saveDurableMetadataJobStatus({
            item_id: itemId,
            status: "queued",
            requested_at: requestedAt,
            started_at: null,
            finished_at: null,
          });
          continue;
        }

        if (this.cancelledItems.has(itemId)) {
          await this.repository.deleteDurableMetadataJobStatus(itemId);
          return;
        }

        await this.repository.saveDurableEquipmentMetadata(itemId, metadata);
        await this.repository.deleteDurableMetadataJobStatus(itemId);
        return;
      } catch (error) {
        if (
          !this.isCurrentGeneration(itemId, generation) ||
          controller.signal.aborted ||
          isAbortError(error)
        ) {
          return;
        }

        const rerunDecision = await this.checkLatestRequest(itemId, input.fingerprint);

        if (rerunDecision.action === "delete" || isResourceNotFoundError(error)) {
          await this.repository.deleteDurableMetadataJobStatus(itemId);
          return;
        }

        if (rerunDecision.action === "rerun") {
          this.rerunRequested.delete(itemId);
          requestedAt = new Date().toISOString();
          await this.repository.saveDurableMetadataJobStatus({
            item_id: itemId,
            status: "queued",
            requested_at: requestedAt,
            started_at: null,
            finished_at: null,
          });
          continue;
        }

        await this.repository.saveDurableMetadataJobStatus({
          item_id: itemId,
          status: "failed",
          requested_at: requestedAt,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          error: toBackgroundJobError(error),
        });
        return;
      } finally {
        if (this.activeAbortControllers.get(itemId) === controller) {
          this.activeAbortControllers.delete(itemId);
        }

        releaseSlot();
      }
    }
  }

  private async loadCollectionInput(itemId: string) {
    try {
      const item = await this.repository.readDurableItem(itemId);

      return {
        item,
        categoryLabel: await this.repository.readDurableCategoryLabel(item.category),
        fingerprint: buildDurableMetadataFingerprint(item),
      };
    } catch (error) {
      if (isResourceNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async checkLatestRequest(
    itemId: string,
    attemptedFingerprint: string,
  ): Promise<{ action: "continue" | "rerun" | "delete" }> {
    if (this.cancelledItems.has(itemId)) {
      return { action: "delete" };
    }

    const latestFingerprint = this.latestRequestedFingerprints.get(itemId);

    if (
      this.rerunRequested.has(itemId) ||
      (latestFingerprint && latestFingerprint !== attemptedFingerprint)
    ) {
      return { action: "rerun" };
    }

    try {
      const currentItem = await this.repository.readDurableItem(itemId);
      const currentFingerprint = buildDurableMetadataFingerprint(currentItem);

      if (currentFingerprint !== attemptedFingerprint) {
        this.latestRequestedFingerprints.set(itemId, currentFingerprint);
        return { action: "rerun" };
      }

      return { action: "continue" };
    } catch (error) {
      if (isResourceNotFoundError(error)) {
        return { action: "delete" };
      }

      throw error;
    }
  }

  private async acquireExecutionSlot() {
    if (this.runningCount < this.maxConcurrentJobs) {
      this.runningCount += 1;
      return () => this.releaseExecutionSlot();
    }

    return new Promise<() => void>((resolve) => {
      this.executionWaiters.push(() => {
        this.runningCount += 1;
        resolve(() => this.releaseExecutionSlot());
      });
    });
  }

  private releaseExecutionSlot() {
    const nextWaiter = this.executionWaiters.shift();

    this.runningCount -= 1;

    if (nextWaiter) {
      nextWaiter();
    }
  }

  private async withItemLock<T>(itemId: string, task: () => Promise<T>): Promise<T> {
    const previousLock = this.itemLocks.get(itemId) ?? Promise.resolve();
    let releaseLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockChain = previousLock.then(
      () => currentLock,
      () => currentLock,
    );

    this.itemLocks.set(itemId, lockChain);

    await previousLock;

    try {
      return await task();
    } finally {
      releaseLock();

      if (this.itemLocks.get(itemId) === lockChain) {
        this.itemLocks.delete(itemId);
      }
    }
  }

  private bumpJobGeneration(itemId: string) {
    const nextGeneration = (this.jobGenerations.get(itemId) ?? 0) + 1;
    this.jobGenerations.set(itemId, nextGeneration);
    return nextGeneration;
  }

  private isCurrentGeneration(itemId: string, generation: number) {
    return this.jobGenerations.get(itemId) === generation;
  }
}

function isPendingDurableMetadataJobStatus(
  status: DurableMetadataJobStatusResponse["status"],
) {
  return status === "queued" || status === "running";
}

function buildInterruptedDurableMetadataJobStatus(
  currentStatus: DurableMetadataJobStatusResponse,
): DurableMetadataJobStatusResponse {
  return {
    item_id: currentStatus.item_id,
    status: "interrupted",
    requested_at: currentStatus.requested_at ?? null,
    started_at: currentStatus.started_at ?? null,
    finished_at: new Date().toISOString(),
    error: {
      code: "INTERNAL_ERROR",
      message: "이전 메타데이터 수집 상태를 복구하지 못해 중단 처리했습니다.",
    },
  };
}

function buildDurableMetadataFingerprint(
  item: Pick<DurableEquipmentItem, "name" | "model" | "purchase_link" | "category">,
) {
  return [item.name, item.model ?? "", item.purchase_link ?? "", item.category].join(
    "::",
  );
}

function isResourceNotFoundError(error: unknown) {
  return (
    error instanceof AppError &&
    (error.code === "RESOURCE_NOT_FOUND" || error.code === "TRIP_NOT_FOUND")
  );
}

function toBackgroundJobError(error: unknown) {
  if (isAppError(error)) {
    return toApiError(error);
  }

  return {
    code: "INTERNAL_ERROR" as const,
    message: "알 수 없는 서버 오류가 발생했습니다.",
  };
}
