import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { CodexCliClient, type CommandRunner } from "../src/services/openai-client";
import { CodexCliEquipmentMetadataClient } from "../src/services/equipment-metadata-service";

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

  it("reads structured equipment metadata from the codex output file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "camping-codex-metadata-client-"));
    tempDirs.push(tempDir);

    const schemaPath = path.join(tempDir, "schema.json");
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      schemaPath,
      JSON.stringify({
        type: "object",
        properties: {
          lookup_status: { type: "string" },
          searched_at: { type: "string" },
          query: { type: "string" },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
              },
              required: ["title", "url"],
              additionalProperties: false,
            },
          },
        },
        required: ["lookup_status", "searched_at", "query", "sources"],
        additionalProperties: true,
      }),
      "utf8",
    );

    const runner: CommandRunner = vi.fn().mockImplementation(async ({ args }) => {
      const outputFileIndex = args.findIndex(
        (value: string) => value === "--output-last-message",
      );
      const outputFile = args[outputFileIndex + 1];
      await writeFile(
        outputFile,
        JSON.stringify({
          lookup_status: "found",
          searched_at: "__SERVER_TIMESTAMP__",
          query: "패밀리 텐트 리빙쉘 4P",
          summary: "포장 크기를 확인함.",
          packing: {
            width_cm: 68,
            depth_cm: 34,
            height_cm: 30,
            weight_kg: 14.5,
          },
          planning: {
            setup_time_minutes: 20,
            season_notes: ["봄, 여름, 가을 중심"],
            weather_notes: ["우천 시 플라이 확인 필요"],
          },
          sources: [
            {
              title: "테스트 상품 페이지",
              url: "https://example.com/product",
            },
          ],
        }),
        "utf8",
      );

      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
      };
    });

    const client = new CodexCliEquipmentMetadataClient({
      binary: "codex",
      model: "gpt-5.4",
      projectRoot: process.cwd(),
      outputSchemaPath: schemaPath,
      runner,
    });

    await expect(
      client.collectDurableEquipmentMetadata({
        item: {
          id: "family-tent",
          name: "패밀리 텐트",
          model: "리빙쉘 4P",
          purchase_link: "https://example.com/product",
          category: "shelter",
          quantity: 1,
          status: "ok",
        },
        categoryLabel: "쉘터/텐트",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        lookup_status: "found",
        query: "패밀리 텐트 리빙쉘 4P",
        sources: [
          expect.objectContaining({
            domain: "example.com",
          }),
        ],
      }),
    );
  });
});
