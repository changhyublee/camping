import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import type { BackendHealth } from "@camping/shared";
import { buildServer } from "../src/server";
import type { AnalysisModelClient } from "../src/services/openai-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

const tempDirs: string[] = [];

class MockAnalysisClient implements AnalysisModelClient {
  constructor(private readonly markdown: string) {}

  async generateMarkdown() {
    return this.markdown;
  }

  async getHealthStatus(): Promise<BackendHealth> {
    return {
      status: "ok",
      backend: "codex-cli",
      ready: true,
      auth_status: "ok",
      model: "gpt-5.4",
      message: "Logged in using ChatGPT",
    };
  }
}

async function createSeededDataDir() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-api-test-"));
  tempDirs.push(tempRoot);

  await cp(path.join(projectRoot, "docs", "examples"), path.join(tempRoot, ".camping-data"), {
    recursive: true,
  });

  return path.join(tempRoot, ".camping-data");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("API server", () => {
  it("returns health information for the active backend", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "ok",
        backend: "codex-cli",
        ready: true,
        auth_status: "ok",
      }),
    );

    await app.close();
  });

  it("lists trips and returns trip detail", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/trips",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trip_id: "2026-04-18-gapyeong",
          title: "4월 가평 가족 캠핑",
        }),
      ]),
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: "/api/trips/2026-04-18-gapyeong",
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        data: expect.objectContaining({
          title: "4월 가평 가족 캠핑",
        }),
      }),
    );

    await app.close();
  });

  it("rejects a trip file when the file name and internal trip_id do not match", async () => {
    const dataDir = await createSeededDataDir();
    const tripPath = path.join(dataDir, "trips", "2026-04-18-gapyeong.yaml");
    const trip = parse(await readFile(tripPath, "utf8")) as Record<string, unknown>;

    trip.trip_id = "2026-04-19-gapyeong";

    await writeFile(tripPath, stringify(trip), "utf8");

    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/trips",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toEqual([]);

    const detailResponse = await app.inject({
      method: "GET",
      url: "/api/trips/2026-04-18-gapyeong",
    });

    expect(detailResponse.statusCode).toBe(400);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "TRIP_INVALID",
        }),
      }),
    );

    await app.close();
  });

  it("validates a trip and returns warnings", async () => {
    const dataDir = await createSeededDataDir();
    const tripPath = path.join(dataDir, "trips", "2026-04-18-gapyeong.yaml");
    const trip = parse(await readFile(tripPath, "utf8")) as Record<string, unknown>;

    delete (trip.conditions as Record<string, unknown>).expected_weather;

    await writeFile(tripPath, stringify(trip), "utf8");

    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/validate-trip",
      payload: { trip_id: "2026-04-18-gapyeong" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "ok",
        warnings: expect.arrayContaining([
          "예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다.",
        ]),
      }),
    );

    await app.close();
  });

  it("analyzes a trip and saves markdown output", async () => {
    const dataDir = await createSeededDataDir();
    const markdown = "# 테스트 분석 결과";
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient(markdown),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        save_output: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        status: "completed",
        markdown,
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      }),
    );

    const saved = await readFile(
      path.join(dataDir, "outputs", "2026-04-18-gapyeong-plan.md"),
      "utf8",
    );
    expect(saved).toBe(markdown);

    await app.close();
  });

  it("returns markdown with OUTPUT_SAVE_FAILED when analyze-trip save_output cannot write the file", async () => {
    const dataDir = await createSeededDataDir();
    const outputsPath = path.join(dataDir, "outputs");
    const markdown = "# 테스트 분석 결과";

    await rm(outputsPath, { recursive: true, force: true });
    await writeFile(outputsPath, "blocked", "utf8");

    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient(markdown),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        save_output: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        status: "failed",
        markdown,
        output_path: null,
        error: expect.objectContaining({
          code: "OUTPUT_SAVE_FAILED",
        }),
      }),
    );

    await app.close();
  });

  it("returns OUTPUT_SAVE_FAILED when the save endpoint cannot write the file", async () => {
    const dataDir = await createSeededDataDir();
    const outputsPath = path.join(dataDir, "outputs");
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    await rm(outputsPath, { recursive: true, force: true });
    await writeFile(outputsPath, "blocked", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/api/outputs",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        markdown: "# sample",
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "OUTPUT_SAVE_FAILED",
        }),
      }),
    );

    await app.close();
  });

  it("rejects an invalid trip id", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/validate-trip",
      payload: { trip_id: "../bad" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "INVALID_TRIP_ID_FORMAT",
        }),
      }),
    );

    await app.close();
  });
});
