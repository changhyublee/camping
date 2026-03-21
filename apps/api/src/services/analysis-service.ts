import type {
  AnalyzeTripRequest,
  AnalyzeTripResponse,
  SaveOutputRequest,
  SaveOutputResponse,
  TripId,
  ValidateTripResponse,
} from "@camping/shared";
import { buildAnalysisPrompt } from "./prompt-builder";
import type { CampingRepository } from "../file-store/camping-repository";
import { validateTripBundle } from "./trip-validation";
import { isAppError, toApiError } from "./app-error";
import type { AnalysisModelClient } from "./openai-client";

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

  async validateTrip(tripId: TripId): Promise<ValidateTripResponse> {
    const bundle = await this.repository.loadTripBundle(tripId);
    const { warnings } = validateTripBundle(bundle);

    return {
      status: "ok",
      warnings,
    };
  }

  async analyzeTrip(
    input: AnalyzeTripRequest,
  ): Promise<AnalyzeTripResponse> {
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
}
