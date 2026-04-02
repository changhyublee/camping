import type {
  AiJobEvent,
  AnalyzeTripRequest,
  AnalyzeTripResponse,
  AddHistoryRetrospectiveResponse,
  CampsiteTipsResearch,
  CancelAllAiJobsResponse,
  CreateDataBackupResponse,
  Companion,
  CompanionInput,
  ConsumableEquipmentItemInput,
  DataBackupSnapshot,
  DurableEquipmentItemInput,
  DurableMetadataJobStatusResponse,
  EquipmentCatalog,
  EquipmentCategoriesData,
  EquipmentCategory,
  EquipmentCategoryCreateInput,
  EquipmentSection,
  EquipmentCategoryUpdateInput,
  ExternalLink,
  ExternalLinkInput,
  GetHistoryLearningResponse,
  GetOutputResponse,
  GetUserLearningResponse,
  HistoryRecord,
  PlanningAssistantResponse,
  PrecheckItemInput,
  RetrospectiveEntryInput,
  SaveOutputRequest,
  SaveOutputResponse,
  SendTripAnalysisEmailResponse,
  TripDraft,
  TripAnalysisCategory,
  TripId,
  ValidateTripResponse,
  Vehicle,
  VehicleInput,
} from "@camping/shared";
import { ALL_TRIP_ANALYSIS_CATEGORIES } from "@camping/shared";
import type { CampingRepository } from "../file-store/camping-repository";
import type { DataBackupReason } from "../file-store/local-data-backup";
import { AppError } from "./app-error";
import { AiJobEventBroker } from "./ai-job-event-broker";
import type {
  AnalysisEmailClient,
  AnalysisEmailRecipient,
} from "./analysis-email-service";
import { AnalysisJobManager } from "./analysis-job-manager";
import { EquipmentMetadataJobManager } from "./equipment-metadata-job-manager";
import type { CampsiteTipSearchClient } from "./campsite-tip-service";
import type { EquipmentMetadataSearchClient } from "./equipment-metadata-service";
import type { AnalysisModelClient } from "./openai-client";
import { UserLearningJobManager } from "./user-learning-job-manager";
import type { UserLearningClient } from "./user-learning-service";
import { runPlanningAssistant } from "./planning-assistant";
import { buildAnalysisPrompt } from "./prompt-builder";
import {
  composeTripAnalysisMarkdown,
  createEmptyTripAnalysisResultsCache,
  extractTripAnalysisCategoryMarkdown,
  upsertTripAnalysisCategoryResult,
} from "./trip-analysis-composer";
import { validateTripBundle } from "./trip-validation";

type EquipmentItemInput =
  | DurableEquipmentItemInput
  | ConsumableEquipmentItemInput
  | PrecheckItemInput;

export class AnalysisService {
  private readonly analysisJobManager: AnalysisJobManager;
  private readonly metadataJobManager: EquipmentMetadataJobManager;
  private readonly userLearningJobManager: UserLearningJobManager;
  private readonly aiJobEventBroker = new AiJobEventBroker();

  constructor(
    private readonly repository: CampingRepository,
    private readonly modelClient: AnalysisModelClient,
    private readonly analysisEmailClient: AnalysisEmailClient,
    private readonly equipmentMetadataClient: EquipmentMetadataSearchClient,
    private readonly campsiteTipClient: CampsiteTipSearchClient,
    private readonly userLearningClient: UserLearningClient,
  ) {
    this.analysisJobManager = new AnalysisJobManager(
      repository,
      async (input, signal) => this.executeTripAnalysis(input, signal),
      this.aiJobEventBroker,
    );
    this.metadataJobManager = new EquipmentMetadataJobManager(
      repository,
      equipmentMetadataClient,
      this.aiJobEventBroker,
      3,
    );
    this.userLearningJobManager = new UserLearningJobManager(
      repository,
      async (jobInput) =>
        this.executeUserLearning(jobInput.triggerHistoryId, jobInput.signal),
      this.aiJobEventBroker,
    );
  }

  async initialize() {
    await this.analysisJobManager.recoverInterruptedJobs();
    await this.metadataJobManager.recoverInterruptedJobs();
    await this.userLearningJobManager.recoverInterruptedJobs();
  }

