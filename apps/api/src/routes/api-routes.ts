import type { FastifyInstance } from "fastify";
import {
  analyzeTripRequestSchema,
  companionIdSchema,
  companionInputSchema,
  consumableEquipmentItemInputSchema,
  durableEquipmentItemInputSchema,
  equipmentCategoryCreateInputSchema,
  equipmentCategoryIdSchema,
  equipmentCategoryUpdateInputSchema,
  equipmentSectionSchema,
  externalLinkInputSchema,
  historyRecordSchema,
  planningAssistantRequestSchema,
  precheckItemInputSchema,
  saveOutputRequestSchema,
  tripDraftSchema,
  tripIdSchema,
  validateTripRequestSchema,
  vehicleIdSchema,
  vehicleInputSchema,
} from "@camping/shared";
import type { AnalysisService } from "../services/analysis-service";
import { AppError } from "../services/app-error";

type ValidationIssue = {
  code: string;
  path: Array<string | number>;
  message: string;
  received?: unknown;
  expected?: unknown;
  validation?: unknown;
  minimum?: number | bigint;
  type?: string;
  inclusive?: boolean;
  [key: string]: unknown;
};

type SafeParseSchema<T> = {
  safeParse(
    value: unknown,
  ):
    | {
        success: true;
        data: T;
      }
    | {
        success: false;
        error: {
          issues: readonly unknown[];
        };
      };
};

type BodyErrorCode =
  | "TRIP_INVALID"
  | "INVALID_TRIP_ID_FORMAT"
  | {
      code: "INVALID_TRIP_ID_FORMAT";
      field: string;
      fallbackCode?: "TRIP_INVALID";
    };

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

function readEquipmentCategoryIdParam(value: unknown) {
  const parsed = equipmentCategoryIdSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError("TRIP_INVALID", "장비 카테고리 ID 형식이 올바르지 않습니다.", 400);
  }

  return parsed.data;
}

function readVehicleIdParam(value: unknown) {
  const parsed = vehicleIdSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError("TRIP_INVALID", "차량 ID 형식이 올바르지 않습니다.", 400);
  }

  return parsed.data;
}

function parseEquipmentBody(section: string, body: unknown) {
  switch (section) {
    case "durable": {
      return parseBodyOrThrow(
        "내구 장비 요청",
        durableEquipmentItemInputSchema,
        body,
      );
    }
    case "consumables": {
      return parseBodyOrThrow(
        "소모품 요청",
        consumableEquipmentItemInputSchema,
        body,
      );
    }
    case "precheck": {
      return parseBodyOrThrow(
        "점검 항목 요청",
        precheckItemInputSchema,
        body,
      );
    }
    default:
      throw new AppError("TRIP_INVALID", "장비 섹션 값이 올바르지 않습니다.", 400);
  }
}

function parseCompanionBody(body: unknown) {
  return parseBodyOrThrow("동행자 요청", companionInputSchema, body);
}

function parseVehicleBody(body: unknown) {
  return parseBodyOrThrow("차량 요청", vehicleInputSchema, body);
}

function parseBodyOrThrow<T>(
  label: string,
  schema: SafeParseSchema<T>,
  body: unknown,
  code: BodyErrorCode = "TRIP_INVALID",
) {
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    const issues = parsed.error.issues as ValidationIssue[];
    throw new AppError(
      resolveBodyErrorCode(issues, code),
      buildInvalidBodyMessage(label, issues),
      400,
    );
  }

  return parsed.data;
}

function resolveBodyErrorCode(issues: ValidationIssue[], code: BodyErrorCode) {
  if (typeof code === "string") {
    return code;
  }

  if (
    issues.length > 0 &&
    issues.every((issue) => String(issue.path[0] ?? "") === code.field)
  ) {
    return code.code;
  }

  return code.fallbackCode ?? "TRIP_INVALID";
}

function buildInvalidBodyMessage(label: string, issues: ValidationIssue[]) {
  const formattedIssues = issues.slice(0, 5).map(formatZodIssue);

  if (formattedIssues.length === 0) {
    return `${label} 형식이 올바르지 않습니다.`;
  }

  return `${label} 형식이 올바르지 않습니다. ${formattedIssues.join(" / ")}`;
}

function formatZodIssue(issue: ValidationIssue) {
  const path = issue.path.length > 0 ? issue.path.join(".") : "요청 본문";
  return `${path}: ${translateZodIssue(issue)}`;
}

