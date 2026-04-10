import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  TRIP_ANALYSIS_CATEGORY_METADATA,
  type BackendHealth,
  type HistoryLearningInsight,
  type DurableMetadataJobStatusResponse,
  type CampsiteTipsResearch,
  type DurableEquipmentMetadata,
  type TripBundle,
  type TripWeatherResearch,
  type UserLearningProfile,
} from "@camping/shared";
import { buildAiJobEventStreamHeaders } from "../src/routes/api-routes";
import { buildServer } from "../src/server";
import type {
  AnalysisEmailClient,
  SendAnalysisResultEmailInput,
  SendAnalysisResultEmailResult,
} from "../src/services/analysis-email-service";
import type { CampsiteTipSearchClient } from "../src/services/campsite-tip-service";
import type { EquipmentMetadataSearchClient } from "../src/services/equipment-metadata-service";
import type { AnalysisModelClient } from "../src/services/openai-client";
import type { TripWeatherSearchClient } from "../src/services/trip-weather-service";
import type { UserLearningClient } from "../src/services/user-learning-service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

const tempDirs: string[] = [];

class MockAnalysisClient implements AnalysisModelClient {
  constructor(private readonly markdown: string) {}

  async generateMarkdown(_input: {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }) {
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

  async generateMarkdown(input: {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }) {
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
  public aborts = 0;
  private resolvers: Array<(value: string) => void> = [];
  private rejectors: Array<(reason?: unknown) => void> = [];
  private resolvedMarkdown: string | null = null;

  async generateMarkdown(input: {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }) {
    this.calls += 1;

    if (this.resolvedMarkdown !== null) {
      return this.resolvedMarkdown;
    }

    if (input.signal?.aborted) {
      this.aborts += 1;
      return Promise.reject(createAbortError());
    }

    return new Promise<string>((resolve, reject) => {
      this.resolvers.push(resolve);
      this.rejectors.push(reject);

      input.signal?.addEventListener(
        "abort",
        () => {
          this.aborts += 1;
          const nextResolve = this.resolvers.shift();
          const nextReject = this.rejectors.shift();

          if (nextResolve || nextReject) {
            nextReject?.(createAbortError());
          } else {
            reject(createAbortError());
          }
        },
        { once: true },
      );
    });
  }

  complete(markdown: string) {
    this.resolvedMarkdown = markdown;
    const resolvers = [...this.resolvers];

    this.resolvers = [];
    this.rejectors = [];

    for (const resolve of resolvers) {
      resolve(markdown);
    }
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

class MockAnalysisEmailClient implements AnalysisEmailClient {
  public calls: SendAnalysisResultEmailInput[] = [];

  async sendAnalysisResultEmail(
    input: SendAnalysisResultEmailInput,
  ): Promise<SendAnalysisResultEmailResult> {
    this.calls.push(input);

    return {
      sentAt: "2026-03-24T11:00:00.000Z",
      sentCount: input.recipients.length,
      recipients: input.recipients,
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
    signal?: AbortSignal;
  }) {
    this.lastItem = input.item;
    return this.metadata;
  }
}

class DeferredEquipmentMetadataClient implements EquipmentMetadataSearchClient {
  public calls: string[] = [];
  public aborts: string[] = [];
  public maxConcurrentCalls = 0;
  private currentConcurrentCalls = 0;
  private resolvers = new Map<string, Array<(value: DurableEquipmentMetadata) => void>>();
  private rejectors = new Map<string, Array<(reason?: unknown) => void>>();
  private ignoredCompletions = new Map<string, number>();

  async collectDurableEquipmentMetadata(input: {
    item: { id: string; name: string; model?: string; purchase_link?: string };
    signal?: AbortSignal;
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

      input.signal?.addEventListener(
        "abort",
        () => {
          this.aborts.push(input.item.id);
          this.ignoredCompletions.set(
            input.item.id,
            (this.ignoredCompletions.get(input.item.id) ?? 0) + 1,
          );
          rejectors[0]?.(createAbortError());
        },
        { once: true },
      );
    });
  }

  complete(
    itemId: string,
    metadata: DurableEquipmentMetadata = createDurableMetadataPayload(itemId),
  ) {
    const ignoredCount = this.ignoredCompletions.get(itemId) ?? 0;

    if (ignoredCount > 0) {
      if (ignoredCount === 1) {
        this.ignoredCompletions.delete(itemId);
      } else {
        this.ignoredCompletions.set(itemId, ignoredCount - 1);
      }

      return;
    }

    this.resolvers.get(itemId)?.[0]?.(metadata);
  }

  fail(itemId: string, error: unknown) {
    this.rejectors.get(itemId)?.[0]?.(error);
  }
}

class MockCampsiteTipClient implements CampsiteTipSearchClient {
  public calls = 0;

  constructor(
    private readonly research: CampsiteTipsResearch = {
      lookup_status: "found",
      searched_at: "2026-03-26T08:00:00.000Z",
      query: "자라섬 캠핑장 후기 블로그",
      campsite_name: "자라섬 캠핑장",
      region: "gapyeong",
      summary: "그늘, 철길 소음, 장보기 접근성 관련 후기 팁이 반복 확인됨.",
      tip_items: [
        {
          title: "낮 체류가 길면 타프나 차광막을 따로 준비",
          detail: "낮 시간 차광이 약하다는 후기가 반복되어 봄·여름에는 타프나 차광막 준비가 유용함.",
          helpful_for: "아이 동행, 낮 체류 시간이 긴 일정",
        },
        {
          title: "철길 가까운 구역은 소음 확인하기",
          detail: "일부 후기에서 전철 통과 소음을 언급해 예민하면 배치나 수면 시간을 고려하는 편이 좋음.",
          helpful_for: "예민한 수면, 어린 자녀 동반",
        },
      ],
      best_site_items: [
        {
          site_name: "오토캠핑장 안쪽 159~175번",
          reason: "철길과 조금 더 떨어진 안쪽 구역으로 언급돼 소음 회피 후보로 볼 수 있음.",
          helpful_for: "아이 낮잠, 늦잠, 조용한 배치 선호",
          caution: "캠핑장 전체에서 전철 소음은 들릴 수 있음.",
        },
      ],
      sources: [
        {
          title: "자라섬오토캠핑장 오랜만에 후기",
          url: "https://bemeal2.tistory.com/144",
          domain: "bemeal2.tistory.com",
        },
      ],
    },
  ) {}

  async collectCampsiteTips(_input: { bundle: TripBundle; signal?: AbortSignal }) {
    this.calls += 1;
    return this.research;
  }
}

class MockTripWeatherClient implements TripWeatherSearchClient {
  public calls: Array<{
    region: string;
    startDate?: string;
    endDate?: string;
    campsiteName?: string;
  }> = [];

  constructor(
    private readonly research: TripWeatherResearch = {
      lookup_status: "found",
      searched_at: "2026-04-10T08:00:00.000Z",
      query: "gapyeong 자라섬 캠핑장 2026-04-18 2026-04-19 날씨",
      region: "gapyeong",
      campsite_name: "자라섬 캠핑장",
      start_date: "2026-04-18",
      end_date: "2026-04-19",
      summary: "흐리고 오후 한때 비 가능성",
      min_temp_c: 11,
      max_temp_c: 18,
      precipitation: "토요일 오후 한때 비 예보",
      search_result_excerpt: "Google 날씨 카드에 흐리고 오후 비 가능성이 표시됨",
      source: "google-search-ai",
      google_search_url:
        "https://www.google.com/search?hl=ko&gl=kr&q=gapyeong%20weather",
      notes: [],
      sources: [
        {
          title: "Google 검색 결과",
          url: "https://www.google.com/search?hl=ko&gl=kr&q=gapyeong%20weather",
          domain: "www.google.com",
        },
      ],
    },
  ) {}

  async collectTripWeather(input: {
    region: string;
    startDate?: string;
    endDate?: string;
    campsiteName?: string;
    signal?: AbortSignal;
  }): Promise<TripWeatherResearch> {
    this.calls.push({
      region: input.region,
      startDate: input.startDate,
      endDate: input.endDate,
      campsiteName: input.campsiteName,
    });

    return this.research;
  }
}

class MockUserLearningClient implements UserLearningClient {
  public retrospectiveCalls: string[] = [];
  public profileCalls = 0;

  async analyzeHistoryRetrospective(input: {
    history: { history_id: string; retrospectives: unknown[] };
    outputMarkdown: string | null;
    promptTemplate: string;
    signal?: AbortSignal;
  }): Promise<HistoryLearningInsight> {
    this.retrospectiveCalls.push(input.history.history_id);

    return {
      history_id: input.history.history_id,
      updated_at: "2026-03-29T10:00:00.000Z",
      source_entry_count: input.history.retrospectives.length,
      summary: "실제 회고를 반영해 다음 준비 힌트를 정리함.",
      behavior_patterns: ["아이 장비를 여유 있게 챙기는 편"],
      equipment_hints: ["타프와 방풍 장비를 우선 점검"],
      meal_hints: ["따뜻한 국물 메뉴 선호"],
      route_hints: ["정체 구간을 피하려고 이른 출발 선호"],
      campsite_hints: ["그늘과 화장실 접근성을 중요하게 봄"],
      avoidances: ["강풍 노출 사이트 회피"],
      issues: ["야간 보온 준비가 부족했음"],
      next_time_requests: ["아이 여벌 옷 추가"],
      next_trip_focus: ["보온과 차광을 함께 준비"],
    };
  }

  async synthesizeUserLearningProfile(input: {
    insights: HistoryLearningInsight[];
    promptTemplate: string;
    signal?: AbortSignal;
  }): Promise<UserLearningProfile> {
    this.profileCalls += 1;

    return {
      updated_at: "2026-03-29T10:05:00.000Z",
      source_history_ids: input.insights.map((insight) => insight.history_id),
      source_entry_count: input.insights.reduce(
        (total, insight) => total + insight.source_entry_count,
        0,
      ),
      summary: "아이 동반 기준으로 보온, 차광, 동선 여유를 중시하는 사용자 패턴이 누적됨.",
      behavior_patterns: ["아이 동반 장비를 여유 있게 챙김"],
      equipment_hints: ["보온 장비와 타프를 먼저 점검"],
      meal_hints: ["간단하지만 따뜻한 메뉴 선호"],
      route_hints: ["정체 전 출발과 짧은 휴게소 정차 선호"],
      campsite_hints: ["아이 편의시설과 그늘을 우선 확인"],
      avoidances: ["강풍 노출 사이트 회피"],
      next_trip_focus: ["보온과 차광 장비 우선 확인"],
    };
  }
}

class DeferredUserLearningClient implements UserLearningClient {
  public retrospectiveCalls: string[] = [];
  public profileCalls = 0;
  public aborts = 0;
  private retrospectiveResolvers: Array<(value: HistoryLearningInsight) => void> = [];
  private profileResolvers: Array<(value: UserLearningProfile) => void> = [];

  async analyzeHistoryRetrospective(input: {
    history: { history_id: string; retrospectives: unknown[] };
    outputMarkdown: string | null;
    promptTemplate: string;
    signal?: AbortSignal;
  }): Promise<HistoryLearningInsight> {
    this.retrospectiveCalls.push(input.history.history_id);

    if (input.signal?.aborted) {
      this.aborts += 1;
      throw createAbortError();
    }

    return new Promise<HistoryLearningInsight>((resolve, reject) => {
      this.retrospectiveResolvers.push(resolve);
      input.signal?.addEventListener(
        "abort",
        () => {
          this.aborts += 1;
          reject(createAbortError());
        },
        { once: true },
      );
    });
  }

  async synthesizeUserLearningProfile(): Promise<UserLearningProfile> {
    this.profileCalls += 1;

    return new Promise<UserLearningProfile>((resolve) => {
      this.profileResolvers.push(resolve);
    });
  }

  completeRetrospective(historyId: string, sourceEntryCount: number) {
    this.retrospectiveResolvers.shift()?.({
      history_id: historyId,
      updated_at: "2026-03-29T10:00:00.000Z",
      source_entry_count: sourceEntryCount,
      summary: "실제 회고를 반영해 다음 준비 힌트를 정리함.",
      behavior_patterns: ["아이 장비를 여유 있게 챙기는 편"],
      equipment_hints: ["타프와 방풍 장비를 우선 점검"],
      meal_hints: ["따뜻한 국물 메뉴 선호"],
      route_hints: ["정체 구간을 피하려고 이른 출발 선호"],
      campsite_hints: ["그늘과 화장실 접근성을 중요하게 봄"],
      avoidances: ["강풍 노출 사이트 회피"],
      issues: ["야간 보온 준비가 부족했음"],
      next_time_requests: ["아이 여벌 옷 추가"],
      next_trip_focus: ["보온과 차광을 함께 준비"],
    });
  }

  completeProfile(historyIds: string[], sourceEntryCount: number) {
    this.profileResolvers.shift()?.({
      updated_at: "2026-03-29T10:05:00.000Z",
      source_history_ids: historyIds,
      source_entry_count: sourceEntryCount,
      summary: "아이 동반 기준으로 보온, 차광, 동선 여유를 중시하는 사용자 패턴이 누적됨.",
      behavior_patterns: ["아이 동반 장비를 여유 있게 챙김"],
      equipment_hints: ["보온 장비와 타프를 먼저 점검"],
      meal_hints: ["간단하지만 따뜻한 메뉴 선호"],
      route_hints: ["정체 전 출발과 짧은 휴게소 정차 선호"],
      campsite_hints: ["아이 편의시설과 그늘을 우선 확인"],
      avoidances: ["강풍 노출 사이트 회피"],
      next_trip_focus: ["보온과 차광 장비 우선 확인"],
    });
  }
}

function createAbortError() {
  const error = new Error("사용자 요청으로 AI 작업이 중단되었습니다.");
  error.name = "AbortError";
  return error;
}

async function createSeededDataDir() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-api-test-"));
  tempDirs.push(tempRoot);

  await cp(path.join(projectRoot, "docs", "examples"), path.join(tempRoot, ".camping-data"), {
    recursive: true,
  });

  return path.join(tempRoot, ".camping-data");
}

async function createCompletedAnalysisArtifacts(dataDir: string, tripId: string) {
  const outputPath = path.join(dataDir, "outputs", `${tripId}-plan.md`);
  const statusPath = path.join(dataDir, "cache", "analysis-jobs", `${tripId}.json`);
  const resultsPath = path.join(
    dataDir,
    "cache",
    "analysis-results",
    `${tripId}.json`,
  );
  const collectedAt = "2026-03-24T10:00:30.000Z";
  const resultCategories = ALL_TRIP_ANALYSIS_CATEGORIES.map((category) => {
    const [section] = TRIP_ANALYSIS_CATEGORY_METADATA[category].sections;

    return {
      category,
      label: TRIP_ANALYSIS_CATEGORY_METADATA[category].label,
      sections: TRIP_ANALYSIS_CATEGORY_METADATA[category].sections,
      markdown: `## ${section.order}. ${section.title}\n\n- ${category} 결과`,
      updated_at: collectedAt,
    };
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, "# 저장된 분석 결과\n\n- 메일 발송 테스트", "utf8");
  await mkdir(path.dirname(statusPath), { recursive: true });
  await writeFile(
    statusPath,
    JSON.stringify(
      {
        trip_id: tripId,
        status: "completed",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: "2026-03-24T10:00:30.000Z",
        output_path: `.camping-data/outputs/${tripId}-plan.md`,
        categories: ALL_TRIP_ANALYSIS_CATEGORIES.map((category) => ({
          category,
          label: TRIP_ANALYSIS_CATEGORY_METADATA[category].label,
          sections: TRIP_ANALYSIS_CATEGORY_METADATA[category].sections,
          status: "completed",
          has_result: true,
          requested_at: "2026-03-24T10:00:00.000Z",
          started_at: "2026-03-24T10:00:01.000Z",
          finished_at: collectedAt,
          collected_at: collectedAt,
        })),
        completed_category_count: ALL_TRIP_ANALYSIS_CATEGORIES.length,
        total_category_count: ALL_TRIP_ANALYSIS_CATEGORIES.length,
      },
      null,
      2,
    ),
    "utf8",
  );
  await mkdir(path.dirname(resultsPath), { recursive: true });
  await writeFile(
    resultsPath,
    JSON.stringify(
      {
        trip_id: tripId,
        title: "4월 가평 가족 캠핑",
        updated_at: collectedAt,
        categories: resultCategories,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function waitForTripWeatherSummary(
  dataDir: string,
  tripId: string,
  expectedSummary: string,
) {
  const tripPath = path.join(dataDir, "trips", `${tripId}.yaml`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const trip = parse(await readFile(tripPath, "utf8")) as {
      conditions?: {
        expected_weather?: {
          summary?: string;
        };
      };
    };

    if (trip.conditions?.expected_weather?.summary === expectedSummary) {
      return trip;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for collected weather: ${tripId}`);
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

async function waitForUserLearningStatus(
  app: Awaited<ReturnType<typeof buildServer>>,
  expectedStatus: string,
) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: "/api/user-learning",
    });
    const body = response.json();

    if (body.status?.status === expectedStatus) {
      return body;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for user learning status: ${expectedStatus}`);
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

  it("builds SSE headers with CORS for ai job event streams", () => {
    const headers = buildAiJobEventStreamHeaders("http://localhost:5173");

    expect(headers["Content-Type"]).toBe("text/event-stream; charset=utf-8");
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers.Vary).toBe("Origin");
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
        email: "ghost@example.com",
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
        email: "ghost@example.com",
      }),
    );

    const companions = parse(
      await readFile(path.join(dataDir, "companions.yaml"), "utf8"),
    ) as {
      companions: Array<{ id: string; email?: string }>;
    };

    expect(companions.companions.map((item) => item.id)).toContain("ghost");
    expect(
      companions.companions.find((item) => item.id === "ghost")?.email,
    ).toBe("ghost@example.com");

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

  it("rejects companion emails that are not valid email format", async () => {
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
        id: "ghost",
        name: "잘못된 메일",
        email: "not-an-email",
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
          message: expect.stringContaining("email"),
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

  it("collects trip weather from region and date inputs with the metadata client", async () => {
    const dataDir = await createSeededDataDir();
    const tripWeatherClient = new MockTripWeatherClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      tripWeatherClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/weather/collect",
      payload: {
        region: "gapyeong",
        campsite_name: "자라섬 캠핑장",
        start_date: "2026-04-18",
        end_date: "2026-04-19",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      item: expect.objectContaining({
        lookup_status: "found",
        region: "gapyeong",
        summary: "흐리고 오후 한때 비 가능성",
      }),
      expected_weather: {
        source: "google-search-ai",
        summary: "흐리고 오후 한때 비 가능성",
        min_temp_c: 11,
        max_temp_c: 18,
        precipitation: "토요일 오후 한때 비 예보",
      },
    });
    expect(tripWeatherClient.calls).toEqual([
      {
        region: "gapyeong",
        startDate: "2026-04-18",
        endDate: "2026-04-19",
        campsiteName: "자라섬 캠핑장",
      },
    ]);

    await app.close();
  });

  it("starts background weather collection after saving a trip with empty weather fields", async () => {
    const dataDir = await createSeededDataDir();
    const tripWeatherClient = new MockTripWeatherClient();
    const tripPath = path.join(dataDir, "trips", "2026-04-18-gapyeong.yaml");
    const trip = parse(await readFile(tripPath, "utf8")) as Record<string, unknown>;

    delete (trip.conditions as Record<string, unknown>).expected_weather;
    await writeFile(tripPath, stringify(trip), "utf8");

    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      tripWeatherClient,
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/trips/2026-04-18-gapyeong",
      payload: trip,
    });

    expect(response.statusCode).toBe(200);
    await waitForTripWeatherSummary(
      dataDir,
      "2026-04-18-gapyeong",
      "흐리고 오후 한때 비 가능성",
    );

    const refreshedTrip = parse(await readFile(tripPath, "utf8")) as {
      conditions?: {
        expected_weather?: {
          source?: string;
          summary?: string;
          precipitation?: string;
        };
      };
    };
    const weatherCachePath = path.join(
      dataDir,
      "cache",
      "weather",
      "2026-04-18-gapyeong-weather.json",
    );

    expect(refreshedTrip.conditions?.expected_weather).toEqual({
      source: "google-search-ai",
      summary: "흐리고 오후 한때 비 가능성",
      min_temp_c: 11,
      max_temp_c: 18,
      precipitation: "토요일 오후 한때 비 예보",
    });
    expect(JSON.parse(await readFile(weatherCachePath, "utf8"))).toEqual(
      expect.objectContaining({
        lookup_status: "found",
        summary: "흐리고 오후 한때 비 가능성",
      }),
    );
    expect(tripWeatherClient.calls).toEqual([
      {
        region: "gapyeong",
        startDate: "2026-04-18",
        endDate: "2026-04-19",
        campsiteName: "자라섬 캠핑장",
      },
    ]);

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
    const markdown = ["## 9. 캠핑장 tip", "", "- 테스트 캠핑장 tip"].join("\n");
    const modelClient = new DeferredAnalysisClient();
    const campsiteTipClient = new MockCampsiteTipClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
      campsiteTipClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        categories: ["campsite_tips"],
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
    expect(saved).toContain("# 4월 가평 가족 캠핑 캠핑 분석 결과");
    expect(saved).toContain("## 9. 캠핑장 tip");
    expect(saved).toContain("- 테스트 캠핑장 tip");
    expect(
      JSON.parse(
        await readFile(
          path.join(
            dataDir,
            "cache",
            "campsite-tips",
            "2026-04-18-gapyeong-campsite-tips.json",
          ),
          "utf8",
        ),
      ),
    ).toEqual(
      expect.objectContaining({
        lookup_status: "found",
        campsite_name: "자라섬 캠핑장",
        best_site_items: expect.arrayContaining([
          expect.objectContaining({
            site_name: "오토캠핑장 안쪽 159~175번",
          }),
        ]),
      }),
    );

    await app.close();
  });

  it("includes next camping recommendation context and links in the analyze prompt", async () => {
    const dataDir = await createSeededDataDir();
    const modelClient = new CapturingAnalysisClient("# 테스트 분석 결과");
    const campsiteTipClient = new MockCampsiteTipClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
      campsiteTipClient,
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
    expect(modelClient.lastInput?.userPrompt).toContain(
      "cache/campsite-tips/2026-04-18-gapyeong-campsite-tips.json",
    );
    expect(modelClient.lastInput?.userPrompt).toContain(
      "낮 체류가 길면 타프나 차광막을 따로 준비",
    );
    expect(modelClient.lastInput?.userPrompt).toContain(
      "\"오토캠핑장 안쪽 159~175번\"",
    );

    await app.close();
  });

  it("retries campsite tip research when the cached result is marked as failed", async () => {
    const dataDir = await createSeededDataDir();
    const cachedPath = path.join(
      dataDir,
      "cache",
      "campsite-tips",
      "2026-04-18-gapyeong-campsite-tips.json",
    );
    const campsiteTipClient = new MockCampsiteTipClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# 테스트 분석 결과"),
      campsiteTipClient,
    });

    await mkdir(path.dirname(cachedPath), { recursive: true });
    await writeFile(
      cachedPath,
      JSON.stringify(
        {
          lookup_status: "failed",
          searched_at: "2026-03-26T08:00:00.000Z",
          query: "자라섬 캠핑장 후기 블로그",
          campsite_name: "자라섬 캠핑장",
          region: "gapyeong",
          summary: "이전 조사 실패",
          tip_items: [],
          best_site_items: [],
          sources: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
      },
    });

    expect(response.statusCode).toBe(202);
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "completed");
    expect(campsiteTipClient.calls).toBe(1);
    expect(
      JSON.parse(await readFile(cachedPath, "utf8")) as CampsiteTipsResearch,
    ).toEqual(
      expect.objectContaining({
        lookup_status: "found",
        best_site_items: expect.arrayContaining([
          expect.objectContaining({
            site_name: "오토캠핑장 안쪽 159~175번",
          }),
        ]),
      }),
    );

    await app.close();
  });

  it("does not include another trip's campsite tip cache from the same region", async () => {
    const dataDir = await createSeededDataDir();
    const modelClient = new CapturingAnalysisClient("# 테스트 분석 결과");
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
      campsiteTipClient: new MockCampsiteTipClient(),
    });

    await mkdir(path.join(dataDir, "cache", "campsite-tips"), { recursive: true });
    await writeFile(
      path.join(dataDir, "cache", "campsite-tips", "2026-05-03-gapyeong-campsite-tips.json"),
      JSON.stringify(
        {
          lookup_status: "found",
          searched_at: "2026-03-26T08:00:00.000Z",
          query: "다른 가평 캠핑장 후기 블로그",
          campsite_name: "다른 캠핑장",
          region: "gapyeong",
          summary: "같은 지역이지만 다른 캠핑장 후기",
          tip_items: [
            {
              title: "다른 캠핑장 팁",
              detail: "현재 trip에는 포함되면 안 되는 내용",
              helpful_for: "혼입 검증",
            },
            {
              title: "다른 명당",
              detail: "같은 지역의 다른 캠핑장",
              helpful_for: "혼입 검증",
            },
          ],
          best_site_items: [
            {
              site_name: "Z9",
              reason: "다른 캠핑장 테스트 사이트",
              helpful_for: "혼입 검증",
              caution: "포함되면 안 됨",
            },
          ],
          sources: [
            {
              title: "테스트 후기 1",
              url: "https://example.com/other-campsite-1",
              domain: "example.com",
            },
            {
              title: "테스트 후기 2",
              url: "https://example.com/other-campsite-2",
              domain: "example.com",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

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
      "cache/campsite-tips/2026-04-18-gapyeong-campsite-tips.json",
    );
    expect(modelClient.lastInput?.userPrompt).not.toContain(
      "cache/campsite-tips/2026-05-03-gapyeong-campsite-tips.json",
    );
    expect(modelClient.lastInput?.userPrompt).not.toContain("다른 캠핑장 팁");
    expect(modelClient.lastInput?.userPrompt).not.toContain("\"Z9\"");

    await app.close();
  });

  it("returns the current running status instead of starting duplicate analysis for the same trip", async () => {
    const dataDir = await createSeededDataDir();
    const modelClient = new DeferredAnalysisClient();
    const campsiteTipClient = new MockCampsiteTipClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
      campsiteTipClient,
    });

    const [firstResponse, secondResponse] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/analyze-trip",
        payload: {
          trip_id: "2026-04-18-gapyeong",
          categories: ["equipment"],
        },
      }),
      app.inject({
        method: "POST",
        url: "/api/analyze-trip",
        payload: {
          trip_id: "2026-04-18-gapyeong",
          categories: ["equipment"],
        },
      }),
    ]);

