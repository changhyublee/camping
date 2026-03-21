import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config";

const tempDirs: string[] = [];
const ENV_KEYS = [
  "AI_BACKEND",
  "CODEX_BIN",
  "CODEX_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "API_PORT",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }

  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("resolveConfig", () => {
  it("loads local API settings from the project root .env file", async () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "camping-config-test-"));
    tempDirs.push(projectRoot);

    await writeFile(
      path.join(projectRoot, ".env"),
      [
        "AI_BACKEND=openai",
        "OPENAI_API_KEY=test-key",
        "OPENAI_MODEL=gpt-test",
        "CODEX_BIN=codex-custom",
        "CODEX_MODEL=gpt-5.5",
        "API_PORT=9898",
      ].join("\n"),
      "utf8",
    );

    const config = resolveConfig({ projectRoot });

    expect(config).toEqual(
      expect.objectContaining({
        aiBackend: "openai",
        openaiApiKey: "test-key",
        openaiModel: "gpt-test",
        codexBin: "codex-custom",
        codexModel: "gpt-5.5",
        apiPort: 9898,
      }),
    );
  });
});