function translateZodIssue(issue: ValidationIssue) {
  if (issue.message === "id must be lowercase kebab-case") {
    return "소문자 kebab-case 형식이어야 합니다.";
  }

  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined"
        ? "값이 필요합니다."
        : `${readExpectedTypeLabel(issue.expected)} 형식이어야 합니다.`;
    case "invalid_string":
      if (issue.validation === "regex") {
        return "형식이 올바르지 않습니다.";
      }

      return issue.message;
    case "invalid_enum_value":
      return `허용되지 않는 값입니다: ${String(issue.received)}`;
    case "too_small":
      if (issue.type === "string") {
        return issue.minimum === 1
          ? "값을 입력해야 합니다."
          : `${issue.minimum}자 이상 입력해야 합니다.`;
      }

      if (issue.type === "array") {
        return `${issue.minimum}개 이상 필요합니다.`;
      }

      if (issue.type === "number" || issue.type === "bigint") {
        return issue.inclusive
          ? `${issue.minimum} 이상이어야 합니다.`
          : `${issue.minimum}보다 커야 합니다.`;
      }

      return issue.message;
    default:
      return issue.message;
  }
}

function readExpectedTypeLabel(expected?: unknown) {
  switch (expected) {
    case "string":
      return "문자열";
    case "number":
      return "숫자";
    case "array":
      return "배열";
    case "object":
      return "객체";
    case "boolean":
      return "불리언";
    default:
      return "올바른 값";
  }
}

