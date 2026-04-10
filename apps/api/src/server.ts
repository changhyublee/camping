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
  createSmtpTransporter,
  MissingAnalysisEmailClient,
  SmtpAnalysisEmailClient,
  type AnalysisEmailClient,
} from "./services/analysis-email-service";
import {
  CodexCliCampsiteTipClient,
  MissingCampsiteTipClient,
  OpenAICampsiteTipClient,
  type CampsiteTipSearchClient,
} from "./services/campsite-tip-service";
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
import {
  OpenMeteoTripWeatherClient,
  type TripWeatherSearchClient,
} from "./services/trip-weather-service";
import {
  CodexCliUserLearningClient,
  MissingUserLearningClient,
  OpenAIUserLearningClient,
  type UserLearningClient,
} from "./services/user-learning-service";

export type BuildServerOptions = ConfigOverrides & {
  logger?: boolean;
  modelClient?: AnalysisModelClient;
  analysisEmailClient?: AnalysisEmailClient;
  equipmentMetadataClient?: EquipmentMetadataSearchClient;
  campsiteTipClient?: CampsiteTipSearchClient;
  userLearningClient?: UserLearningClient;
  tripWeatherClient?: TripWeatherSearchClient;
};

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const config = resolveConfig(options);
  const repository = new CampingRepository(config);
  const modelClient = options.modelClient ?? createModelClient(config);
  const analysisEmailClient =
    options.analysisEmailClient ?? createAnalysisEmailClient(config);
  const equipmentMetadataClient =
    options.equipmentMetadataClient ?? createEquipmentMetadataClient(config);
  const campsiteTipClient =
    options.campsiteTipClient ?? createCampsiteTipClient(config);
  const userLearningClient =
    options.userLearningClient ?? createUserLearningClient(config);
  const tripWeatherClient =
    options.tripWeatherClient ?? createTripWeatherClient(config);
  const analysisService = new AnalysisService(
    repository,
    modelClient,
    analysisEmailClient,
    equipmentMetadataClient,
    campsiteTipClient,
    userLearningClient,
    tripWeatherClient,
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
  app.addHook("onClose", async () => {
    await analysisService.shutdown();
  });

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

function createAnalysisEmailClient(
  config: ReturnType<typeof resolveConfig>,
): AnalysisEmailClient {
  const smtpHost = config.smtpHost?.trim() ?? "";
  const smtpFrom = config.smtpFrom?.trim() ?? "";
  const smtpUser = config.smtpUser?.trim() ?? "";
  const smtpPass = config.smtpPass?.trim() ?? "";
  const hasSmtpUser = smtpUser.length > 0;
  const hasSmtpPass = smtpPass.length > 0;

  if (!smtpHost || !smtpFrom) {
    return new MissingAnalysisEmailClient(
      "SMTP_HOST 와 SMTP_FROM 을 설정해야 분석 결과 메일을 발송할 수 있습니다.",
    );
  }

  if (hasSmtpUser !== hasSmtpPass) {
    return new MissingAnalysisEmailClient(
      "SMTP 인증을 사용하는 경우 SMTP_USER 와 SMTP_PASS 를 함께 설정해야 합니다.",
    );
  }

  const transporter = createSmtpTransporter({
    host: smtpHost,
    port: config.smtpPort ?? (config.smtpSecure ? 465 : 587),
    secure: config.smtpSecure,
    user: hasSmtpUser ? smtpUser : undefined,
    pass: hasSmtpPass ? smtpPass : undefined,
  });

  return new SmtpAnalysisEmailClient(transporter, smtpFrom);
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

function createCampsiteTipClient(
  config: ReturnType<typeof resolveConfig>,
): CampsiteTipSearchClient {
  if (config.aiBackend === "codex-cli") {
    return new CodexCliCampsiteTipClient({
      binary: config.codexBin,
      model: config.codexMetadataModel,
      reasoningEffort: config.codexMetadataReasoningEffort,
      projectRoot: config.projectRoot,
      outputSchemaPath: path.join(
        config.projectRoot,
        "schemas",
        "codex-campsite-tip-output.schema.json",
      ),
    });
  }

  return config.openaiApiKey
    ? new OpenAICampsiteTipClient(config.openaiApiKey, config.openaiMetadataModel)
    : new MissingCampsiteTipClient(
        "OPENAI_API_KEY 가 없어 캠핑장 후기 tip을 수집할 수 없습니다.",
      );
}

function createUserLearningClient(
  config: ReturnType<typeof resolveConfig>,
): UserLearningClient {
  if (config.aiBackend === "codex-cli") {
    return new CodexCliUserLearningClient({
      binary: config.codexBin,
      model: config.codexMetadataModel,
      reasoningEffort: config.codexMetadataReasoningEffort,
      projectRoot: config.projectRoot,
      historyOutputSchemaPath: path.join(
        config.projectRoot,
        "schemas",
        "codex-history-retrospective-learning-output.schema.json",
      ),
      profileOutputSchemaPath: path.join(
        config.projectRoot,
        "schemas",
        "codex-user-learning-profile-output.schema.json",
      ),
    });
  }

  return config.openaiApiKey
    ? new OpenAIUserLearningClient(
        config.openaiApiKey,
        config.openaiMetadataModel,
      )
    : new MissingUserLearningClient(
        "OPENAI_API_KEY 가 없어 사용자 회고 학습을 갱신할 수 없습니다.",
      );
}

function createTripWeatherClient(
  _config: ReturnType<typeof resolveConfig>,
): TripWeatherSearchClient {
  return new OpenMeteoTripWeatherClient();
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
