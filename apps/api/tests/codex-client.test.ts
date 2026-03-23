import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { CodexCliClient, type CommandRunner } from "../src/services/openai-client";
import { CodexCliEquipmentMetadataClient } from "../src/services/equipment-metadata-service";

const tempDirs: string[] = [];
const projectRoot = path.resolve(process.cwd(), "../..");

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
      reasoningEffort: "low",
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
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          "-c",
          "mcp_servers.github.enabled=false",
          "-c",
          'model_reasoning_effort="low"',
        ]),
      }),
    );
  });

  it("normalizes nullable codex metadata fields into optional app metadata fields", async () => {
    const schemaPath = path.join(
      projectRoot,
      "schemas",
      "codex-equipment-metadata-output.schema.json",
    );

    const runner: CommandRunner = vi.fn().mockImplementation(async ({ args }) => {
      const outputFileIndex = args.findIndex(
        (value: string) => value === "--output-last-message",
      );
      const outputFile = args[outputFileIndex + 1];
      await writeFile(
        outputFile,
        JSON.stringify({
          lookup_status: "not_found",
          searched_at: "__SERVER_TIMESTAMP__",
          query: "루메나 5.1CH MAX LED 캠핑랜턴",
          summary: null,
          product: {
            brand: "루메나",
            official_name: "루메나 5.1CH MAX LED 캠핑랜턴",
            model: null,
          },
          packing: null,
          planning: {
            setup_time_minutes: null,
            recommended_people: null,
            capacity_people: null,
            season_notes: [],
            weather_notes: [],
          },
          sources: [],
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
      reasoningEffort: "low",
      projectRoot: process.cwd(),
      outputSchemaPath: schemaPath,
      runner,
    });

    await expect(
      client.collectDurableEquipmentMetadata({
        item: {
          id: "lumena-lantern",
          name: "루메나 5.1CH MAX LED 캠핑랜턴",
          category: "lighting",
          quantity: 1,
          status: "ok",
        },
        categoryLabel: "조명",
      }),
    ).resolves.toEqual({
      lookup_status: "not_found",
      searched_at: expect.any(String),
      query: "루메나 5.1CH MAX LED 캠핑랜턴",
      product: {
        brand: "루메나",
        official_name: "루메나 5.1CH MAX LED 캠핑랜턴",
      },
      planning: {
        season_notes: [],
        weather_notes: [],
      },
      sources: [],
    });
  });

  it("keeps the checked-in codex metadata schema compatible with strict structured outputs", async () => {
    const raw = await readFile(
      path.join(projectRoot, "schemas", "codex-equipment-metadata-output.schema.json"),
      "utf8",
    );
    const schema = JSON.parse(raw) as {
      required?: string[];
      properties?: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
    };

    expect(schema.required).toEqual([
      "lookup_status",
      "searched_at",
      "query",
      "summary",
      "product",
      "packing",
      "planning",
      "sources",
    ]);
    expect(schema.properties?.product?.required).toEqual([
      "brand",
      "official_name",
      "model",
    ]);
    expect(schema.properties?.packing?.required).toEqual([
      "width_cm",
      "depth_cm",
      "height_cm",
      "weight_kg",
    ]);
    expect(schema.properties?.planning?.required).toEqual([
      "setup_time_minutes",
      "recommended_people",
      "capacity_people",
      "season_notes",
      "weather_notes",
    ]);
  });

  it("allows metadata-specific model and reasoning options to be changed", async () => {
    const schemaPath = path.join(
      projectRoot,
      "schemas",
      "codex-equipment-metadata-output.schema.json",
    );

    const runner: CommandRunner = vi.fn().mockImplementation(async ({ args }) => {
      const outputFileIndex = args.findIndex(
        (value: string) => value === "--output-last-message",
      );
      const outputFile = args[outputFileIndex + 1];
      await writeFile(
        outputFile,
        JSON.stringify({
          lookup_status: "not_found",
          searched_at: "__SERVER_TIMESTAMP__",
          query: "테스트 조명",
          summary: null,
          product: null,
          packing: null,
          planning: null,
          sources: [],
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
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
      projectRoot: process.cwd(),
      outputSchemaPath: schemaPath,
      runner,
    });

    await client.collectDurableEquipmentMetadata({
      item: {
        id: "test-light",
        name: "테스트 조명",
        category: "lighting",
        quantity: 1,
        status: "ok",
      },
      categoryLabel: "조명",
    });

    const args = vi.mocked(runner).mock.calls[0]?.[0].args ?? [];
    expect(args).toContain("-m");
    expect(args).toContain("gpt-5.4-mini");
    expect(args).toContain("-c");
    expect(args).toContain("mcp_servers.github.enabled=false");
    expect(args).toContain('model_reasoning_effort="medium"');
  });

  it("prefers actionable codex error lines over echoed prompt text", async () => {
    const schemaPath = path.join(
      projectRoot,
      "schemas",
      "codex-equipment-metadata-output.schema.json",
    );

    const runner: CommandRunner = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: [
        "OpenAI Codex v0.116.0 (research preview)",
        "--------",
        "user",
        "당신은 캠핑 장비 메타데이터를 조사해 JSON으로만 반환하는 실행기다.",
      ].join("\n"),
      stderr: [
        "mcp startup: no servers",
        'ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \\"gpt-5-mini\\" model is not supported when using Codex with a ChatGPT account."}}',
      ].join("\n"),
    });

    const client = new CodexCliEquipmentMetadataClient({
      binary: "codex",
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
      projectRoot: process.cwd(),
      outputSchemaPath: schemaPath,
      runner,
    });

    await expect(
      client.collectDurableEquipmentMetadata({
        item: {
          id: "lumena-lantern",
          name: "루메나 5.1CH MAX LED 캠핑랜턴",
          category: "lighting",
          quantity: 1,
          status: "ok",
        },
        categoryLabel: "조명",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("gpt-5-mini"),
    });
  });
});
