import Fastify from "fastify";
import cors from "@fastify/cors";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { TripId } from "@camping/shared";
import { resolveConfig, type ConfigOverrides } from "./config";
import { CampingRepository } from "./file-store/camping-repository";
import { registerApiRoutes } from "./routes/api-routes";
import { AnalysisService } from "./services/analysis-service";
import {
  CodexCliEquipmentMetadataClient,
  MissingEquipmentMetadataClient,
  OpenAIEquipmentMetadataClient,
  type EquipmentMetadataSearchClient,
} from "./services/equipment-metadata-service";
import {
  CodexCliClient,
  MissingOpenAIClient,
  OpenAIResponsesClient,
  type AnalysisModelClient,
} from "./services/openai-client";
import { isAppError, toApiError } from "./services/app-error";

export type BuildServerOptions = ConfigOverrides & {
  logger?: boolean;
  modelClient?: AnalysisModelClient;
  equipmentMetadataClient?: EquipmentMetadataSearchClient;
};

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const config = resolveConfig(options);
  const repository = new CampingRepository(config);
  const modelClient = options.modelClient ?? createModelClient(config);
  const equipmentMetadataClient =
    options.equipmentMetadataClient ?? createEquipmentMetadataClient(config);
  const analysisService = new AnalysisService(
    repository,
    modelClient,
    equipmentMetadataClient,
  );
  await analysisService.initialize();

  const app = Fastify({
    logger: options.logger ?? false,
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });
  await registerApiRoutes(app, analysisService);

  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      const status = error.code === "TRIP_NOT_FOUND" ? 404 : error.statusCode;

      if (
        error.code === "TRIP_INVALID" ||
        error.code === "INVALID_TRIP_ID_FORMAT" ||
        error.code === "TRIP_NOT_FOUND" ||
        error.code === "DEPENDENCY_MISSING" ||
        error.code === "OUTPUT_SAVE_FAILED" ||
        error.code === "BACKUP_FAILED" ||
        error.code === "OPENAI_REQUEST_FAILED" ||
        error.code === "RESOURCE_NOT_FOUND" ||
        error.code === "CONFLICT"
      ) {
        return reply.status(status).send({
          status: "failed",
          ...(isAnalyzeRoute(request.method, request.url)
            ? { trip_id: readTripIdFromRequest(request.body, request.params) }
            : {}),
          warnings: [],
          error: toApiError(error),
        });
      }

      return reply.status(status).send({
        status: "failed",
        error: toApiError(error),
      });
    }

    requestLogger(app, error);

    return reply.status(500).send({
      status: "failed",
      error: {
        code: "INTERNAL_ERROR",
        message: "알 수 없는 서버 오류가 발생했습니다.",
      },
    });
  });

  return app;
}

function createModelClient(
  config: ReturnType<typeof resolveConfig>,
): AnalysisModelClient {
  if (config.aiBackend === "codex-cli") {
    return new CodexCliClient({
      binary: config.codexBin,
      model: config.codexModel,
      projectRoot: config.projectRoot,
      outputSchemaPath: config.codexOutputSchemaPath,
    });
  }

  return config.openaiApiKey
    ? new OpenAIResponsesClient(config.openaiApiKey, config.openaiModel)
    : new MissingOpenAIClient();
}

function createEquipmentMetadataClient(
  config: ReturnType<typeof resolveConfig>,
): EquipmentMetadataSearchClient {
  if (config.aiBackend === "codex-cli") {
    return new CodexCliEquipmentMetadataClient({
      binary: config.codexBin,
      model: config.codexMetadataModel,
      reasoningEffort: config.codexMetadataReasoningEffort,
      projectRoot: config.projectRoot,
      outputSchemaPath: path.join(
        config.projectRoot,
        "schemas",
        "codex-equipment-metadata-output.schema.json",
      ),
    });
  }

  return config.openaiApiKey
    ? new OpenAIEquipmentMetadataClient(
        config.openaiApiKey,
        config.openaiMetadataModel,
      )
    : new MissingEquipmentMetadataClient(
        "OPENAI_API_KEY 가 없어 장비 메타데이터를 수집할 수 없습니다.",
      );
}

function requestLogger(app: FastifyInstance, error: unknown) {
  app.log.error(error);
}

function isAnalyzeRoute(method: string, url: string): boolean {
  return method.toUpperCase() === "POST" && url.startsWith("/api/analyze-trip");
}

function readTripIdFromRequest(body: unknown, params: unknown): TripId | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "trip_id" in body &&
    typeof body.trip_id === "string"
  ) {
    return body.trip_id as TripId;
  }

  if (
    typeof params === "object" &&
    params !== null &&
    "tripId" in params &&
    typeof params.tripId === "string"
  ) {
    return params.tripId as TripId;
  }

  return undefined;
}
