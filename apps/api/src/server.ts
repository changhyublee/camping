import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import type { TripId } from "@camping/shared";
import { resolveConfig, type ConfigOverrides } from "./config";
import { CampingRepository } from "./file-store/camping-repository";
import { registerApiRoutes } from "./routes/api-routes";
import { AnalysisService } from "./services/analysis-service";
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
};

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const config = resolveConfig(options);
  const repository = new CampingRepository(config);
  const modelClient = options.modelClient ?? createModelClient(config);
  const analysisService = new AnalysisService(repository, modelClient);

  const app = Fastify({
    logger: options.logger ?? false,
  });

  await app.register(cors, { origin: true });
  await registerApiRoutes(app, analysisService);

  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      const status = error.code === "TRIP_NOT_FOUND" ? 404 : error.statusCode;

      if (
        error.code === "TRIP_INVALID" ||
        error.code === "INVALID_TRIP_ID_FORMAT" ||
        error.code === "TRIP_NOT_FOUND" ||
        error.code === "DEPENDENCY_MISSING" ||
        error.code === "OPENAI_REQUEST_FAILED"
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
