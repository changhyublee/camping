import type { FastifyInstance } from "fastify";
import {
  analyzeTripRequestSchema,
  companionIdSchema,
  companionInputSchema,
  consumableEquipmentItemInputSchema,
  durableEquipmentItemInputSchema,
  equipmentSectionSchema,
  externalLinkInputSchema,
  historyRecordSchema,
  planningAssistantRequestSchema,
  precheckItemInputSchema,
  saveOutputRequestSchema,
  tripDraftSchema,
  tripIdSchema,
  validateTripRequestSchema,
} from "@camping/shared";
import type { AnalysisService } from "../services/analysis-service";
import { AppError } from "../services/app-error";

function readIdParam(value: unknown, label: string): string {
  const parsed = tripIdSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError(
      "INVALID_TRIP_ID_FORMAT",
      `${label} 형식이 올바르지 않습니다.`,
      400,
    );
  }

  return parsed.data;
}

function readEquipmentSection(value: unknown) {
  const parsed = equipmentSectionSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError("TRIP_INVALID", "장비 섹션 값이 올바르지 않습니다.", 400);
  }

  return parsed.data;
}

function readCompanionIdParam(value: unknown) {
  const parsed = companionIdSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError("TRIP_INVALID", "동행자 ID 형식이 올바르지 않습니다.", 400);
  }

  return parsed.data;
}

function parseEquipmentBody(section: string, body: unknown) {
  switch (section) {
    case "durable": {
      const parsed = durableEquipmentItemInputSchema.safeParse(body);

      if (!parsed.success) {
        throw new AppError("TRIP_INVALID", "내구 장비 요청 형식이 올바르지 않습니다.", 400);
      }

      return parsed.data;
    }
    case "consumables": {
      const parsed = consumableEquipmentItemInputSchema.safeParse(body);

      if (!parsed.success) {
        throw new AppError("TRIP_INVALID", "소모품 요청 형식이 올바르지 않습니다.", 400);
      }

      return parsed.data;
    }
    case "precheck": {
      const parsed = precheckItemInputSchema.safeParse(body);

      if (!parsed.success) {
        throw new AppError("TRIP_INVALID", "점검 항목 요청 형식이 올바르지 않습니다.", 400);
      }

      return parsed.data;
    }
    default:
      throw new AppError("TRIP_INVALID", "장비 섹션 값이 올바르지 않습니다.", 400);
  }
}

function parseCompanionBody(body: unknown) {
  const parsed = companionInputSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError("TRIP_INVALID", "동행자 요청 형식이 올바르지 않습니다.", 400);
  }

  return parsed.data;
}

