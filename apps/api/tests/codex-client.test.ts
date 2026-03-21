import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { CodexCliClient, type CommandRunner } from "../src/services/openai-client";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("CodexCliClient", () => {
  it("returns backend health when codex login status succeeds", async () => {
    const runner: CommandRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "Logged in using ChatGPT\n",
      stderr: "",
    });

    const client = new CodexCliClient({
      binary: "codex",
      model: "gpt-5.4",
      projectRoot: process.cwd(),
      outputSchemaPath: "/tmp/schema.json",
      runner,
    });

    await expect(client.getHealthStatus()).resolves.toEqual(
      expect.objectContaining({
        backend: "codex-cli",
        ready: true,
        auth_status: "ok",
      }),
    );
  });

  it("reads markdown from the codex output file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "camping-codex-client-"));
    tempDirs.push(tempDir);

    const schemaPath = path.join(tempDir, "schema.json");
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      schemaPath,
      JSON.stringify({
        type: "object",
        properties: {
          markdown: { type: "string" },
        },
        required: ["markdown"],
        additionalProperties: false,
      }),
      "utf8",
    );

    const runner: CommandRunner = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "Logged in using ChatGPT\n",
        stderr: "",
      })
      .mockImplementationOnce(async ({ args }) => {
        const outputFileIndex = args.findIndex(
          (value: string) => value === "--output-last-message",
        );
        const outputFile = args[outputFileIndex + 1];
        await writeFile(outputFile, JSON.stringify({ markdown: "# codex result" }), "utf8");

        return {
          exitCode: 0,
          stdout: "codex\n{\"markdown\":\"# codex result\"}\n",
          stderr: "",
        };
      });

    const client = new CodexCliClient({
      binary: "codex",
      model: "gpt-5.4",
      projectRoot: process.cwd(),
      outputSchemaPath: schemaPath,
      runner,
    });

    await expect(
      client.generateMarkdown({
        systemPrompt: "system",
        userPrompt: "user",
      }),
    ).resolves.toBe("# codex result");
  });
});