  async listTrips() {
    return this.repository.listTripSummaries();
  }

  async getHealthStatus() {
    return this.modelClient.getHealthStatus();
  }

  async listDataBackups(): Promise<DataBackupSnapshot[]> {
    return this.repository.listDataBackups();
  }

  async createDataBackup(
    reason: DataBackupReason = "manual",
  ): Promise<CreateDataBackupResponse> {
    const item = await this.repository.createDataBackup(reason);

    if (!item) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        "백업할 로컬 운영 데이터가 없습니다.",
        404,
      );
    }

    return { item };
  }

  async getTrip(tripId: TripId) {
    return this.repository.readTrip(tripId);
  }

  async createTrip(input: TripDraft) {
    return this.repository.createTrip(input);
  }

  async updateTrip(tripId: TripId, input: TripDraft) {
    return this.repository.updateTrip(tripId, input);
  }

  async deleteTrip(tripId: TripId) {
    await this.ensureTripNotAnalyzing(tripId, "삭제");
    await this.repository.deleteTrip(tripId);
    return { status: "deleted" as const };
  }

  async archiveTrip(tripId: TripId) {
    await this.ensureTripNotAnalyzing(tripId, "히스토리 이동");
    return this.repository.archiveTrip(tripId);
  }

  async listHistory() {
    return this.repository.listHistory();
  }

  async listCompanions() {
    return (await this.repository.readCompanions()).companions;
  }

  async listVehicles() {
    return (await this.repository.readVehicles()).vehicles;
  }

  async createCompanion(input: CompanionInput): Promise<Companion> {
    return this.repository.createCompanion(input);
  }

  async updateCompanion(
    companionId: string,
    input: CompanionInput,
  ): Promise<Companion> {
    return this.repository.updateCompanion(companionId, input);
  }

  async deleteCompanion(companionId: string) {
    await this.repository.deleteCompanion(companionId);
    return { status: "deleted" as const };
  }

  async createVehicle(input: VehicleInput): Promise<Vehicle> {
    return this.repository.createVehicle(input);
  }

  async updateVehicle(vehicleId: string, input: VehicleInput): Promise<Vehicle> {
    return this.repository.updateVehicle(vehicleId, input);
  }

  async deleteVehicle(vehicleId: string) {
    await this.repository.deleteVehicle(vehicleId);
    return { status: "deleted" as const };
  }

  async getHistory(historyId: string) {
    return this.repository.readHistory(historyId);
  }

  async updateHistory(historyId: string, history: HistoryRecord) {
    const currentHistory = await this.repository.readHistory(historyId);

    return this.repository.updateHistory(historyId, {
      ...history,
      retrospectives: currentHistory.retrospectives,
    });
  }

  async addHistoryRetrospective(
    historyId: string,
    input: RetrospectiveEntryInput,
  ): Promise<AddHistoryRetrospectiveResponse> {
    await this.repository.readHistory(historyId);
    const item = await this.repository.appendHistoryRetrospective(historyId, input);
    const learningStatus =
      await this.userLearningJobManager.enqueueRetrospectiveLearning(historyId);

    return {
      item,
      learning_status: learningStatus,
    };
  }

  async getHistoryLearning(
    historyId: string,
  ): Promise<GetHistoryLearningResponse> {
    await this.repository.readHistory(historyId);

    return {
      item: await this.repository.readHistoryLearningInsight(historyId),
    };
  }

  async getUserLearning(): Promise<GetUserLearningResponse> {
    const [profile, status] = await Promise.all([
      this.repository.readUserLearningProfile(),
      this.userLearningJobManager.getUserLearningStatus(),
    ]);

    return {
      profile,
      status,
    };
  }

  async deleteHistory(historyId: string) {
    const history = await this.repository.readHistory(historyId);
    await this.repository.deleteHistory(historyId);

    if (history.retrospectives.length > 0) {
      await this.userLearningJobManager.enqueueUserLearningRebuild(null);
    }

    return { status: "deleted" as const };
  }

  async getEquipmentCatalog(): Promise<EquipmentCatalog> {
    return this.repository.readEquipmentCatalog();
  }

  async getEquipmentCategories(): Promise<EquipmentCategoriesData> {
    return this.repository.readEquipmentCategories();
  }

  async createEquipmentCategory(
    section: EquipmentSection,
    input: EquipmentCategoryCreateInput,
  ): Promise<EquipmentCategory> {
    return this.repository.createEquipmentCategory(section, input);
  }

  async updateEquipmentCategory(
    section: EquipmentSection,
    categoryId: string,
    input: EquipmentCategoryUpdateInput,
  ): Promise<EquipmentCategory> {
    return this.repository.updateEquipmentCategory(section, categoryId, input);
  }

  async deleteEquipmentCategory(section: EquipmentSection, categoryId: string) {
    await this.repository.deleteEquipmentCategory(section, categoryId);
    return { status: "deleted" as const };
  }

  async createEquipmentItem(
    section: EquipmentSection,
    input: EquipmentItemInput,
  ) {
    return this.repository.createEquipmentItem(section, input);
  }

  async updateEquipmentItem(
    section: EquipmentSection,
    itemId: string,
    input: EquipmentItemInput,
  ) {
    return this.repository.updateEquipmentItem(section, itemId, input);
  }

  async deleteEquipmentItem(section: EquipmentSection, itemId: string) {
    if (section === "durable") {
      await this.metadataJobManager.cancelDurableMetadataRefresh(itemId);
    }

    await this.repository.deleteEquipmentItem(section, itemId);
    return { status: "deleted" as const };
  }

  async refreshDurableEquipmentMetadata(itemId: string) {
    return this.metadataJobManager.enqueueDurableMetadataRefresh(itemId);
  }

  async listDurableMetadataJobStatuses(): Promise<DurableMetadataJobStatusResponse[]> {
    return this.metadataJobManager.listDurableMetadataJobStatuses();
  }

  async listLinks() {
    return (await this.repository.readLinks()).items;
  }

  async createLink(input: ExternalLinkInput): Promise<ExternalLink> {
    return this.repository.createLink(input);
  }

  async updateLink(linkId: string, input: ExternalLinkInput): Promise<ExternalLink> {
    return this.repository.updateLink(linkId, input);
  }

  async deleteLink(linkId: string) {
    await this.repository.deleteLink(linkId);
    return { status: "deleted" as const };
  }

  async validateTrip(tripId: TripId): Promise<ValidateTripResponse> {
    const bundle = await this.repository.loadTripBundle(tripId);
    const { warnings } = validateTripBundle(bundle);

    return {
      status: "ok",
      warnings,
    };
  }

  async assistTripPlanning(
    tripId: TripId,
    message: string,
  ): Promise<PlanningAssistantResponse> {
    const bundle = await this.repository.loadTripBundle(tripId);
    const result = await runPlanningAssistant({
      bundle,
      message,
      modelClient: this.modelClient,
    });

    return {
      trip_id: tripId,
      warnings: result.warnings,
      assistant_message: result.assistant_message,
      actions: result.actions,
    };
  }

  async analyzeTrip(input: AnalyzeTripRequest): Promise<AnalyzeTripResponse> {
    if (input.save_output === false) {
      throw new AppError(
        "TRIP_INVALID",
        "비동기 분석은 save_output=false 를 지원하지 않습니다.",
        400,
      );
    }

    await this.repository.readTrip(input.trip_id);
    return this.analysisJobManager.enqueueTripAnalysis(input);
  }

  async cancelAllAiJobs(): Promise<CancelAllAiJobsResponse> {
    const [analysisSummary, metadataSummary, userLearningSummary] = await Promise.all([
      this.analysisJobManager.cancelAllTripAnalyses(),
      this.metadataJobManager.cancelAllDurableMetadataRefreshes(),
      this.userLearningJobManager.cancelAllUserLearning(),
    ]);

    return {
      status: "cancelled",
      cancelled_analysis_trip_count: analysisSummary.cancelledTripCount,
      cancelled_analysis_category_count: analysisSummary.cancelledCategoryCount,
      cancelled_metadata_item_count: metadataSummary.cancelledItemCount,
      cancelled_user_learning_job_count: userLearningSummary.cancelledJobCount,
    };
  }

  subscribeAiJobEvents(listener: (event: AiJobEvent) => void) {
    return this.aiJobEventBroker.subscribe(listener);
  }

  createAiJobReadyEvent() {
    return this.aiJobEventBroker.createReadyEvent();
  }

  createAiJobHeartbeatEvent() {
    return this.aiJobEventBroker.createHeartbeatEvent();
  }

  async saveOutput(input: SaveOutputRequest): Promise<SaveOutputResponse> {
    await this.repository.readTrip(input.trip_id);
    const outputPath = await this.repository.saveOutput(
      input.trip_id,
      input.markdown,
    );

    return {
      status: "saved",
      output_path: outputPath,
    };
  }

  async getOutput(tripId: TripId): Promise<GetOutputResponse> {
    return this.repository.readOutput(tripId);
  }

  async getTripAnalysisStatus(tripId: TripId): Promise<AnalyzeTripResponse> {
    await this.repository.readTrip(tripId);
    return this.analysisJobManager.getTripAnalysisStatus(tripId);
  }

  async sendTripAnalysisEmail(
    tripId: TripId,
    recipientCompanionIds: string[],
  ): Promise<SendTripAnalysisEmailResponse> {
    const trip = await this.repository.readTrip(tripId);
    const analysisStatus = await this.analysisJobManager.getTripAnalysisStatus(tripId);
    const normalizedRecipientCompanionIds = [...new Set(recipientCompanionIds)];

    if (analysisStatus.status === "queued" || analysisStatus.status === "running") {
      throw new AppError(
        "CONFLICT",
        "전체 분석이 아직 진행 중이라 메일을 발송할 수 없습니다.",
        409,
      );
    }

    if (analysisStatus.completed_category_count !== analysisStatus.total_category_count) {
      throw new AppError(
        "CONFLICT",
        "전체 분석 결과가 모두 모인 뒤에만 메일을 발송할 수 있습니다.",
        409,
      );
    }

    const tripCompanionIds = new Set(trip.party.companion_ids);
    const invalidRecipientIds = normalizedRecipientCompanionIds.filter(
      (companionId) => !tripCompanionIds.has(companionId),
    );

    if (invalidRecipientIds.length > 0) {
      throw new AppError(
        "TRIP_INVALID",
        `현재 계획 동행자가 아닌 메일 수신 대상이 포함되어 있습니다: ${invalidRecipientIds.join(", ")}`,
        400,
      );
    }

    const companionMap = new Map(
      (await this.repository.readCompanions()).companions.map((companion) => [
        companion.id,
        companion,
      ]),
    );
    const recipients = normalizedRecipientCompanionIds.map((companionId) => {
      const companion = companionMap.get(companionId);

      if (!companion) {
        throw new AppError(
          "TRIP_INVALID",
          `동행자 정보를 찾을 수 없습니다: ${companionId}`,
          400,
        );
      }

      if (!companion.email?.trim()) {
        throw new AppError(
          "TRIP_INVALID",
          `메일 주소가 없는 동행자는 발송 대상으로 선택할 수 없습니다: ${companion.name}`,
          400,
        );
      }

      return {
        companionId: companion.id,
        name: companion.name,
        email: companion.email.trim(),
      } satisfies AnalysisEmailRecipient;
    });

    await this.repository.updateTrip(tripId, {
      ...trip,
      notifications: {
        email_recipient_companion_ids: normalizedRecipientCompanionIds,
      },
    });

    const output = await this.repository.readOutput(tripId);
    const emailResult = await this.analysisEmailClient.sendAnalysisResultEmail({
      tripTitle: trip.title,
      outputPath: output.output_path,
      markdown: output.markdown,
      recipients,
    });

    return {
      trip_id: tripId,
      sent_at: emailResult.sentAt,
      sent_count: emailResult.sentCount,
      recipients: emailResult.recipients.map((recipient) => ({
        companion_id: recipient.companionId,
        name: recipient.name,
        email: recipient.email,
      })),
      output_path: output.output_path,
    };
  }

  private async executeTripAnalysis(
    input: AnalyzeTripRequest,
    signal?: AbortSignal,
  ): Promise<string> {
    const categories = resolveTripAnalysisCategories(input.categories);

    if (categories.length !== 1) {
      throw new AppError(
        "TRIP_INVALID",
        "백그라운드 분석 작업은 한 번에 하나의 분석 섹션만 실행합니다.",
        400,
      );
    }

    const [category] = categories;
    throwIfAborted(signal);
    const bundle = await this.repository.loadTripBundle(input.trip_id);
    const { warnings } = validateTripBundle(bundle);
    const campsiteTips =
      category === "campsite_tips"
        ? await this.collectCampsiteTips(bundle, signal)
        : null;
    const bundleWithCampsiteTips = campsiteTips
      ? {
          ...bundle,
          caches: {
            ...bundle.caches,
            campsiteTips: [
              ...bundle.caches.campsiteTips.filter(
                (cache) => cache.name !== `${bundle.trip.trip_id}-campsite-tips.json`,
              ),
              {
                name: `${bundle.trip.trip_id}-campsite-tips.json`,
                content: campsiteTips,
              },
            ],
          },
        }
      : bundle;
    const [prompts, referenceDocuments] = await Promise.all([
      this.repository.loadPromptFiles(),
      this.repository.loadReferenceDocuments(),
    ]);

    const userPrompt = buildAnalysisPrompt({
      bundle: bundleWithCampsiteTips,
      analysisPrompt: prompts.analysis,
      categories: [category],
      referenceDocuments,
      warnings,
      overrideInstructions: input.override_instructions,
    });

    throwIfAborted(signal);
    const rawMarkdown = await this.modelClient.generateMarkdown({
      systemPrompt: prompts.system,
      userPrompt,
      signal,
    });
    const markdown = extractTripAnalysisCategoryMarkdown(category, rawMarkdown);

    if (!markdown.trim()) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        `분석 섹션 결과가 비어 있습니다: ${category}`,
        502,
      );
    }

    const currentResults =
      (await this.repository.readTripAnalysisResultsCache(input.trip_id)) ??
      createEmptyTripAnalysisResultsCache(bundle.trip);
    throwIfAborted(signal);
    const nextResults = upsertTripAnalysisCategoryResult(currentResults, {
      category,
      markdown,
    });

    await this.repository.saveTripAnalysisResultsCache(nextResults);
    const composedMarkdown = composeTripAnalysisMarkdown({
      title: bundle.trip.title,
      resultsCache: nextResults,
    });

    throwIfAborted(signal);
    return this.repository.saveOutput(input.trip_id, composedMarkdown);
  }

  private async collectCampsiteTips(
    bundle: Awaited<ReturnType<CampingRepository["loadTripBundle"]>>,
    signal?: AbortSignal,
  ): Promise<CampsiteTipsResearch | null> {
    const campsiteName = bundle.trip.location?.campsite_name?.trim();

    if (!campsiteName) {
      return null;
    }

    const cached = bundle.caches.campsiteTips.find(
      (entry) => entry.name === `${bundle.trip.trip_id}-campsite-tips.json`,
    )?.content;

    if (cached && isFreshResearch(cached)) {
      return cached;
    }

    try {
      throwIfAborted(signal);
      const research = await this.campsiteTipClient.collectCampsiteTips({
        bundle,
        signal,
      });
      throwIfAborted(signal);
      await this.repository.saveCampsiteTipResearch(bundle.trip.trip_id, research);
      return research;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }

      if (cached) {
        return cached;
      }

      const fallback = createFailedResearch(bundle, error);
      await this.repository.saveCampsiteTipResearch(bundle.trip.trip_id, fallback);
      return fallback;
    }
  }

  private async executeUserLearning(
    triggerHistoryId: string | null,
    signal?: AbortSignal,
  ): Promise<{
    profileExists: boolean;
    sourceHistoryIds: string[];
    sourceEntryCount: number;
  }> {
    const [prompts, histories] = await Promise.all([
      this.repository.loadUserLearningPromptFiles(),
      this.repository.listHistory(),
    ]);
    const historiesWithRetrospectives = histories.filter(
      (history) => history.retrospectives.length > 0,
    );

    if (historiesWithRetrospectives.length === 0) {
      await this.repository.deleteUserLearningProfile();

      return {
        profileExists: false,
        sourceHistoryIds: [],
        sourceEntryCount: 0,
      };
    }

    const existingInsightMap = new Map(
      (await this.repository.listHistoryLearningInsights()).map((insight) => [
        insight.history_id,
        insight,
      ]),
    );
    const targetHistories = historiesWithRetrospectives.filter(
      (history) =>
        history.history_id === triggerHistoryId ||
        !existingInsightMap.has(history.history_id),
    );

    for (const history of targetHistories) {
      throwIfAborted(signal);
      const outputMarkdown = await this.repository.loadHistoryOutputMarkdown(history);
      const insight = await this.userLearningClient.analyzeHistoryRetrospective({
        history,
        outputMarkdown,
        promptTemplate: prompts.historyRetrospectiveLearning,
        signal,
      });

      throwIfAborted(signal);
      await this.repository.saveHistoryLearningInsight(insight);
    }

    const historyInsightMap = new Map(
      (await this.repository.listHistoryLearningInsights()).map((insight) => [
        insight.history_id,
        insight,
      ]),
    );
    const validInsights = historiesWithRetrospectives
      .map((history) => historyInsightMap.get(history.history_id) ?? null)
      .filter((insight): insight is NonNullable<typeof insight> => insight !== null);

    if (validInsights.length === 0) {
      await this.repository.deleteUserLearningProfile();
      return {
        profileExists: false,
        sourceHistoryIds: [],
        sourceEntryCount: 0,
      };
    }

    throwIfAborted(signal);
    const profile = await this.userLearningClient.synthesizeUserLearningProfile({
      insights: validInsights,
      promptTemplate: prompts.userLearningProfile,
      signal,
    });

    throwIfAborted(signal);
    await this.repository.saveUserLearningProfile(profile);

    return {
      profileExists: true,
      sourceHistoryIds: profile.source_history_ids,
      sourceEntryCount: profile.source_entry_count,
    };
  }

  private async ensureTripNotAnalyzing(tripId: TripId, actionLabel: string) {
    if (await this.analysisJobManager.hasPendingTripAnalysis(tripId)) {
      throw new AppError(
        "CONFLICT",
        `현재 분석이 진행 중이라 계획을 ${actionLabel}할 수 없습니다: ${tripId}`,
        409,
      );
    }
  }
}

