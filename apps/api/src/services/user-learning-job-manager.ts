import type {
  UserLearningJobStatusResponse,
} from "@camping/shared";
import type { CampingRepository } from "../file-store/camping-repository";
import { isAppError, toApiError } from "./app-error";
import type { AiJobEventBroker } from "./ai-job-event-broker";
import { isAbortError } from "./openai-client";

type UserLearningJobExecutorResult = {
  profileExists: boolean;
  sourceHistoryIds: string[];
  sourceEntryCount: number;
};

type UserLearningJobExecutor = (input: {
  triggerHistoryId: string | null;
  signal?: AbortSignal;
}) => Promise<UserLearningJobExecutorResult>;

export class UserLearningJobManager {
  private activeJob: Promise<void> | null = null;
  private activeAbortController: AbortController | null = null;
  private lock = Promise.resolve();
  private generation = 0;
  private rerunRequested = false;
  private pendingTriggerHistoryId: string | null = null;

  constructor(
    private readonly repository: CampingRepository,
    private readonly executeJob: UserLearningJobExecutor,
    private readonly eventBroker: AiJobEventBroker,
  ) {}

  async recoverInterruptedJobs() {
    await this.repository.markPendingUserLearningJobStatusInterrupted();
  }

  async getUserLearningStatus(): Promise<UserLearningJobStatusResponse> {
    return (
      (await this.repository.readUserLearningJobStatus()) ??
      (await this.repository.createIdleUserLearningJobStatus())
    );
  }

  async enqueueRetrospectiveLearning(historyId: string) {
    return this.enqueueUserLearningRebuild(historyId);
  }

  async enqueueUserLearningRebuild(triggerHistoryId: string | null) {
    return this.withLock(async () => {
      const currentStatus = await this.getUserLearningStatus();
      const requestedAt = new Date().toISOString();

      this.pendingTriggerHistoryId = triggerHistoryId;

      const nextStatus = await this.saveUserLearningStatus({
        ...currentStatus,
        status:
          this.activeJob && currentStatus.status === "running" ? "running" : "queued",
        trigger_history_id: triggerHistoryId,
        requested_at: requestedAt,
        started_at:
          this.activeJob && currentStatus.status === "running"
            ? currentStatus.started_at ?? null
            : null,
        finished_at: null,
        error: undefined,
      });

      if (this.activeJob) {
        this.rerunRequested = true;
        return nextStatus;
      }

      this.startProcessor();
      return nextStatus;
    });
  }

  async cancelAllUserLearning() {
    return this.withLock(async () => {
      const currentStatus = await this.getUserLearningStatus();

      this.generation += 1;
      this.rerunRequested = false;
      this.pendingTriggerHistoryId = null;
      this.activeAbortController?.abort();

      if (!isPendingUserLearningStatus(currentStatus.status)) {
        return { cancelledJobCount: 0 };
      }

      await this.saveUserLearningStatus({
        ...currentStatus,
        status: "interrupted",
        finished_at: new Date().toISOString(),
        error: {
          code: "INTERNAL_ERROR",
          message: "사용자 요청으로 개인화 학습을 중단했습니다.",
        },
      });

      return { cancelledJobCount: 1 };
    });
  }

  private startProcessor() {
    const generation = this.generation;
    const job = this.processQueue(generation);

    this.activeJob = job;
    void job.finally(() => {
      if (this.activeJob === job) {
        this.activeJob = null;
      }

      this.activeAbortController = null;
    });
  }

  private async processQueue(generation: number) {
    while (this.isCurrentGeneration(generation)) {
      const runInput = await this.prepareRun(generation);

      if (!runInput) {
        return;
      }

      const controller = new AbortController();
      this.activeAbortController = controller;

      try {
        const result = await this.executeJob({
          triggerHistoryId: runInput.triggerHistoryId,
          signal: controller.signal,
        });

        if (!this.isCurrentGeneration(generation) || controller.signal.aborted) {
          return;
        }

        if (this.rerunRequested) {
          const queuedAt = new Date().toISOString();
          const nextTriggerHistoryId = this.pendingTriggerHistoryId;

          this.rerunRequested = false;
          await this.saveUserLearningStatus({
            status: "queued",
            trigger_history_id: nextTriggerHistoryId,
            source_history_ids: result.sourceHistoryIds,
            source_entry_count: result.sourceEntryCount,
            requested_at: queuedAt,
            started_at: null,
            finished_at: null,
          });
          continue;
        }

        await this.saveUserLearningStatus({
          status: result.profileExists ? "completed" : "idle",
          trigger_history_id: runInput.triggerHistoryId,
          source_history_ids: result.sourceHistoryIds,
          source_entry_count: result.sourceEntryCount,
          requested_at: runInput.requestedAt,
          started_at: runInput.startedAt,
          finished_at: new Date().toISOString(),
        });
        this.pendingTriggerHistoryId = null;
        return;
      } catch (error) {
        if (!this.isCurrentGeneration(generation) || controller.signal.aborted) {
          return;
        }

        if (isAbortError(error)) {
          return;
        }

        const currentStatus = await this.getUserLearningStatus();

        await this.saveUserLearningStatus({
          ...currentStatus,
          status: "failed",
          trigger_history_id: runInput.triggerHistoryId,
          finished_at: new Date().toISOString(),
          error: isAppError(error)
            ? toApiError(error)
            : {
                code: "INTERNAL_ERROR",
                message:
                  error instanceof Error
                    ? error.message
                    : "개인화 학습 업데이트에 실패했습니다.",
              },
        });
        this.pendingTriggerHistoryId = null;
        this.rerunRequested = false;
        return;
      } finally {
        if (this.activeAbortController === controller) {
          this.activeAbortController = null;
        }
      }
    }
  }

  private async prepareRun(generation: number) {
    return this.withLock(async () => {
      if (!this.isCurrentGeneration(generation)) {
        return null;
      }

      const currentStatus = await this.getUserLearningStatus();
      const startedAt = new Date().toISOString();
      const triggerHistoryId = this.pendingTriggerHistoryId;
      const requestedAt = currentStatus.requested_at ?? startedAt;

      await this.saveUserLearningStatus({
        ...currentStatus,
        status: "running",
        trigger_history_id: triggerHistoryId,
        requested_at: requestedAt,
        started_at: startedAt,
        finished_at: null,
        error: undefined,
      });

      return {
        triggerHistoryId,
        requestedAt,
        startedAt,
      };
    });
  }

  private async saveUserLearningStatus(value: UserLearningJobStatusResponse) {
    const saved = await this.repository.saveUserLearningJobStatus(value);
    this.eventBroker.publishUserLearningStatus(saved);
    return saved;
  }

  private isCurrentGeneration(generation: number) {
    return this.generation === generation;
  }

  private async withLock<T>(callback: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    let release = () => {};

    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await callback();
    } finally {
      release();
    }
  }
}

function isPendingUserLearningStatus(status: UserLearningJobStatusResponse["status"]) {
  return status === "queued" || status === "running";
}
