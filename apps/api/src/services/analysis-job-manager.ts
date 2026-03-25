import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  type AnalyzeTripRequest,
  type GetTripAnalysisStatusResponse,
  type TripAnalysisCategory,
  type TripAnalysisStatus,
  type TripId,
} from "@camping/shared";
import type { CampingRepository } from "../file-store/camping-repository";
import { isAppError, toApiError } from "./app-error";

type AnalysisJobExecutor = (input: AnalyzeTripRequest) => Promise<string>;

type QueuedAnalysisCategoryJob = {
  category: TripAnalysisCategory;
  overrideInstructions?: string;
};
type TripAnalysisStatusInput = Omit<
  GetTripAnalysisStatusResponse,
  "categories" | "completed_category_count" | "total_category_count"
> &
  Partial<
    Pick<
      GetTripAnalysisStatusResponse,
      "categories" | "completed_category_count" | "total_category_count"
    >
  >;

export class AnalysisJobManager {
  private readonly activeJobs = new Map<TripId, Promise<void>>();
  private readonly queuedJobs = new Map<TripId, QueuedAnalysisCategoryJob[]>();
  private readonly tripLocks = new Map<TripId, Promise<void>>();
  private readonly sessionErrors = new Map<
    TripId,
    GetTripAnalysisStatusResponse["error"]
  >();

  constructor(
    private readonly repository: CampingRepository,
    private readonly executeJob: AnalysisJobExecutor,
  ) {}

  async recoverInterruptedJobs() {
    await this.repository.markPendingTripAnalysisStatusesInterrupted();
  }

  async getTripAnalysisStatus(
    tripId: TripId,
  ): Promise<GetTripAnalysisStatusResponse> {
    return (
      (await this.repository.readTripAnalysisStatus(tripId)) ??
      (await this.repository.createIdleTripAnalysisStatus(tripId))
    );
  }

  async hasPendingTripAnalysis(tripId: TripId): Promise<boolean> {
    return this.withTripLock(tripId, async () => {
      const status = await this.getTripAnalysisStatus(tripId);
      return isPendingTripAnalysisStatus(status.status);
    });
  }

  async enqueueTripAnalysis(
    input: AnalyzeTripRequest,
  ): Promise<GetTripAnalysisStatusResponse> {
    return this.withTripLock(input.trip_id, async () => {
      const tripId = input.trip_id;
      const requestedCategories = resolveRequestedCategories(input.categories);
      const activeJob = this.activeJobs.get(tripId);
      let currentStatus = await this.getTripAnalysisStatus(tripId);

      if (isPendingTripAnalysisStatus(currentStatus.status) && !activeJob) {
        currentStatus = await this.repository.saveTripAnalysisStatus(
          buildInterruptedTripAnalysisStatus(
            currentStatus,
            await this.repository.findTripOutputPath(tripId),
          ),
        );
      }

      const requestedAt = new Date().toISOString();
      const nextQueue = [...(this.queuedJobs.get(tripId) ?? [])];
      const queuedCategories = new Set(nextQueue.map((job) => job.category));
      let queuedCount = 0;

      const nextCategories = currentStatus.categories.map((categoryStatus) => {
        if (!requestedCategories.includes(categoryStatus.category)) {
          return categoryStatus;
        }

        if (
          isPendingTripAnalysisStatus(categoryStatus.status) ||
          queuedCategories.has(categoryStatus.category)
        ) {
          return categoryStatus;
        }

        if (categoryStatus.has_result && input.force_refresh !== true) {
          return categoryStatus;
        }

        queuedCategories.add(categoryStatus.category);
        nextQueue.push({
          category: categoryStatus.category,
          overrideInstructions: input.override_instructions,
        });
        queuedCount += 1;

        return {
          ...categoryStatus,
          status: "queued" as const,
          requested_at: requestedAt,
          started_at: null,
          finished_at: null,
          error: undefined,
        };
      });

      if (queuedCount === 0) {
        return currentStatus;
      }

      this.queuedJobs.set(tripId, nextQueue);

      if (!activeJob) {
        this.sessionErrors.delete(tripId);
      }

      const queuedStatus = await this.repository.saveTripAnalysisStatus({
        trip_id: tripId,
        status:
          activeJob && currentStatus.categories.some((item) => item.status === "running")
            ? "running"
            : "queued",
        requested_at: requestedAt,
        started_at: activeJob ? currentStatus.started_at ?? null : null,
        finished_at: null,
        output_path:
          currentStatus.output_path ?? (await this.repository.findTripOutputPath(tripId)),
        categories: nextCategories,
      });

      if (!activeJob) {
        this.startTripQueueProcessor(tripId);
      }

      return queuedStatus;
    });
  }

  private startTripQueueProcessor(tripId: TripId) {
    const job = this.processQueuedJobs(tripId);
    this.activeJobs.set(tripId, job);

    void job.finally(() => {
      if (this.activeJobs.get(tripId) === job) {
        this.activeJobs.delete(tripId);
      }

      if ((this.queuedJobs.get(tripId)?.length ?? 0) === 0) {
        this.queuedJobs.delete(tripId);
      }

      this.sessionErrors.delete(tripId);
    });
  }

  private async processQueuedJobs(tripId: TripId) {
    while (true) {
      const nextJob = await this.prepareNextQueuedJob(tripId);

      if (!nextJob) {
        return;
      }

      try {
        const outputPath = await this.executeJob({
          trip_id: tripId,
          categories: [nextJob.category],
          override_instructions: nextJob.overrideInstructions,
          save_output: true,
          force_refresh: true,
        });
        await this.markCategoryCompleted(tripId, nextJob.category, outputPath);
      } catch (error) {
        await this.markCategoryFailed(tripId, nextJob.category, error);
      }
    }
  }

