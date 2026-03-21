import type { FastifyInstance } from "fastify";
import {
  analyzeTripRequestSchema,
  saveOutputRequestSchema,
  tripIdSchema,
  validateTripRequestSchema,
} from "@camping/shared";
import { AppError } from "../services/app-error";
import type { AnalysisService } from "../services/analysis-service";

function readTripIdParam(value: unknown): string {
  const parsed = tripIdSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError(
      "INVALID_TRIP_ID_FORMAT",
      "trip_id 형식이 올바르지 않습니다.",
      400,
    );
  }

  return parsed.data;
}

export async function registerApiRoutes(
  app: FastifyInstance,
  analysisService: AnalysisService,
) {
  app.get("/api/health", async () => analysisService.getHealthStatus());

  app.get("/api/trips", async () => ({
    items: await analysisService.listTrips(),
  }));

  app.get("/api/trips/:tripId", async (request) => {
    const tripId = readTripIdParam((request.params as { tripId?: unknown }).tripId);

    return {
      trip_id: tripId,
      data: await analysisService.getTrip(tripId),
    };
  });

  app.post("/api/validate-trip", async (request) => {
    const parsed = validateTripRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(
        "INVALID_TRIP_ID_FORMAT",
        "trip_id 형식이 올바르지 않습니다.",
        400,
      );
    }

    return analysisService.validateTrip(parsed.data.trip_id);
  });

  app.post("/api/analyze-trip", async (request) => {
    const parsed = analyzeTripRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(
        "INVALID_TRIP_ID_FORMAT",
        "analyze-trip 요청 형식이 올바르지 않습니다.",
        400,
      );
    }

    return analysisService.analyzeTrip(parsed.data);
  });

  app.post("/api/outputs", async (request) => {
    const parsed = saveOutputRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(
        "INVALID_TRIP_ID_FORMAT",
        "outputs 저장 요청 형식이 올바르지 않습니다.",
        400,
      );
    }

    return analysisService.saveOutput(parsed.data);
  });
}