    expect(firstResponse.statusCode).toBe(202);
    expect(secondResponse.statusCode).toBe(202);
    expect(["queued", "running"]).toContain(firstResponse.json().status);
    expect(["queued", "running"]).toContain(secondResponse.json().status);

    modelClient.complete("## 2. 추천 장비\n\n- 중복 방지 테스트");
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "completed");
    expect(modelClient.calls).toBe(1);

    await app.close();
  });

  it("cancels all running AI jobs and clears queued analysis sections", async () => {
    const dataDir = await createSeededDataDir();
    const modelClient = new DeferredAnalysisClient();
    const metadataClient = new DeferredEquipmentMetadataClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
      equipmentMetadataClient: metadataClient,
      campsiteTipClient: new MockCampsiteTipClient(),
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/durable/items",
      payload: createDurableEquipmentItemInput("cancel-all-metadata"),
    });

    expect(createResponse.statusCode).toBe(200);

    const analysisResponse = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        categories: ["summary", "equipment"],
      },
    });
    const metadataResponse = await app.inject({
      method: "POST",
      url: "/api/equipment/durable/items/cancel-all-metadata/metadata/refresh",
    });

    expect(analysisResponse.statusCode).toBe(202);
    expect(metadataResponse.statusCode).toBe(202);
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "running");
    await waitForDurableMetadataJobStatus(app, "cancel-all-metadata", "running");

    const cancelResponse = await app.inject({
      method: "POST",
      url: "/api/ai-jobs/cancel-all",
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toEqual({
      status: "cancelled",
      cancelled_analysis_trip_count: 1,
      cancelled_analysis_category_count: 2,
      cancelled_metadata_item_count: 1,
      cancelled_user_learning_job_count: 0,
    });

    const cancelledStatus = await waitForTripAnalysisStatus(
      app,
      "2026-04-18-gapyeong",
      "interrupted",
    );
    expect(cancelledStatus.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "summary",
          status: "interrupted",
        }),
        expect.objectContaining({
          category: "equipment",
          status: "interrupted",
        }),
      ]),
    );

    const metadataStatus = await waitForDurableMetadataJobStatus(
      app,
      "cancel-all-metadata",
      "interrupted",
    );
    expect(metadataStatus).toEqual(
      expect.objectContaining({
        item_id: "cancel-all-metadata",
        status: "interrupted",
      }),
    );
    expect(modelClient.aborts).toBe(1);
    expect(metadataClient.aborts).toEqual(["cancel-all-metadata"]);
    expect(modelClient.calls).toBe(1);

    await app.close();
  });

  it("starts a new analysis queue immediately after cancelling the previous one", async () => {
    const dataDir = await createSeededDataDir();
    const modelClient = new DeferredAnalysisClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
      campsiteTipClient: new MockCampsiteTipClient(),
    });

    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        categories: ["summary"],
      },
    });

    expect(firstResponse.statusCode).toBe(202);
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "running");

    const cancelResponse = await app.inject({
      method: "POST",
      url: "/api/ai-jobs/cancel-all",
    });

    expect(cancelResponse.statusCode).toBe(200);

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/analyze-trip",
      payload: {
        trip_id: "2026-04-18-gapyeong",
        categories: ["equipment"],
      },
    });

    expect(secondResponse.statusCode).toBe(202);
    expect(["queued", "running"]).toContain(secondResponse.json().status);

    modelClient.complete("## 2. 추천 장비\n\n- 재시작 후 분석");
    await waitForTripAnalysisStatus(app, "2026-04-18-gapyeong", "completed");
    expect(modelClient.calls).toBe(2);
    expect(modelClient.aborts).toBe(1);

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
    const campsiteTipClient = new MockCampsiteTipClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient,
      campsiteTipClient,
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

  it("stores retrospective entries and rebuilds user learning", async () => {
    const dataDir = await createSeededDataDir();
    const userLearningClient = new MockUserLearningClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      userLearningClient,
    });

    await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/archive",
    });

    const addResponse = await app.inject({
      method: "POST",
      url: "/api/history/2026-04-18-gapyeong/retrospectives",
      payload: {
        overall_satisfaction: 4,
        used_durable_item_ids: ["family-tent-4p"],
        missing_or_needed_items: ["아이 여벌 옷"],
        issues: ["야간 보온 준비 부족"],
        next_time_requests: ["보온 장비 보강"],
        freeform_note: "아이와 함께라 저녁 이후에는 보온과 동선 여유가 중요했다.",
      },
    });

    expect(addResponse.statusCode).toBe(202);
    expect(addResponse.json()).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({
          history_id: "2026-04-18-gapyeong",
          retrospectives: expect.arrayContaining([
            expect.objectContaining({
              overall_satisfaction: 4,
              missing_or_needed_items: ["아이 여벌 옷"],
            }),
          ]),
        }),
        learning_status: expect.objectContaining({
          status: "queued",
          trigger_history_id: "2026-04-18-gapyeong",
        }),
      }),
    );

    const learningResponse = await waitForUserLearningStatus(app, "completed");
    expect(learningResponse.profile).toEqual(
      expect.objectContaining({
        source_history_ids: ["2026-04-18-gapyeong"],
        source_entry_count: 1,
      }),
    );

    const historyLearningResponse = await app.inject({
      method: "GET",
      url: "/api/history/2026-04-18-gapyeong/learning",
    });

    expect(historyLearningResponse.statusCode).toBe(200);
    expect(historyLearningResponse.json().item).toEqual(
      expect.objectContaining({
        history_id: "2026-04-18-gapyeong",
        source_entry_count: 1,
      }),
    );
    expect(userLearningClient.retrospectiveCalls).toEqual(["2026-04-18-gapyeong"]);
    expect(userLearningClient.profileCalls).toBe(1);

    await app.close();
  });

  it("ignores retrospective changes in general history updates", async () => {
    const dataDir = await createSeededDataDir();
    const userLearningClient = new MockUserLearningClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      userLearningClient,
    });

    await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/archive",
    });

    await app.inject({
      method: "POST",
      url: "/api/history/2026-04-18-gapyeong/retrospectives",
      payload: {
        freeform_note: "첫 회고 엔트리",
      },
    });

    await waitForUserLearningStatus(app, "completed");

    const currentHistoryResponse = await app.inject({
      method: "GET",
      url: "/api/history/2026-04-18-gapyeong",
    });
    const currentHistory = currentHistoryResponse.json().item;

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/history/2026-04-18-gapyeong",
      payload: {
        ...currentHistory,
        notes: [...currentHistory.notes, "메모만 수정"],
        retrospectives: [],
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().item).toEqual(
      expect.objectContaining({
        notes: expect.arrayContaining(["메모만 수정"]),
        retrospectives: expect.arrayContaining([
          expect.objectContaining({
            freeform_note: "첫 회고 엔트리",
          }),
        ]),
      }),
    );
    expect(userLearningClient.profileCalls).toBe(1);

    await app.close();
  });

  it("includes running user learning jobs in cancel-all", async () => {
    const dataDir = await createSeededDataDir();
    const userLearningClient = new DeferredUserLearningClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      userLearningClient,
    });

    await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/archive",
    });

    const addResponse = await app.inject({
      method: "POST",
      url: "/api/history/2026-04-18-gapyeong/retrospectives",
      payload: {
        freeform_note: "바람이 강해서 타프와 방풍 장비가 더 필요했다.",
      },
    });

    expect(addResponse.statusCode).toBe(202);
    await waitForUserLearningStatus(app, "running");

    const cancelResponse = await app.inject({
      method: "POST",
      url: "/api/ai-jobs/cancel-all",
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toEqual(
      expect.objectContaining({
        cancelled_user_learning_job_count: 1,
      }),
    );

    const interruptedResponse = await waitForUserLearningStatus(app, "interrupted");
    expect(interruptedResponse.status.error).toEqual(
      expect.objectContaining({
        code: "INTERNAL_ERROR",
      }),
    );
    expect(userLearningClient.aborts).toBe(1);

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
      campsiteTipClient: new MockCampsiteTipClient(),
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

  it("sends trip analysis email to selected companions and persists recipient ids", async () => {
    const dataDir = await createSeededDataDir();
    await createCompletedAnalysisArtifacts(dataDir, "2026-04-18-gapyeong");
    const analysisEmailClient = new MockAnalysisEmailClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      analysisEmailClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/analysis-email",
      payload: {
        recipient_companion_ids: ["self", "child-1"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        sent_count: 2,
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        recipients: [
          {
            companion_id: "self",
            name: "본인",
            email: "self@example.com",
          },
          {
            companion_id: "child-1",
            name: "첫째",
            email: "child-1@example.com",
          },
        ],
      }),
    );
    expect(analysisEmailClient.calls).toHaveLength(1);
    expect(analysisEmailClient.calls[0]).toEqual(
      expect.objectContaining({
        tripTitle: "4월 가평 가족 캠핑",
        outputPath: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        recipients: [
          {
            companionId: "self",
            name: "본인",
            email: "self@example.com",
          },
          {
            companionId: "child-1",
            name: "첫째",
            email: "child-1@example.com",
          },
        ],
      }),
    );

    const trip = parse(
      await readFile(
        path.join(dataDir, "trips", "2026-04-18-gapyeong.yaml"),
        "utf8",
      ),
    ) as {
      notifications?: {
        email_recipient_companion_ids?: string[];
      };
    };

    expect(trip.notifications?.email_recipient_companion_ids).toEqual([
      "self",
      "child-1",
    ]);

    await app.close();
  });

  it("deduplicates duplicate recipient ids before sending analysis email", async () => {
    const dataDir = await createSeededDataDir();
    await createCompletedAnalysisArtifacts(dataDir, "2026-04-18-gapyeong");
    const analysisEmailClient = new MockAnalysisEmailClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      analysisEmailClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/analysis-email",
      payload: {
        recipient_companion_ids: ["self", "self", "child-1"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        sent_count: 2,
        recipients: [
          {
            companion_id: "self",
            name: "본인",
            email: "self@example.com",
          },
          {
            companion_id: "child-1",
            name: "첫째",
            email: "child-1@example.com",
          },
        ],
      }),
    );
    expect(analysisEmailClient.calls).toHaveLength(1);
    expect(analysisEmailClient.calls[0].recipients).toEqual([
      {
        companionId: "self",
        name: "본인",
        email: "self@example.com",
      },
      {
        companionId: "child-1",
        name: "첫째",
        email: "child-1@example.com",
      },
    ]);

    const trip = parse(
      await readFile(
        path.join(dataDir, "trips", "2026-04-18-gapyeong.yaml"),
        "utf8",
      ),
    ) as {
      notifications?: {
        email_recipient_companion_ids?: string[];
      };
    };

    expect(trip.notifications?.email_recipient_companion_ids).toEqual([
      "self",
      "child-1",
    ]);

    await app.close();
  });

  it("blocks analysis email sending until every analysis category result is ready", async () => {
    const dataDir = await createSeededDataDir();
    const analysisEmailClient = new MockAnalysisEmailClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      analysisEmailClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/analysis-email",
      payload: {
        recipient_companion_ids: ["self"],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "CONFLICT",
          message: "전체 분석 결과가 모두 모인 뒤에만 메일을 발송할 수 있습니다.",
        }),
      }),
    );
    expect(analysisEmailClient.calls).toHaveLength(0);

    await app.close();
  });

  it("rejects selected companions without email addresses when sending analysis email", async () => {
    const dataDir = await createSeededDataDir();
    await createCompletedAnalysisArtifacts(dataDir, "2026-04-18-gapyeong");
    const companionsPath = path.join(dataDir, "companions.yaml");
    const companions = parse(await readFile(companionsPath, "utf8")) as {
      companions: Array<Record<string, unknown>>;
    };
    companions.companions = companions.companions.map((companion) =>
      companion.id === "self" ? { ...companion, email: undefined } : companion,
    );
    await writeFile(companionsPath, stringify(companions), "utf8");

    const analysisEmailClient = new MockAnalysisEmailClient();
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      analysisEmailClient,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/analysis-email",
      payload: {
        recipient_companion_ids: ["self"],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "TRIP_INVALID",
          message: "메일 주소가 없는 동행자는 발송 대상으로 선택할 수 없습니다: 본인",
        }),
      }),
    );
    expect(analysisEmailClient.calls).toHaveLength(0);

    await app.close();
  });

  it("returns dependency missing when SMTP settings are absent for analysis email", async () => {
    const dataDir = await createSeededDataDir();
    await createCompletedAnalysisArtifacts(dataDir, "2026-04-18-gapyeong");
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      smtpHost: "",
      smtpFrom: "",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/analysis-email",
      payload: {
        recipient_companion_ids: ["self"],
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "DEPENDENCY_MISSING",
          message: "SMTP_HOST 와 SMTP_FROM 을 설정해야 분석 결과 메일을 발송할 수 있습니다.",
        }),
      }),
    );

    await app.close();
  });

  it("returns dependency missing when only part of the SMTP auth pair is configured", async () => {
    const dataDir = await createSeededDataDir();
    await createCompletedAnalysisArtifacts(dataDir, "2026-04-18-gapyeong");
    const app = await buildServer({
      dataDir,
      projectRoot,
      modelClient: new MockAnalysisClient("# sample"),
      smtpHost: "smtp.gmail.com",
      smtpFrom: "changhyublee@gmail.com",
      smtpUser: "changhyublee@gmail.com",
      smtpPass: "",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trips/2026-04-18-gapyeong/analysis-email",
      payload: {
        recipient_companion_ids: ["self"],
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: "DEPENDENCY_MISSING",
          message:
            "SMTP 인증을 사용하는 경우 SMTP_USER 와 SMTP_PASS 를 함께 설정해야 합니다.",
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
      campsiteTipClient: new MockCampsiteTipClient(),
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