export async function registerApiRoutes(
  app: FastifyInstance,
  analysisService: AnalysisService,
) {
  app.get("/api/health", async () => analysisService.getHealthStatus());

  app.get("/api/companions", async () => ({
    items: await analysisService.listCompanions(),
  }));

  app.post("/api/companions", async (request) => {
    return {
      item: await analysisService.createCompanion(parseCompanionBody(request.body)),
    };
  });

  app.put("/api/companions/:companionId", async (request) => {
    const companionId = readCompanionIdParam(
      (request.params as { companionId?: unknown }).companionId,
    );

    return {
      item: await analysisService.updateCompanion(
        companionId,
        parseCompanionBody(request.body),
      ),
    };
  });

  app.delete("/api/companions/:companionId", async (request) => {
    const companionId = readCompanionIdParam(
      (request.params as { companionId?: unknown }).companionId,
    );

    return analysisService.deleteCompanion(companionId);
  });

  app.get("/api/trips", async () => ({
    items: await analysisService.listTrips(),
  }));

  app.post("/api/trips", async (request) => {
    const parsed = tripDraftSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError("TRIP_INVALID", "trip 생성 요청 형식이 올바르지 않습니다.", 400);
    }

    const trip = await analysisService.createTrip(parsed.data);
    return {
      trip_id: trip.trip_id,
      data: trip,
    };
  });

  app.get("/api/trips/:tripId", async (request) => {
    const tripId = readIdParam(
      (request.params as { tripId?: unknown }).tripId,
      "trip_id",
    );

    return {
      trip_id: tripId,
      data: await analysisService.getTrip(tripId),
    };
  });

  app.put("/api/trips/:tripId", async (request) => {
    const tripId = readIdParam(
      (request.params as { tripId?: unknown }).tripId,
      "trip_id",
    );
    const parsed = tripDraftSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError("TRIP_INVALID", "trip 수정 요청 형식이 올바르지 않습니다.", 400);
    }

    const trip = await analysisService.updateTrip(tripId, parsed.data);
    return {
      trip_id: tripId,
      data: trip,
    };
  });

  app.delete("/api/trips/:tripId", async (request) => {
    const tripId = readIdParam(
      (request.params as { tripId?: unknown }).tripId,
      "trip_id",
    );

    return analysisService.deleteTrip(tripId);
  });

  app.post("/api/trips/:tripId/archive", async (request) => {
    const tripId = readIdParam(
      (request.params as { tripId?: unknown }).tripId,
      "trip_id",
    );

    return {
      item: await analysisService.archiveTrip(tripId),
    };
  });

  app.post("/api/trips/:tripId/assistant", async (request) => {
    const tripId = readIdParam(
      (request.params as { tripId?: unknown }).tripId,
      "trip_id",
    );
    const parsed = planningAssistantRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError("TRIP_INVALID", "assistant 요청 형식이 올바르지 않습니다.", 400);
    }

    return analysisService.assistTripPlanning(tripId, parsed.data.message);
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

  app.get("/api/outputs/:tripId", async (request) => {
    const tripId = readIdParam(
      (request.params as { tripId?: unknown }).tripId,
      "trip_id",
    );

    return analysisService.getOutput(tripId);
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

  app.get("/api/equipment", async () => analysisService.getEquipmentCatalog());

  app.post("/api/equipment/:section/items", async (request) => {
    const section = readEquipmentSection(
      (request.params as { section?: unknown }).section,
    );
    const body = parseEquipmentBody(section, request.body);

    return {
      item: await analysisService.createEquipmentItem(section, body),
    };
  });

  app.put("/api/equipment/:section/items/:itemId", async (request) => {
    const section = readEquipmentSection(
      (request.params as { section?: unknown }).section,
    );
    const itemId = readIdParam(
      (request.params as { itemId?: unknown }).itemId,
      "item_id",
    );
    const body = parseEquipmentBody(section, request.body);

    return {
      item: await analysisService.updateEquipmentItem(section, itemId, body),
    };
  });

  app.delete("/api/equipment/:section/items/:itemId", async (request) => {
    const section = readEquipmentSection(
      (request.params as { section?: unknown }).section,
    );
    const itemId = readIdParam(
      (request.params as { itemId?: unknown }).itemId,
      "item_id",
    );

    return analysisService.deleteEquipmentItem(section, itemId);
  });

  app.get("/api/history", async () => ({
    items: await analysisService.listHistory(),
  }));

  app.get("/api/history/:historyId", async (request) => {
    const historyId = readIdParam(
      (request.params as { historyId?: unknown }).historyId,
      "history_id",
    );

    return {
      item: await analysisService.getHistory(historyId),
    };
  });

  app.put("/api/history/:historyId", async (request) => {
    const historyId = readIdParam(
      (request.params as { historyId?: unknown }).historyId,
      "history_id",
    );
    const parsed = historyRecordSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError("TRIP_INVALID", "history 수정 요청 형식이 올바르지 않습니다.", 400);
    }

    return {
      item: await analysisService.updateHistory(historyId, parsed.data),
    };
  });

  app.delete("/api/history/:historyId", async (request) => {
    const historyId = readIdParam(
      (request.params as { historyId?: unknown }).historyId,
      "history_id",
    );

    return analysisService.deleteHistory(historyId);
  });

  app.get("/api/links", async () => ({
    items: await analysisService.listLinks(),
  }));

  app.post("/api/links", async (request) => {
    const parsed = externalLinkInputSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError("TRIP_INVALID", "링크 생성 요청 형식이 올바르지 않습니다.", 400);
    }

    return {
      item: await analysisService.createLink(parsed.data),
    };
  });

  app.put("/api/links/:linkId", async (request) => {
    const linkId = readIdParam(
      (request.params as { linkId?: unknown }).linkId,
      "link_id",
    );
    const parsed = externalLinkInputSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError("TRIP_INVALID", "링크 수정 요청 형식이 올바르지 않습니다.", 400);
    }

    return {
      item: await analysisService.updateLink(linkId, parsed.data),
    };
  });

  app.delete("/api/links/:linkId", async (request) => {
    const linkId = readIdParam(
      (request.params as { linkId?: unknown }).linkId,
      "link_id",
    );

    return analysisService.deleteLink(linkId);
  });
}
