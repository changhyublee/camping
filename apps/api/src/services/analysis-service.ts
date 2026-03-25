import type {
  AiJobEvent,
  AnalyzeTripRequest,
  AnalyzeTripResponse,
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
  GetOutputResponse,
  HistoryRecord,
  PlanningAssistantResponse,
  PrecheckItemInput,
  SaveOutputRequest,
  SaveOutputResponse,
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
import { AnalysisJobManager } from "./analysis-job-manager";
import { EquipmentMetadataJobManager } from "./equipment-metadata-job-manager";
import type { CampsiteTipSearchClient } from "./campsite-tip-service";
import type { EquipmentMetadataSearchClient } from "./equipment-metadata-service";
import type { AnalysisModelClient } from "./openai-client";
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
  private readonly aiJobEventBroker = new AiJobEventBroker();

  constructor(
    private readonly repository: CampingRepository,
    private readonly modelClient: AnalysisModelClient,
    private readonly equipmentMetadataClient: EquipmentMetadataSearchClient,
    private readonly campsiteTipClient: CampsiteTipSearchClient,
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
  }

  async initialize() {
    await this.analysisJobManager.recoverInterruptedJobs();
    await this.metadataJobManager.recoverInterruptedJobs();
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
    return this.repository.updateHistory(historyId, history);
  }

  async deleteHistory(historyId: string) {
    await this.repository.deleteHistory(historyId);
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
    const [analysisSummary, metadataSummary] = await Promise.all([
      this.analysisJobManager.cancelAllTripAnalyses(),
      this.metadataJobManager.cancelAllDurableMetadataRefreshes(),
    ]);

    return {
      status: "cancelled",
      cancelled_analysis_trip_count: analysisSummary.cancelledTripCount,
      cancelled_analysis_category_count: analysisSummary.cancelledCategoryCount,
      cancelled_metadata_item_count: metadataSummary.cancelledItemCount,
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
