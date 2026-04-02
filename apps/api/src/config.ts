import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type AppConfig = {
  apiPort: number;
  aiBackend: "codex-cli" | "openai";
  openaiApiKey?: string;
  openaiModel: string;
  openaiMetadataModel: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  codexBin: string;
  codexModel: string;
  codexMetadataModel: string;
  codexMetadataReasoningEffort: "low" | "medium" | "high" | "xhigh";
  codexOutputSchemaPath: string;
  projectRoot: string;
  dataDir: string;
  backupDir: string;
  promptsDir: string;
};

export type ConfigOverrides = Partial<AppConfig>;

export function resolveConfig(overrides: ConfigOverrides = {}): AppConfig {
  const projectRoot =
    overrides.projectRoot ?? path.resolve(__dirname, "../../..");

  loadProjectEnvFile(projectRoot);

  return {
    apiPort: overrides.apiPort ?? Number(process.env.API_PORT ?? 8787),
    aiBackend:
      overrides.aiBackend ??
      (process.env.AI_BACKEND === "openai" ? "openai" : "codex-cli"),
    openaiApiKey: overrides.openaiApiKey ?? process.env.OPENAI_API_KEY,
    openaiModel: overrides.openaiModel ?? process.env.OPENAI_MODEL ?? "gpt-5.2",
    openaiMetadataModel:
      overrides.openaiMetadataModel ??
      process.env.OPENAI_METADATA_MODEL ??
      "gpt-5-mini",
    smtpHost: overrides.smtpHost ?? process.env.SMTP_HOST,
    smtpPort: overrides.smtpPort ?? parseOptionalNumber(process.env.SMTP_PORT),
    smtpSecure:
      overrides.smtpSecure ?? parseBooleanFlag(process.env.SMTP_SECURE) ?? false,
    smtpUser: overrides.smtpUser ?? process.env.SMTP_USER,
    smtpPass: overrides.smtpPass ?? process.env.SMTP_PASS,
    smtpFrom: overrides.smtpFrom ?? process.env.SMTP_FROM,
    codexBin: overrides.codexBin ?? process.env.CODEX_BIN ?? "codex",
    codexModel: overrides.codexModel ?? process.env.CODEX_MODEL ?? "gpt-5.4",
    codexMetadataModel:
      overrides.codexMetadataModel ??
      process.env.CODEX_METADATA_MODEL ??
      "gpt-5.4-mini",
    codexMetadataReasoningEffort:
      overrides.codexMetadataReasoningEffort ??
      parseCodexReasoningEffort(
        process.env.CODEX_METADATA_REASONING_EFFORT,
      ) ??
      "low",
    codexOutputSchemaPath:
      overrides.codexOutputSchemaPath ??
      path.join(projectRoot, "schemas", "codex-trip-analysis-output.schema.json"),
    projectRoot,
    dataDir: overrides.dataDir ?? path.join(projectRoot, ".camping-data"),
    backupDir: overrides.backupDir ?? path.join(projectRoot, ".camping-backups"),
    promptsDir: overrides.promptsDir ?? path.join(projectRoot, "prompts"),
  };
}

function loadProjectEnvFile(projectRoot: string) {
  try {
    process.loadEnvFile(path.join(projectRoot, ".env"));
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function parseCodexReasoningEffort(
  value: string | undefined,
): AppConfig["codexMetadataReasoningEffort"] | undefined {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  ) {
    return value;
  }

  return undefined;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}