export async function registerApiRoutes(
  app: FastifyInstance,
  analysisService: AnalysisService,
) {
  app.get("/api/ai-jobs/events", async (request, reply) => {
    reply.hijack();

    const response = reply.raw;
    response.writeHead(200, buildAiJobEventStreamHeaders(request.headers.origin));
    response.flushHeaders?.();
    response.write(formatSseEvent(analysisService.createAiJobReadyEvent()));

    const unsubscribe = analysisService.subscribeAiJobEvents((event) => {
      response.write(formatSseEvent(event));
    });
    const heartbeatTimer = setInterval(() => {
      response.write(formatSseEvent(analysisService.createAiJobHeartbeatEvent()));
    }, 15000);
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      clearInterval(heartbeatTimer);
      unsubscribe();
    };

    request.raw.once("close", cleanup);
    request.raw.once("error", cleanup);
  });

  app.get("/api/health", async () => analysisService.getHealthStatus());

  app.get("/api/data-backups", async () => ({
    items: await analysisService.listDataBackups(),
  }));

  app.post("/api/data-backups", async () => {
    return analysisService.createDataBackup("manual");
  });

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

  app.get("/api/vehicles", async () => ({
    items: await analysisService.listVehicles(),
  }));

  app.post("/api/vehicles", async (request) => {
    return {
      item: await analysisService.createVehicle(parseVehicleBody(request.body)),
    };
  });

  app.put("/api/vehicles/:vehicleId", async (request) => {
    const vehicleId = readVehicleIdParam(
      (request.params as { vehicleId?: unknown }).vehicleId,
    );

    return {
      item: await analysisService.updateVehicle(
        vehicleId,
        parseVehicleBody(request.body),
      ),
    };
  });

  app.delete("/api/vehicles/:vehicleId", async (request) => {
    const vehicleId = readVehicleIdParam(
      (request.params as { vehicleId?: unknown }).vehicleId,
    );

    return analysisService.deleteVehicle(vehicleId);
  });

  app.get("/api/trips", async () => ({
    items: await analysisService.listTrips(),
  }));

  app.post("/api/trips", async (request) => {
    const trip = await analysisService.createTrip(
      parseBodyOrThrow("trip 생성 요청", tripDraftSchema, request.body),
    );
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
    const trip = await analysisService.updateTrip(
      tripId,
      parseBodyOrThrow("trip 수정 요청", tripDraftSchema, request.body),
    );
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
    const body = parseBodyOrThrow(
      "assistant 요청",
      planningAssistantRequestSchema,
      request.body,
    );

    return analysisService.assistTripPlanning(tripId, body.message);
  });

  app.post("/api/validate-trip", async (request) => {
    const body = parseBodyOrThrow(
      "validate-trip 요청",
      validateTripRequestSchema,
      request.body,
      {
        code: "INVALID_TRIP_ID_FORMAT",
        field: "trip_id",
      },
    );

    return analysisService.validateTrip(body.trip_id);
  });

  app.post("/api/analyze-trip", async (request, reply) => {
    const response = await analysisService.analyzeTrip(
      parseBodyOrThrow(
        "analyze-trip 요청",
        analyzeTripRequestSchema,
        request.body,
        {
          code: "INVALID_TRIP_ID_FORMAT",
          field: "trip_id",
        },
      ),
    );

    return reply.status(202).send(response);
  });

  app.post("/api/ai-jobs/cancel-all", async () => {
    return analysisService.cancelAllAiJobs();
  });

  app.get("/api/trips/:tripId/analysis-status", async (request) => {
    const tripId = readIdParam(
      (request.params as { tripId?: unknown }).tripId,
      "trip_id",
    );

    return analysisService.getTripAnalysisStatus(tripId);
  });

  app.get("/api/outputs/:tripId", async (request) => {
    const tripId = readIdParam(
      (request.params as { tripId?: unknown }).tripId,
      "trip_id",
    );

    return analysisService.getOutput(tripId);
  });

  app.post("/api/outputs", async (request) => {
    return analysisService.saveOutput(
      parseBodyOrThrow(
        "outputs 저장 요청",
        saveOutputRequestSchema,
        request.body,
        {
          code: "INVALID_TRIP_ID_FORMAT",
          field: "trip_id",
        },
      ),
    );
  });

  app.get("/api/equipment", async () => analysisService.getEquipmentCatalog());

  app.get("/api/equipment/categories", async () => {
    return analysisService.getEquipmentCategories();
  });

  app.post("/api/equipment/categories/:section", async (request) => {
    const section = readEquipmentSection(
      (request.params as { section?: unknown }).section,
    );

    return {
      item: await analysisService.createEquipmentCategory(
        section,
        parseBodyOrThrow(
          "장비 카테고리 생성 요청",
          equipmentCategoryCreateInputSchema,
          request.body,
        ),
      ),
    };
  });

  app.put("/api/equipment/categories/:section/:categoryId", async (request) => {
    const section = readEquipmentSection(
      (request.params as { section?: unknown }).section,
    );
    const categoryId = readEquipmentCategoryIdParam(
      (request.params as { categoryId?: unknown }).categoryId,
    );

    return {
      item: await analysisService.updateEquipmentCategory(
        section,
        categoryId,
        parseBodyOrThrow(
          "장비 카테고리 수정 요청",
          equipmentCategoryUpdateInputSchema,
          request.body,
        ),
      ),
    };
  });

  app.delete("/api/equipment/categories/:section/:categoryId", async (request) => {
    const section = readEquipmentSection(
      (request.params as { section?: unknown }).section,
    );
    const categoryId = readEquipmentCategoryIdParam(
      (request.params as { categoryId?: unknown }).categoryId,
    );

    return analysisService.deleteEquipmentCategory(section, categoryId);
  });

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

  app.get("/api/equipment/durable/metadata-statuses", async () => ({
    items: await analysisService.listDurableMetadataJobStatuses(),
  }));

  app.post("/api/equipment/durable/items/:itemId/metadata/refresh", async (request, reply) => {
    const itemId = readIdParam(
      (request.params as { itemId?: unknown }).itemId,
      "item_id",
    );

    return reply
      .status(202)
      .send(await analysisService.refreshDurableEquipmentMetadata(itemId));
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
    return {
      item: await analysisService.updateHistory(
        historyId,
        parseBodyOrThrow("history 수정 요청", historyRecordSchema, request.body),
      ),
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
    return {
      item: await analysisService.createLink(
        parseBodyOrThrow("링크 생성 요청", externalLinkInputSchema, request.body),
      ),
    };
  });

  app.put("/api/links/:linkId", async (request) => {
    const linkId = readIdParam(
      (request.params as { linkId?: unknown }).linkId,
      "link_id",
    );
    return {
      item: await analysisService.updateLink(
        linkId,
        parseBodyOrThrow("링크 수정 요청", externalLinkInputSchema, request.body),
      ),
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

function formatSseEvent(event: { type: string }) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function buildAiJobEventStreamHeaders(originHeader?: string | string[]) {
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };

  if (!origin) {
    return headers;
  }

  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Credentials"] = "true";
  headers.Vary = "Origin";

  return headers;
}
