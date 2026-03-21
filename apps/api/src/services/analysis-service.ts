import type {
  AnalyzeTripRequest,
  AnalyzeTripResponse,
  Companion,
  CompanionInput,
  ConsumableEquipmentItemInput,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentSection,
  ExternalLink,
  ExternalLinkInput,
  GetOutputResponse,
  HistoryRecord,
  PlanningAssistantResponse,
  PrecheckItemInput,
  SaveOutputRequest,
  SaveOutputResponse,
  TripDraft,
  TripId,
  ValidateTripResponse,
} from "@camping/shared";
import type { CampingRepository } from "../file-store/camping-repository";
import { isAppError, toApiError } from "./app-error";
import type { AnalysisModelClient } from "./openai-client";
import { runPlanningAssistant } from "./planning-assistant";
import { buildAnalysisPrompt } from "./prompt-builder";
import { validateTripBundle } from "./trip-validation";

type EquipmentItemInput =
  | DurableEquipmentItemInput
  | ConsumableEquipmentItemInput
  | PrecheckItemInput;

export class AnalysisService {
  constructor(
    private readonly repository: CampingRepository,
    private readonly modelClient: AnalysisModelClient,
  ) {}

  async listTrips() {
    return this.repository.listTripSummaries();
  }

  async getHealthStatus() {
    return this.modelClient.getHealthStatus();
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
    await this.repository.deleteTrip(tripId);
    return { status: "deleted" as const };
  }

  async archiveTrip(tripId: TripId) {
    return this.repository.archiveTrip(tripId);
  }

  async listHistory() {
    return this.repository.listHistory();
  }

  async listCompanions() {
    return (await this.repository.readCompanions()).companions;
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
    await this.repository.deleteEquipmentItem(section, itemId);
    return { status: "deleted" as const };
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
    const bundle = await this.repository.loadTripBundle(input.trip_id);
    const { warnings } = validateTripBundle(bundle);
    const [prompts, referenceDocuments] = await Promise.all([
      this.repository.loadPromptFiles(),
      this.repository.loadReferenceDocuments(),
    ]);

    const userPrompt = buildAnalysisPrompt({
      bundle,
      analysisPrompt: prompts.analysis,
      referenceDocuments,
      warnings,
      overrideInstructions: input.override_instructions,
    });

    const markdown = await this.modelClient.generateMarkdown({
      systemPrompt: prompts.system,
      userPrompt,
    });

    if (!input.save_output) {
      return {
        trip_id: input.trip_id,
        status: "completed",
        warnings,
        markdown,
        output_path: null,
      };
    }

    try {
      const outputPath = await this.repository.saveOutput(input.trip_id, markdown);

      return {
        trip_id: input.trip_id,
        status: "completed",
        warnings,
        markdown,
        output_path: outputPath,
      };
    } catch (error) {
      if (isAppError(error) && error.code === "OUTPUT_SAVE_FAILED") {
        return {
          trip_id: input.trip_id,
          status: "failed",
          warnings,
          markdown,
          output_path: null,
          error: toApiError(error),
        };
      }

      throw error;
    }
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
}
