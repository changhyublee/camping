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

  it("allows DELETE equipment preflight requests through CORS", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/equipment/durable/items/sleeping-bag-3season-adult",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Content-Type",
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

  it("lists companions and creates a missing companion profile", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/companions",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "self",
          name: "본인",
        }),
      ]),
    );

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/companions",
      payload: {
        id: "ghost",
        name: "ghost",
        age_group: "adult",
        health_notes: [],
        required_medications: [],
        traits: {
          cold_sensitive: false,
          heat_sensitive: false,
          rain_sensitive: false,
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().item).toEqual(
      expect.objectContaining({
        id: "ghost",
        name: "ghost",
      }),
    );

    const companions = parse(
      await readFile(path.join(dataDir, "companions.yaml"), "utf8"),
    ) as {
      companions: Array<{ id: string }>;
    };

    expect(companions.companions.map((item) => item.id)).toContain("ghost");

    await app.close();
  });

  it("rejects companion ids that are not kebab-case", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/companions",
      payload: {
        id: "Ghost/1",
        name: "잘못된 ID",
        age_group: "adult",
        health_notes: [],
        required_medications: [],
        traits: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "TRIP_INVALID",
        }),
      }),
    );

    await app.close();
  });

  it("returns field-level details when trip creation validation fails", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips",
      payload: {
        version: 1,
        title: "",
        party: {
          companion_ids: [],
        },
        notes: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "TRIP_INVALID",
          message: expect.stringContaining("title: 값을 입력해야 합니다."),
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

  it("reads a saved markdown output by trip id", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/outputs/2026-04-18-gapyeong",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      }),
    );
    expect(response.json().markdown).toContain("가평");

    await app.close();
  });

  it("creates, updates, and deletes a trip through CRUD endpoints", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/trips",
      payload: {
        version: 1,
        trip_id: "2026-05-01-sokcho",
        title: "5월 속초 캠핑",
        date: { start: "2026-05-01", end: "2026-05-02" },
        location: { region: "sokcho" },
        party: { companion_ids: ["self"] },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-05-01-sokcho",
        data: expect.objectContaining({
          title: "5월 속초 캠핑",
        }),
      }),
    );

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/trips/2026-05-01-sokcho",
      payload: {
        version: 1,
        title: "5월 속초 가족 캠핑",
        date: { start: "2026-05-01", end: "2026-05-03" },
        location: { region: "sokcho" },
        party: { companion_ids: ["self", "child-1"] },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data.title).toBe("5월 속초 가족 캠핑");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/trips/2026-05-01-sokcho",
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ status: "deleted" });

    await app.close();
  });

  it("does not reuse archived trip ids for new plans", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const archiveResponse = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/archive",
    });

    expect(archiveResponse.statusCode).toBe(200);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/trips",
      payload: {
        version: 1,
        title: "4월 가평 가족 캠핑",
        date: { start: "2026-04-18", end: "2026-04-19" },
        location: { region: "gapyeong" },
        party: { companion_ids: ["self", "child-1"] },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().trip_id).toMatch(/^2026-04-18-gapyeong-\d+$/u);
    expect(createResponse.json().trip_id).not.toBe("2026-04-18-gapyeong");

    const explicitConflictResponse = await app.inject({
      method: "POST",
      url: "/api/trips",
      payload: {
        version: 1,
        trip_id: "2026-04-18-gapyeong",
        title: "같은 ID 재사용 시도",
        date: { start: "2026-04-18", end: "2026-04-19" },
        location: { region: "gapyeong" },
        party: { companion_ids: ["self"] },
      },
    });

    expect(explicitConflictResponse.statusCode).toBe(409);
    expect(explicitConflictResponse.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "CONFLICT",
        }),
      }),
    );

    await app.close();
  });

  it("archives a trip into history", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const archiveResponse = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/archive",
    });

    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json().item).toEqual(
      expect.objectContaining({
        history_id: "2026-04-18-gapyeong",
        source_trip_id: "2026-04-18-gapyeong",
      }),
    );

    const historyResponse = await app.inject({
      method: "GET",
      url: "/api/history",
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          history_id: "2026-04-18-gapyeong",
        }),
      ]),
    );

    const tripResponse = await app.inject({
      method: "GET",
      url: "/api/trips/2026-04-18-gapyeong",
    });

    expect(tripResponse.statusCode).toBe(404);

    await app.close();
  });

  it("manages equipment and links through CRUD endpoints", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const createEquipmentResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/durable/items",
      payload: {
        name: "루프 박스",
        category: "storage",
        quantity: 1,
        status: "ok",
      },
    });

    expect(createEquipmentResponse.statusCode).toBe(200);
    const createdEquipmentId = createEquipmentResponse.json().item.id as string;

    const categoriesResponse = await app.inject({
      method: "GET",
      url: "/api/equipment/categories",
    });

    expect(categoriesResponse.statusCode).toBe(200);
    expect(categoriesResponse.json().durable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "storage",
          label: "storage",
        }),
      ]),
    );

    const updateEquipmentResponse = await app.inject({
      method: "PUT",
      url: `/api/equipment/durable/items/${createdEquipmentId}`,
      payload: {
        id: createdEquipmentId,
        name: "루프 박스",
        category: "storage",
        quantity: 2,
        status: "ok",
      },
    });

    expect(updateEquipmentResponse.statusCode).toBe(200);
    expect(updateEquipmentResponse.json().item.quantity).toBe(2);

    const createCategoryResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/categories/durable",
      payload: {
        label: "수납",
      },
    });

    expect(createCategoryResponse.statusCode).toBe(200);
    const createdCategoryId = createCategoryResponse.json().item.id as string;

    const updateCategoryResponse = await app.inject({
      method: "PUT",
      url: `/api/equipment/categories/durable/${createdCategoryId}`,
      payload: {
        label: "수납함",
      },
    });

    expect(updateCategoryResponse.statusCode).toBe(200);
    expect(updateCategoryResponse.json().item.label).toBe("수납함");

    const createLinkResponse = await app.inject({
      method: "POST",
      url: "/api/links",
      payload: {
        name: "기상청",
        category: "weather",
        url: "https://www.weather.go.kr",
        notes: "공식 예보",
      },
    });

    expect(createLinkResponse.statusCode).toBe(200);
    expect(createLinkResponse.json().item.name).toBe("기상청");

    const deleteEquipmentResponse = await app.inject({
      method: "DELETE",
      url: `/api/equipment/durable/items/${createdEquipmentId}`,
    });

    expect(deleteEquipmentResponse.statusCode).toBe(200);

    const deleteCategoryResponse = await app.inject({
      method: "DELETE",
      url: `/api/equipment/categories/durable/${createdCategoryId}`,
    });

    expect(deleteCategoryResponse.statusCode).toBe(200);

    await app.close();
  });

  it("returns planning assistant guidance and actions", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("### AI 보조 응답\n- 우천 대비 장비를 확인하세요."),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/assistant",
      payload: {
        message: "이번에는 비 예보가 있어",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        assistant_message: expect.stringContaining("AI 보조 응답"),
        actions: expect.any(Array),
      }),
    );

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

  it("keeps analyze-trip body validation errors as TRIP_INVALID when non-trip fields are wrong", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        save_output: "yes",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "TRIP_INVALID",
          message: expect.stringContaining("save_output"),
        }),
      }),
    );

    await app.close();
  });
});