const CAMPSITE_TIP_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function isFreshResearch(research: CampsiteTipsResearch) {
  if (research.lookup_status === "failed") {
    return false;
  }

  const searchedAt = Date.parse(research.searched_at);

  if (Number.isNaN(searchedAt)) {
    return false;
  }

  return Date.now() - searchedAt <= CAMPSITE_TIP_CACHE_MAX_AGE_MS;
}

function createFailedResearch(
  bundle: Awaited<ReturnType<CampingRepository["loadTripBundle"]>>,
  error: unknown,
): CampsiteTipsResearch {
  return {
    lookup_status: "failed",
    searched_at: new Date().toISOString(),
    query: [
      bundle.trip.location?.campsite_name,
      bundle.trip.location?.region,
      "후기 블로그",
    ]
      .filter(Boolean)
      .join(" "),
    campsite_name: bundle.trip.location?.campsite_name ?? "미입력 캠핑장",
    region: bundle.trip.location?.region,
    summary:
      error instanceof Error
        ? `캠핑장 후기 tip 수집에 실패했습니다. ${error.message}`
        : "캠핑장 후기 tip 수집에 실패했습니다.",
    tip_items: [],
    best_site_items: [],
    sources: [],
  };
}

function resolveTripAnalysisCategories(
  categories?: TripAnalysisCategory[],
): TripAnalysisCategory[] {
  const selected = new Set(categories ?? ALL_TRIP_ANALYSIS_CATEGORIES);
  return ALL_TRIP_ANALYSIS_CATEGORIES.filter((category) => selected.has(category));
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("사용자 요청으로 AI 분석이 중단되었습니다.");
    error.name = "AbortError";
    throw error;
  }
}