  private async prepareNextQueuedJob(tripId: TripId) {
    return this.withTripLock(tripId, async () => {
      const queue = this.queuedJobs.get(tripId) ?? [];

      if (queue.length === 0) {
        return null;
      }

      const [job, ...rest] = queue;
      const currentStatus = await this.getTripAnalysisStatus(tripId);
      const startedAt = new Date().toISOString();

      this.queuedJobs.set(tripId, rest);

      await this.repository.saveTripAnalysisStatus({
        trip_id: tripId,
        status: "running",
        requested_at: currentStatus.requested_at ?? startedAt,
        started_at: currentStatus.started_at ?? startedAt,
        finished_at: null,
        output_path: currentStatus.output_path ?? null,
        categories: currentStatus.categories.map((categoryStatus) =>
          categoryStatus.category === job.category
            ? {
                ...categoryStatus,
                status: "running",
                started_at: startedAt,
                finished_at: null,
                error: undefined,
              }
            : categoryStatus,
        ),
      });

      return job;
    });
  }

  private async markCategoryCompleted(
    tripId: TripId,
    category: TripAnalysisCategory,
    outputPath: string,
  ) {
    await this.withTripLock(tripId, async () => {
      const currentStatus = await this.getTripAnalysisStatus(tripId);
      const finishedAt = new Date().toISOString();
      const remainingQueueLength = this.queuedJobs.get(tripId)?.length ?? 0;
      const sessionError = this.sessionErrors.get(tripId);

      await this.repository.saveTripAnalysisStatus({
        trip_id: tripId,
        status:
          remainingQueueLength > 0
            ? "queued"
            : sessionError
              ? "failed"
              : "completed",
        requested_at: currentStatus.requested_at ?? finishedAt,
        started_at: currentStatus.started_at ?? finishedAt,
        finished_at: remainingQueueLength > 0 ? null : finishedAt,
        output_path: outputPath,
        categories: currentStatus.categories.map((categoryStatus) =>
          categoryStatus.category === category
            ? {
                ...categoryStatus,
                status: "completed",
                finished_at: finishedAt,
                collected_at: finishedAt,
                error: undefined,
              }
            : categoryStatus,
        ),
        error: remainingQueueLength > 0 ? undefined : sessionError,
      });
    });
  }

  private async markCategoryFailed(
    tripId: TripId,
    category: TripAnalysisCategory,
    error: unknown,
  ) {
    const backgroundError = toBackgroundJobError(error);
    this.sessionErrors.set(tripId, backgroundError);

    await this.withTripLock(tripId, async () => {
      const currentStatus = await this.getTripAnalysisStatus(tripId);
      const finishedAt = new Date().toISOString();
      const remainingQueueLength = this.queuedJobs.get(tripId)?.length ?? 0;

      await this.repository.saveTripAnalysisStatus({
        trip_id: tripId,
        status: remainingQueueLength > 0 ? "queued" : "failed",
        requested_at: currentStatus.requested_at ?? finishedAt,
        started_at: currentStatus.started_at ?? finishedAt,
        finished_at: remainingQueueLength > 0 ? null : finishedAt,
        output_path:
          currentStatus.output_path ?? (await this.repository.findTripOutputPath(tripId)),
        categories: currentStatus.categories.map((categoryStatus) =>
          categoryStatus.category === category
            ? {
                ...categoryStatus,
                status: "failed",
                finished_at: finishedAt,
                error: backgroundError,
              }
            : categoryStatus,
        ),
        error: remainingQueueLength > 0 ? undefined : backgroundError,
      });
    });
  }

  private async withTripLock<T>(
    tripId: TripId,
    task: () => Promise<T>,
  ): Promise<T> {
    const previousLock = this.tripLocks.get(tripId) ?? Promise.resolve();
    let releaseLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockChain = previousLock.then(
      () => currentLock,
      () => currentLock,
    );

    this.tripLocks.set(tripId, lockChain);

    await previousLock;

    try {
      return await task();
    } finally {
      releaseLock();

      if (this.tripLocks.get(tripId) === lockChain) {
        this.tripLocks.delete(tripId);
      }
    }
  }
}

function resolveRequestedCategories(
  categories?: AnalyzeTripRequest["categories"],
): TripAnalysisCategory[] {
  const selected = new Set(categories ?? ALL_TRIP_ANALYSIS_CATEGORIES);
  return ALL_TRIP_ANALYSIS_CATEGORIES.filter((category) => selected.has(category));
}

function isPendingTripAnalysisStatus(status: TripAnalysisStatus) {
  return status === "queued" || status === "running";
}

function buildInterruptedTripAnalysisStatus(
  currentStatus: GetTripAnalysisStatusResponse,
  outputPath: string | null,
): TripAnalysisStatusInput {
  const finishedAt = new Date().toISOString();

  return {
    trip_id: currentStatus.trip_id,
    status: "interrupted",
    requested_at: currentStatus.requested_at ?? null,
    started_at: currentStatus.started_at ?? null,
    finished_at: finishedAt,
    output_path: outputPath,
    categories: currentStatus.categories.map((categoryStatus) =>
      isPendingTripAnalysisStatus(categoryStatus.status)
        ? {
            ...categoryStatus,
            status: "interrupted",
            finished_at: finishedAt,
            error: {
              code: "INTERNAL_ERROR",
              message: "이전 분석 상태를 복구하지 못해 중단 처리했습니다.",
            },
          }
        : categoryStatus,
    ),
    error: {
      code: "INTERNAL_ERROR",
      message: "이전 분석 상태를 복구하지 못해 중단 처리했습니다.",
    },
  };
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
