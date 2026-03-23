import type {
  AnalyzeTripRequest,
  GetTripAnalysisStatusResponse,
  TripAnalysisStatus,
  TripId,
} from "@camping/shared";
import type { CampingRepository } from "../file-store/camping-repository";
import { isAppError, toApiError } from "./app-error";

type AnalysisJobExecutor = (input: AnalyzeTripRequest) => Promise<string>;

export class AnalysisJobManager {
  private readonly activeJobs = new Map<TripId, Promise<void>>();
  private readonly pendingEnqueues = new Map<
    TripId,
    Promise<GetTripAnalysisStatusResponse>
  >();
  private readonly tripLocks = new Map<TripId, Promise<void>>();

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
    const existingEnqueue = this.pendingEnqueues.get(input.trip_id);

    if (existingEnqueue) {
      return existingEnqueue;
    }

    const enqueuePromise = this.withTripLock(input.trip_id, async () => {
      const tripId = input.trip_id;
      const activeJob = this.activeJobs.get(tripId);
      const currentStatus = await this.repository.readTripAnalysisStatus(tripId);

      if (currentStatus && isPendingTripAnalysisStatus(currentStatus.status)) {
        if (activeJob) {
          return currentStatus;
        }

        await this.repository.saveTripAnalysisStatus(
          buildInterruptedTripAnalysisStatus(
            currentStatus,
            await this.repository.findTripOutputPath(tripId),
          ),
        );
      }

      const queuedStatus = await this.repository.saveTripAnalysisStatus({
        trip_id: tripId,
        status: "queued",
        requested_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
        output_path: await this.repository.findTripOutputPath(tripId),
      });

      const job = this.runQueuedJob(input, queuedStatus);
      this.activeJobs.set(tripId, job);
      void job.finally(() => {
        if (this.activeJobs.get(tripId) === job) {
          this.activeJobs.delete(tripId);
        }
      });

      return queuedStatus;
    });

    this.pendingEnqueues.set(input.trip_id, enqueuePromise);

    try {
      return await enqueuePromise;
    } finally {
      if (this.pendingEnqueues.get(input.trip_id) === enqueuePromise) {
        this.pendingEnqueues.delete(input.trip_id);
      }
    }
  }

  private async runQueuedJob(
    input: AnalyzeTripRequest,
    queuedStatus: GetTripAnalysisStatusResponse,
  ) {
    const tripId = input.trip_id;
    const runningStatus = await this.repository.saveTripAnalysisStatus({
      trip_id: tripId,
      status: "running",
      requested_at: queuedStatus.requested_at ?? new Date().toISOString(),
      started_at: new Date().toISOString(),
      finished_at: null,
      output_path: queuedStatus.output_path ?? null,
    });

    try {
      const outputPath = await this.executeJob(input);
      await this.repository.saveTripAnalysisStatus({
        trip_id: tripId,
        status: "completed",
        requested_at: runningStatus.requested_at,
        started_at: runningStatus.started_at,
        finished_at: new Date().toISOString(),
        output_path: outputPath,
      });
    } catch (error) {
      await this.repository.saveTripAnalysisStatus({
        trip_id: tripId,
        status: "failed",
        requested_at: runningStatus.requested_at,
        started_at: runningStatus.started_at,
        finished_at: new Date().toISOString(),
        output_path: await this.repository.findTripOutputPath(tripId),
        error: toBackgroundJobError(error),
      });
    }
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

function isPendingTripAnalysisStatus(status: TripAnalysisStatus) {
  return status === "queued" || status === "running";
}

function buildInterruptedTripAnalysisStatus(
  currentStatus: GetTripAnalysisStatusResponse,
  outputPath: string | null,
): GetTripAnalysisStatusResponse {
  return {
    trip_id: currentStatus.trip_id,
    status: "interrupted",
    requested_at: currentStatus.requested_at ?? null,
    started_at: currentStatus.started_at ?? null,
    finished_at: new Date().toISOString(),
    output_path: outputPath,
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
