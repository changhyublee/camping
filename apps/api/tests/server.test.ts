import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import type {
  BackendHealth,
  DurableEquipmentMetadata,
  DurableMetadataJobStatusResponse,
} from "@camping/shared";
import { buildServer } from "../src/server";
import type { EquipmentMetadataSearchClient } from "../src/services/equipment-metadata-service";
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

class CapturingAnalysisClient implements AnalysisModelClient {
  public lastInput:
    | {
        systemPrompt: string;
        userPrompt: string;
      }
    | null = null;

  constructor(private readonly markdown: string) {}

  async generateMarkdown(input: { systemPrompt: string; userPrompt: string }) {
    this.lastInput = input;
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

class DeferredAnalysisClient implements AnalysisModelClient {
  public calls = 0;
  private resolveMarkdown: ((value: string) => void) | null = null;
  private readonly markdownPromise = new Promise<string>((resolve) => {
    this.resolveMarkdown = resolve;
  });

  async generateMarkdown() {
    this.calls += 1;
    return this.markdownPromise;
  }

  complete(markdown: string) {
    this.resolveMarkdown?.(markdown);
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

class MockEquipmentMetadataClient implements EquipmentMetadataSearchClient {
  public lastItem:
    | {
        id: string;
        name: string;
        model?: string;
        purchase_link?: string;
      }
    | null = null;

  constructor(
    private readonly metadata: DurableEquipmentMetadata = {
      lookup_status: "found",
      searched_at: "2026-03-23T12:00:00.000Z",
      query: "4인용 터널 텐트 카키 A사 패밀리 터널 4P",
      summary: "패밀리 터널형 4인 텐트로 포장 크기와 설치 시간이 확인됨.",
      product: {
        brand: "A사",
        official_name: "A사 패밀리 터널 4P",
        model: "패밀리 터널 4P",
      },
      packing: {
        width_cm: 68,
        depth_cm: 34,
        height_cm: 30,
        weight_kg: 14.5,
      },
      planning: {
        setup_time_minutes: 20,
        recommended_people: 2,
        capacity_people: 4,
        season_notes: ["봄, 여름, 가을 중심으로 사용 적합"],
        weather_notes: ["우천 시 플라이와 배수 동선 확인 필요"],
      },
      sources: [
        {
          title: "A사 패밀리 터널 4P",
          url: "https://example.com/product",
          domain: "example.com",
        },
      ],
    },
  ) {}

  async collectDurableEquipmentMetadata(input: {
    item: { id: string; name: string; model?: string; purchase_link?: string };
  }) {
    this.lastItem = input.item;
    return this.metadata;
  }
}

class DeferredEquipmentMetadataClient implements EquipmentMetadataSearchClient {
  public calls: string[] = [];
  public maxConcurrentCalls = 0;
  private currentConcurrentCalls = 0;
  private resolvers = new Map<string, Array<(value: DurableEquipmentMetadata) => void>>();
  private rejectors = new Map<string, Array<(reason?: unknown) => void>>();

  async collectDurableEquipmentMetadata(input: {
    item: { id: string; name: string; model?: string; purchase_link?: string };
  }) {
    this.calls.push(input.item.id);
    this.currentConcurrentCalls += 1;
    this.maxConcurrentCalls = Math.max(
      this.maxConcurrentCalls,
      this.currentConcurrentCalls,
    );

    return new Promise<DurableEquipmentMetadata>((resolve, reject) => {
      const resolvers = this.resolvers.get(input.item.id) ?? [];
      const rejectors = this.rejectors.get(input.item.id) ?? [];

      resolvers.push((value) => {
        this.currentConcurrentCalls -= 1;
        const remainingResolvers = this.resolvers.get(input.item.id) ?? [];
        remainingResolvers.shift();
        if (remainingResolvers.length === 0) {
          this.resolvers.delete(input.item.id);
        }

        const remainingRejectors = this.rejectors.get(input.item.id) ?? [];
        remainingRejectors.shift();
        if (remainingRejectors.length === 0) {
          this.rejectors.delete(input.item.id);
        }

        resolve(value);
      });
      rejectors.push((reason) => {
        this.currentConcurrentCalls -= 1;
        const remainingResolvers = this.resolvers.get(input.item.id) ?? [];
        remainingResolvers.shift();
        if (remainingResolvers.length === 0) {
          this.resolvers.delete(input.item.id);
        }

        const remainingRejectors = this.rejectors.get(input.item.id) ?? [];
        remainingRejectors.shift();
        if (remainingRejectors.length === 0) {
          this.rejectors.delete(input.item.id);
        }

        reject(reason);
      });

      this.resolvers.set(input.item.id, resolvers);
      this.rejectors.set(input.item.id, rejectors);
    });
  }

  complete(
    itemId: string,
    metadata: DurableEquipmentMetadata = createDurableMetadataPayload(itemId),
  ) {
    this.resolvers.get(itemId)?.[0]?.(metadata);
  }

  fail(itemId: string, error: unknown) {
    this.rejectors.get(itemId)?.[0]?.(error);
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

async function waitForTripAnalysisStatus(
  app: Awaited<ReturnType<typeof buildServer>>,
  tripId: string,
  expectedStatus: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${tripId}/analysis-status`,
    });
    const body = response.json();

    if (body.status === expectedStatus) {
      return body;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for analysis status: ${expectedStatus}`);
}

async function waitForDurableMetadataJobStatus(
  app: Awaited<ReturnType<typeof buildServer>>,
  itemId: string,
  expectedStatus: DurableMetadataJobStatusResponse["status"] | null,
) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: "/api/equipment/durable/metadata-statuses",
    });
    const body = response.json();
    const status = body.items.find(
      (item: DurableMetadataJobStatusResponse) => item.item_id === itemId,
    );

    if ((expectedStatus === null && !status) || status?.status === expectedStatus) {
      return status ?? null;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for metadata status: ${expectedStatus}`);
}

async function waitForDurableMetadataJobStatuses(
  app: Awaited<ReturnType<typeof buildServer>>,
  predicate: (items: DurableMetadataJobStatusResponse[]) => boolean,
) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: "/api/equipment/durable/metadata-statuses",
    });
    const body = response.json() as { items: DurableMetadataJobStatusResponse[] };

    if (predicate(body.items)) {
      return body.items;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for metadata statuses");
}

function createDurableMetadataPayload(itemId: string): DurableEquipmentMetadata {
  return {
    lookup_status: "found",
    searched_at: "2026-03-23T12:00:00.000Z",
    query: `${itemId} metadata query`,
    summary: `${itemId} 메타데이터를 확인했습니다.`,
    product: {
      brand: "A사",
      official_name: `${itemId} 공식명`,
      model: `${itemId} 모델`,
    },
    packing: {
      width_cm: 68,
      depth_cm: 34,
      height_cm: 30,
      weight_kg: 14.5,
    },
    planning: {
      setup_time_minutes: 20,
      recommended_people: 2,
      capacity_people: 4,
      season_notes: ["봄, 여름, 가을 중심으로 사용 적합"],
      weather_notes: ["우천 시 플라이를 먼저 확인"],
    },
    sources: [
      {
        title: `${itemId} 상품 페이지`,
        url: "https://example.com/product",
        domain: "example.com",
      },
    ],
  };
}

function createDurableEquipmentItemInput(
  itemId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: itemId,
    kind: `${itemId}-kind`,
    name: `${itemId} 장비`,
    category: "storage",
    quantity: 1,
    status: "ok",
    ...overrides,
  };
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

  it("creates and lists timestamped local data backups", async () => {
    const dataDir = await createSeededDataDir();
    const backupDir = path.join(path.dirname(dataDir), ".camping-backups");
    const app = await buildServer({
      dataDir,
      backupDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/data-backups",
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().item).toEqual(
      expect.objectContaining({
        reason: "manual",
        source_path: dataDir,
      }),
    );

    const backupSnapshot = createResponse.json().item;
    expect(
      await readFile(path.join(backupSnapshot.data_path, "equipment", "durable.yaml"), "utf8"),
    ).toContain("tunnel-tent-4p-khaki");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/data-backups",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toEqual([backupSnapshot]);

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

  it("manages vehicles through CRUD endpoints and blocks deleting a referenced vehicle", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/vehicles",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "family-suv",
          name: "패밀리 SUV",
        }),
      ]),
    );

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/vehicles",
      payload: {
        id: "mini-van",
        name: "미니밴",
        description: "짐칸이 넓은 보조 차량",
        passenger_capacity: 7,
        load_capacity_kg: 550,
        notes: ["루프박스 없이 적재"],
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().item).toEqual(
      expect.objectContaining({
        id: "mini-van",
        name: "미니밴",
      }),
    );

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/vehicles/mini-van",
      payload: {
        id: "should-be-ignored",
        name: "미니밴 업데이트",
        description: "보조 차량",
        passenger_capacity: 7,
        load_capacity_kg: 600,
        notes: ["트레일러 연결 가능"],
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().item).toEqual(
      expect.objectContaining({
        id: "mini-van",
        name: "미니밴 업데이트",
        load_capacity_kg: 600,
      }),
    );

    const conflictDeleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/vehicles/family-suv",
    });

    expect(conflictDeleteResponse.statusCode).toBe(409);
    expect(conflictDeleteResponse.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "CONFLICT",
        }),
      }),
    );

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/vehicles/mini-van",
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ status: "deleted" });

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

  it("queues background analysis and saves markdown output after completion", async () => {
    const dataDir = await createSeededDataDir();
    const markdown = "# 테스트 분석 결과";
    const modelClient = new DeferredAnalysisClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        status: "queued",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      }),
    );

    modelClient.complete(markdown);
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "completed");

    const saved = await readFile(
      path.join(dataDir, "outputs", "2026-04-18-gapyeong-plan.md"),
      "utf8",
    );
    expect(saved).toBe(markdown);

    await app.close();
  });

  it("includes next camping recommendation context and links in the analyze prompt", async () => {
    const dataDir = await createSeededDataDir();
    const modelClient = new CapturingAnalysisClient("# 테스트 분석 결과");
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
      },
    });

    expect(response.statusCode).toBe(202);
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "completed");
    expect(modelClient.lastInput?.userPrompt).toContain(
      "## next-camping-recommendation-context",
    );
    expect(modelClient.lastInput?.userPrompt).toContain(
      "reference_date: 2026-04-19",
    );
    expect(modelClient.lastInput?.userPrompt).toContain(
      "family_friendly_required: true",
    );
    expect(modelClient.lastInput?.userPrompt).toContain("## links.yaml");
    expect(modelClient.lastInput?.userPrompt).toContain("name: 기상청");
    expect(modelClient.lastInput?.userPrompt).toContain("start: 2026-04-25");

    await app.close();
  });

  it("returns the current running status instead of starting duplicate analysis for the same trip", async () => {
    const dataDir = await createSeededDataDir();
    const modelClient = new DeferredAnalysisClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
    });

    const [firstResponse, secondResponse] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/analyze-trip",
        payload: {
          trip_id: "2026-04-18-gapyeong",
        },
      }),
      app.inject({
        method: "POST",
        url: "/api/analyze-trip",
        payload: {
          trip_id: "2026-04-18-gapyeong",
        },
      }),
    ]);

    expect(firstResponse.statusCode).toBe(202);
    expect(secondResponse.statusCode).toBe(202);
    expect(["queued", "running"]).toContain(firstResponse.json().status);
    expect(["queued", "running"]).toContain(secondResponse.json().status);

    modelClient.complete("# 중복 방지 테스트");
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "completed");
    expect(modelClient.calls).toBe(1);

    await app.close();
  });

  it("marks stale pending analysis as interrupted on startup", async () => {
    const dataDir = await createSeededDataDir();
    const statusPath = path.join(
      dataDir,
      "cache",
      "analysis-jobs",
      "2026-04-18-gapyeong.json",
    );

    await mkdir(path.dirname(statusPath), { recursive: true });
    await writeFile(
      statusPath,
      JSON.stringify(
        {
          trip_id: "2026-04-18-gapyeong",
          status: "running",
          requested_at: "2026-03-24T09:00:00.000Z",
          started_at: "2026-03-24T09:00:05.000Z",
          finished_at: null,
          output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        },
        null,
        2,
      ),
      "utf8",
    );

    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/trips/2026-04-18-gapyeong/analysis-status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        status: "interrupted",
        error: expect.objectContaining({
          message: "API 서버 재시작으로 이전 분석이 중단되었습니다.",
        }),
      }),
    );

    await app.close();
  });

  it("blocks deleting and archiving a trip while analysis is running", async () => {
    const dataDir = await createSeededDataDir();
    const modelClient = new DeferredAnalysisClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
    });

    await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
      },
    });
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "running");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/trips/2026-04-18-gapyeong",
    });
    const archiveResponse = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/archive",
    });

    expect(deleteResponse.statusCode).toBe(409);
    expect(deleteResponse.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "CONFLICT",
        }),
      }),
    );
    expect(archiveResponse.statusCode).toBe(409);
    expect(archiveResponse.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "CONFLICT",
        }),
      }),
    );

    modelClient.complete("# 충돌 종료");
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "completed");

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

  it("keeps placeholder companion snapshots when archiving a trip with unknown companion ids", async () => {
    const dataDir = await createSeededDataDir();
    const tripPath = path.join(dataDir, "trips", "2026-04-18-gapyeong.yaml");
    const trip = parse(await readFile(tripPath, "utf8")) as Record<string, unknown>;

    trip.party = {
      companion_ids: ["self", "ghost"],
    };

    await writeFile(tripPath, stringify(trip), "utf8");

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
        companion_ids: ["self", "ghost"],
        companion_snapshots: expect.arrayContaining([
          expect.objectContaining({
            id: "self",
            name: "본인",
          }),
          expect.objectContaining({
            id: "ghost",
            name: "ghost",
          }),
        ]),
      }),
    );

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

    const createConsumableResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/consumables/items",
      payload: {
        name: "숯",
        category: "fuel",
        quantity_on_hand: 1,
        unit: "bag",
        low_stock_threshold: 2,
      },
    });

    expect(createConsumableResponse.statusCode).toBe(200);
    expect(createConsumableResponse.json().item).toEqual(
      expect.objectContaining({
        name: "숯",
        category: "fuel",
        quantity_on_hand: 1,
        unit: "bag",
        low_stock_threshold: 2,
      }),
    );
    expect(createConsumableResponse.json().item).not.toHaveProperty("status");
    const createdConsumableId = createConsumableResponse.json().item.id as string;

    const updateConsumableResponse = await app.inject({
      method: "PUT",
      url: `/api/equipment/consumables/items/${createdConsumableId}`,
      payload: {
        id: createdConsumableId,
        name: "숯",
        category: "fuel",
        quantity_on_hand: 3,
        unit: "bag",
        low_stock_threshold: 2,
      },
    });

    expect(updateConsumableResponse.statusCode).toBe(200);
    expect(updateConsumableResponse.json().item).toEqual(
      expect.objectContaining({
        id: createdConsumableId,
        quantity_on_hand: 3,
        low_stock_threshold: 2,
      }),
    );
    expect(updateConsumableResponse.json().item).not.toHaveProperty("status");

    const createCategoryResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/categories/durable",
      payload: {
        id: "storage_box",
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

  it("refreshes durable equipment metadata in the background and merges it into the equipment catalog", async () => {
    const dataDir = await createSeededDataDir();
    const metadataClient = new DeferredEquipmentMetadataClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      equipmentMetadataClient: metadataClient,
    });

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/equipment/durable/items/tunnel-tent-4p-khaki",
      payload: {
        id: "tunnel-tent-4p-khaki",
        kind: "tunnel-tent-4p",
        name: "4인용 터널 텐트 카키",
        model: "A사 패밀리 터널 4P",
        purchase_link: "https://example.com/product",
        category: "shelter",
        quantity: 1,
        capacity: {
          people: 4,
        },
        season_support: {
          spring: true,
          summer: true,
          autumn: true,
          winter: false,
        },
        tags: ["family", "rain_cover"],
        status: "ok",
      },
    });

    expect(updateResponse.statusCode).toBe(200);

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/durable/items/tunnel-tent-4p-khaki/metadata/refresh",
    });

    expect(refreshResponse.statusCode).toBe(202);
    expect(refreshResponse.json()).toEqual(
      expect.objectContaining({
        item_id: "tunnel-tent-4p-khaki",
        status: "queued",
      }),
    );

    const metadataPath = path.join(
      dataDir,
      "cache",
      "equipment-metadata",
      "durable",
      "tunnel-tent-4p-khaki.json",
    );
    const statusPath = path.join(
      dataDir,
      "cache",
      "equipment-metadata",
      "jobs",
      "durable",
      "tunnel-tent-4p-khaki.json",
    );

    const runningStatus = await waitForDurableMetadataJobStatus(
      app,
      "tunnel-tent-4p-khaki",
      "running",
    );

    expect(runningStatus).toEqual(
      expect.objectContaining({
        item_id: "tunnel-tent-4p-khaki",
        status: "running",
      }),
    );
    expect(metadataClient.calls).toEqual(["tunnel-tent-4p-khaki"]);
    await expect(readFile(metadataPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    metadataClient.complete(
      "tunnel-tent-4p-khaki",
      {
        ...createDurableMetadataPayload("tunnel-tent-4p-khaki"),
        query: "4인용 터널 텐트 카키 A사 패밀리 터널 4P",
      },
    );
    await waitForDurableMetadataJobStatus(app, "tunnel-tent-4p-khaki", null);

    expect(
      JSON.parse(await readFile(metadataPath, "utf8")),
    ).toEqual(
      expect.objectContaining({
        lookup_status: "found",
        query: expect.stringContaining("터널 텐트"),
      }),
    );
    await expect(readFile(statusPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    const catalogResponse = await app.inject({
      method: "GET",
      url: "/api/equipment",
    });

    expect(catalogResponse.statusCode).toBe(200);
    expect(catalogResponse.json().durable.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tunnel-tent-4p-khaki",
          purchase_link: "https://example.com/product",
          metadata: expect.objectContaining({
            lookup_status: "found",
          }),
        }),
      ]),
    );

    await app.inject({
      method: "DELETE",
      url: "/api/equipment/durable/items/tunnel-tent-4p-khaki",
    });

    await expect(readFile(metadataPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(statusPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    await app.close();
  });

  it("stores an explicit not_found metadata state when nothing usable is found", async () => {
    const dataDir = await createSeededDataDir();
    const metadataClient = new MockEquipmentMetadataClient({
      lookup_status: "not_found",
      searched_at: "2026-03-23T12:00:00.000Z",
      query: "unknown gear",
      summary: "검색 결과에서 장비 재원 정보를 확인하지 못함.",
      sources: [],
    });
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      equipmentMetadataClient: metadataClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/equipment/durable/items/folding-table/metadata/refresh",
    });

    expect(response.statusCode).toBe(202);
    await waitForDurableMetadataJobStatus(app, "folding-table", null);

    const catalogResponse = await app.inject({
      method: "GET",
      url: "/api/equipment",
    });
    const item = catalogResponse
      .json()
      .durable.items.find((candidate: { id: string }) => candidate.id === "folding-table");

    expect(item?.metadata).toEqual(
      expect.objectContaining({
        lookup_status: "not_found",
        summary: expect.stringContaining("확인하지 못함"),
      }),
    );

    await app.close();
  });

  it("clears stale durable metadata when the metadata search inputs change", async () => {
    const dataDir = await createSeededDataDir();
    const metadataClient = new DeferredEquipmentMetadataClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      equipmentMetadataClient: metadataClient,
    });

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/durable/items/tunnel-tent-4p-khaki/metadata/refresh",
    });

    expect(refreshResponse.statusCode).toBe(202);
    await waitForDurableMetadataJobStatus(app, "tunnel-tent-4p-khaki", "running");

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/equipment/durable/items/tunnel-tent-4p-khaki",
      payload: {
        id: "tunnel-tent-4p-khaki",
        kind: "tunnel-tent-4p",
        name: "4인용 터널 텐트 샌드",
        model: "A사 패밀리 터널 4P 샌드",
        purchase_link: "https://example.com/product-sand",
        category: "shelter",
        quantity: 1,
        capacity: {
          people: 4,
        },
        season_support: {
          spring: true,
          summer: true,
          autumn: true,
          winter: false,
        },
        tags: ["family", "rain_cover"],
        status: "ok",
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().item.metadata).toBeUndefined();

    const catalogResponse = await app.inject({
      method: "GET",
      url: "/api/equipment",
    });

    expect(catalogResponse.statusCode).toBe(200);
    const updatedItem = catalogResponse
      .json()
      .durable.items.find((item: { id: string }) => item.id === "tunnel-tent-4p-khaki");
    expect(updatedItem?.metadata).toBeUndefined();

    metadataClient.complete(
      "tunnel-tent-4p-khaki",
      createDurableMetadataPayload("tunnel-tent-4p-khaki"),
    );

    await waitForDurableMetadataJobStatuses(app, (items) => {
      const status = items.find((item) => item.item_id === "tunnel-tent-4p-khaki");
      return status?.status === "running" && metadataClient.calls.length === 2;
    });

    metadataClient.complete("tunnel-tent-4p-khaki", {
      ...createDurableMetadataPayload("tunnel-tent-4p-khaki"),
      query: "4인용 터널 텐트 샌드 A사 패밀리 터널 4P 샌드",
      summary: "샌드 색상 기준 메타데이터를 다시 수집했습니다.",
      product: {
        brand: "A사",
        official_name: "A사 패밀리 터널 4P 샌드",
        model: "패밀리 터널 4P 샌드",
      },
    });
    await waitForDurableMetadataJobStatus(app, "tunnel-tent-4p-khaki", null);

    const refreshedCatalogResponse = await app.inject({
      method: "GET",
      url: "/api/equipment",
    });
    const refreshedItem = refreshedCatalogResponse
      .json()
      .durable.items.find((item: { id: string }) => item.id === "tunnel-tent-4p-khaki");

    expect(metadataClient.calls).toEqual([
      "tunnel-tent-4p-khaki",
      "tunnel-tent-4p-khaki",
    ]);
    expect(refreshedItem?.metadata).toEqual(
      expect.objectContaining({
        query: "4인용 터널 텐트 샌드 A사 패밀리 터널 4P 샌드",
        summary: "샌드 색상 기준 메타데이터를 다시 수집했습니다.",
      }),
    );

    await app.close();
  });

  it("deduplicates repeated durable metadata refresh requests for the same item", async () => {
    const dataDir = await createSeededDataDir();
    const metadataClient = new DeferredEquipmentMetadataClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      equipmentMetadataClient: metadataClient,
    });

    const [firstResponse, secondResponse] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/equipment/durable/items/tunnel-tent-4p-khaki/metadata/refresh",
      }),
      app.inject({
        method: "POST",
        url: "/api/equipment/durable/items/tunnel-tent-4p-khaki/metadata/refresh",
      }),
    ]);

    expect(firstResponse.statusCode).toBe(202);
    expect(secondResponse.statusCode).toBe(202);
    await waitForDurableMetadataJobStatus(app, "tunnel-tent-4p-khaki", "running");
    expect(metadataClient.calls).toEqual(["tunnel-tent-4p-khaki"]);

    metadataClient.complete("tunnel-tent-4p-khaki");
    await waitForDurableMetadataJobStatus(app, "tunnel-tent-4p-khaki", null);

    await app.close();
  });

  it("runs up to three durable metadata refresh jobs in parallel and queues the rest", async () => {
    const dataDir = await createSeededDataDir();
    const metadataClient = new DeferredEquipmentMetadataClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      equipmentMetadataClient: metadataClient,
    });

    const itemIds = [
      "metadata-slot-1",
      "metadata-slot-2",
      "metadata-slot-3",
      "metadata-slot-4",
    ];

    for (const itemId of itemIds) {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/equipment/durable/items",
        payload: createDurableEquipmentItemInput(itemId),
      });

      expect(createResponse.statusCode).toBe(200);
    }

    await Promise.all(
      itemIds.map((itemId) =>
        app.inject({
          method: "POST",
          url: `/api/equipment/durable/items/${itemId}/metadata/refresh`,
        }),
      ),
    );

    const initialStatuses = await waitForDurableMetadataJobStatuses(app, (items) => {
      const runningCount = items.filter((item) => item.status === "running").length;
      const queuedCount = items.filter((item) => item.status === "queued").length;

      return runningCount === 3 && queuedCount === 1;
    });

    const queuedItemId = initialStatuses.find((item) => item.status === "queued")?.item_id;
    const runningItemIds = initialStatuses
      .filter((item) => item.status === "running")
      .map((item) => item.item_id);

    expect(queuedItemId).toBeDefined();
    expect(runningItemIds).toHaveLength(3);

    metadataClient.complete(runningItemIds[0]);

    await waitForDurableMetadataJobStatuses(app, (items) => {
      const queuedItem = items.find((item) => item.item_id === queuedItemId);
      return queuedItem?.status === "running";
    });

    for (const itemId of itemIds.filter((itemId) => itemId !== runningItemIds[0])) {
      metadataClient.complete(itemId);
    }

    for (const itemId of itemIds) {
      await waitForDurableMetadataJobStatus(app, itemId, null);
    }

    expect(metadataClient.maxConcurrentCalls).toBe(3);

    await app.close();
  });

  it("ignores stale in-flight results when a deleted durable item id is recreated", async () => {
    const dataDir = await createSeededDataDir();
    const metadataClient = new DeferredEquipmentMetadataClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      equipmentMetadataClient: metadataClient,
    });

    const itemId = "metadata-reuse";
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/durable/items",
      payload: createDurableEquipmentItemInput(itemId, {
        name: "기존 장비",
        purchase_link: "https://example.com/old",
      }),
    });

    expect(createResponse.statusCode).toBe(200);

    const firstRefreshResponse = await app.inject({
      method: "POST",
      url: `/api/equipment/durable/items/${itemId}/metadata/refresh`,
    });

    expect(firstRefreshResponse.statusCode).toBe(202);
    await waitForDurableMetadataJobStatus(app, itemId, "running");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/equipment/durable/items/${itemId}`,
    });

    expect(deleteResponse.statusCode).toBe(200);

    const recreateResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/durable/items",
      payload: createDurableEquipmentItemInput(itemId, {
        name: "새 장비",
        model: "신형 모델",
        purchase_link: "https://example.com/new",
      }),
    });

    expect(recreateResponse.statusCode).toBe(200);

    const secondRefreshResponse = await app.inject({
      method: "POST",
      url: `/api/equipment/durable/items/${itemId}/metadata/refresh`,
    });

    expect(secondRefreshResponse.statusCode).toBe(202);
    await waitForDurableMetadataJobStatus(app, itemId, "running");

    metadataClient.complete(itemId, {
      ...createDurableMetadataPayload(itemId),
      query: "기존 장비 old metadata",
      summary: "삭제된 장비에서 수집한 오래된 결과입니다.",
    });

    const runningAfterOldCompletion = await waitForDurableMetadataJobStatus(
      app,
      itemId,
      "running",
    );

    expect(runningAfterOldCompletion).toEqual(
      expect.objectContaining({
        item_id: itemId,
        status: "running",
      }),
    );

    metadataClient.complete(itemId, {
      ...createDurableMetadataPayload(itemId),
      query: "새 장비 new metadata",
      summary: "재생성된 장비 기준 최신 메타데이터입니다.",
      product: {
        brand: "B사",
        official_name: "새 장비 공식명",
        model: "신형 모델",
      },
    });

    await waitForDurableMetadataJobStatus(app, itemId, null);

    const catalogResponse = await app.inject({
      method: "GET",
      url: "/api/equipment",
    });
    const reusedItem = catalogResponse
      .json()
      .durable.items.find((item: { id: string }) => item.id === itemId);

    expect(metadataClient.calls).toEqual([itemId, itemId]);
    expect(reusedItem).toEqual(
      expect.objectContaining({
        id: itemId,
        name: "새 장비",
        metadata: expect.objectContaining({
          query: "새 장비 new metadata",
          summary: "재생성된 장비 기준 최신 메타데이터입니다.",
        }),
      }),
    );

    await app.close();
  });

  it("rejects category creation when the category code is missing", async () => {
    const dataDir = await createSeededDataDir();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/equipment/categories/durable",
      payload: {
        label: "타프",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "TRIP_INVALID",
          message: expect.stringContaining("id: 값이 필요합니다."),
        }),
      }),
    );

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

  it("marks the background analysis as failed when output saving fails", async () => {
    const dataDir = await createSeededDataDir();
    const outputsPath = path.join(dataDir, "outputs");

    await rm(outputsPath, { recursive: true, force: true });
    await writeFile(outputsPath, "blocked", "utf8");

    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# 테스트 분석 결과"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        save_output: true,
      },
    });

    expect(response.statusCode).toBe(202);
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "failed");

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/trips/2026-04-18-gapyeong/analysis-status",
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        status: "failed",
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

  it("rejects save_output=false because background analysis always saves the output file", async () => {
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
        save_output: false,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "TRIP_INVALID",
          message: "비동기 분석은 save_output=false 를 지원하지 않습니다.",
        }),
      }),
    );

    await app.close();
  });
});
