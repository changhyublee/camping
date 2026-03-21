import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type AppConfig = {
  apiPort: number;
  aiBackend: "codex-cli" | "openai";
  openaiApiKey?: string;
  openaiModel: string;
  codexBin: string;
  codexModel: string;
  codexOutputSchemaPath: string;
  projectRoot: string;
  dataDir: string;
  promptsDir: string;
};

export type ConfigOverrides = Partial<AppConfig>;

export function resolveConfig(overrides: ConfigOverrides = {}): AppConfig {
  const projectRoot =
    overrides.projectRoot ?? path.resolve(__dirname, "../../..");

  return {
    apiPort: overrides.apiPort ?? Number(process.env.API_PORT ?? 8787),
    aiBackend:
      overrides.aiBackend ??
      (process.env.AI_BACKEND === "openai" ? "openai" : "codex-cli"),
    openaiApiKey: overrides.openaiApiKey ?? process.env.OPENAI_API_KEY,
    openaiModel: overrides.openaiModel ?? process.env.OPENAI_MODEL ?? "gpt-5.2",
    codexBin: overrides.codexBin ?? process.env.CODEX_BIN ?? "codex",
    codexModel: overrides.codexModel ?? process.env.CODEX_MODEL ?? "gpt-5.4",
    codexOutputSchemaPath:
      overrides.codexOutputSchemaPath ??
      path.join(projectRoot, "schemas", "codex-trip-analysis-output.schema.json"),
    projectRoot,
    dataDir: overrides.dataDir ?? path.join(projectRoot, ".camping-data"),
    promptsDir: overrides.promptsDir ?? path.join(projectRoot, "prompts"),
  };
}
