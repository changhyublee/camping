import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE } from "@camping/shared";
import type {
  AnalyzeTripResponse,
  Companion,
  ConsumableEquipmentItem,
  DataBackupSnapshot,
  DurableEquipmentItem,
  EquipmentCatalog,
  EquipmentCategoriesData,
  GetOutputResponse,
  HistoryRecord,
  PrecheckItem,
  TripDraft,
  TripData,
  TripSummary,
  ValidateTripResponse,
  Vehicle,
} from "@camping/shared";
import { App } from "./App";

const fetchMock = vi.fn<typeof fetch>();

vi.stubGlobal("fetch", fetchMock);

type ApiResponse<T> = {
  body: T;
  status?: number;
};

type FailedValidationResponse = {
  status: "failed";
  warnings: string[];
  error: {
    code: string;
    message: string;
  };
};

type MockState = {
  companions: Companion[];
  vehicles: Vehicle[];
  trips: TripSummary[];
  tripDetails: Record<string, TripData>;
  validations: Record<
    string,
    ApiResponse<ValidateTripResponse | FailedValidationResponse>
  >;
  analysis: ApiResponse<AnalyzeTripResponse>;
  equipment: EquipmentCatalog;
  equipmentCategories: EquipmentCategoriesData;
  history: HistoryRecord[];
  links: Array<{
    id: string;
    category: "weather" | "place" | "food" | "shopping" | "general";
    name: string;
    url: string;
    notes?: string;
    sort_order: number;
  }>;
  outputs: Record<string, GetOutputResponse>;
  updateTripCalls: Array<{
    tripId: string;
    body: TripData;
  }>;
  dataBackups: DataBackupSnapshot[];
};

let state: MockState;
beforeEach(() => {
  state = createMockState();
  fetchMock.mockImplementation(mockFetch);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  window.sessionStorage.clear();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body);

  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  } as Response);
}

function emptyResponse(status = 204) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("No JSON body");
    },
    text: async () => "",
  } as unknown as Response);
}

function createDeferredResponse() {
  let resolve: ((value: Response) => void) | null = null;

  const promise = new Promise<Response>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: (body: unknown, status = 200) => {
      resolve?.({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response);
    },
  };
}

function parseBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") {
    return undefined;
  }

  return JSON.parse(init.body) as Record<string, unknown>;
}

function summarizeTrip(trip: TripData): TripSummary {
  return {
    trip_id: trip.trip_id,
    title: trip.title,
    start_date: trip.date?.start,
    end_date: trip.date?.end,
    region: trip.location?.region,
    companion_count: trip.party.companion_ids.length,
  };
}

function updateTripSummary(trip: TripData) {
  const nextSummary = summarizeTrip(trip);
  const index = state.trips.findIndex((item) => item.trip_id === trip.trip_id);

  if (index >= 0) {
    state.trips[index] = nextSummary;
    return;
  }

  state.trips.push(nextSummary);
}

function readTripIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/trips\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readCompanionIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/companions\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readVehicleIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/vehicles\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readOutputTripIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/outputs\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readEquipmentItemParams(pathname: string) {
  const match = pathname.match(/^\/api\/equipment\/([^/]+)\/items(?:\/([^/]+))?$/u);

  if (!match) {
    return null;
  }

  return {
    section: match[1] as "durable" | "consumables" | "precheck",
    itemId: match[2] ?? null,
  };
}

function readDurableEquipmentMetadataRefreshId(pathname: string) {
  const match = pathname.match(
    /^\/api\/equipment\/durable\/items\/([^/]+)\/metadata\/refresh$/u,
  );

  return match?.[1] ?? null;
}

function readEquipmentCategoryParams(pathname: string) {
  const match = pathname.match(/^\/api\/equipment\/categories\/([^/]+)(?:\/([^/]+))?$/u);

  if (!match) {
    return null;
  }

  return {
    section: match[1] as "durable" | "consumables" | "precheck",
    categoryId: match[2] ?? null,
  };
}

function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const rawUrl = typeof input === "string" ? input : input.toString();
  const pathname = new URL(rawUrl, "http://localhost").pathname;
  const method = init?.method?.toUpperCase() ?? "GET";

  if (pathname === "/api/trips" && method === "GET") {
    return jsonResponse({ items: state.trips });
  }

  if (pathname === "/api/companions" && method === "GET") {
    return jsonResponse({ items: state.companions });
  }

  if (pathname === "/api/vehicles" && method === "GET") {
    return jsonResponse({ items: state.vehicles });
  }

  if (pathname === "/api/data-backups" && method === "POST") {
    const item: DataBackupSnapshot = {
      created_at: "2026-03-23T15:00:00.000Z",
      reason: "manual",
      source_path: "/workspace/.camping-data",
      backup_path: `/workspace/.camping-backups/2026-03-23T15-00-00.000Z-${state.dataBackups.length + 1}`,
      data_path: `/workspace/.camping-backups/2026-03-23T15-00-00.000Z-${state.dataBackups.length + 1}/data`,
    };

    state.dataBackups.unshift(item);
    return jsonResponse({ item });
  }

  if (pathname === "/api/trips" && method === "POST") {
    const body = parseBody(init) as TripDraft;

    if (!body.title?.trim()) {
      return jsonResponse(
        {
          status: "failed",
          warnings: [],
          error: {
            code: "TRIP_INVALID",
            message: "trip 생성 요청 형식이 올바르지 않습니다. title: 값을 입력해야 합니다.",
          },
        },
        400,
      );
    }

    const trip = {
      ...body,
      trip_id: "2026-05-01-new-trip",
    } satisfies TripData;

    state.tripDetails[trip.trip_id] = trip;
    updateTripSummary(trip);

    return jsonResponse({
      trip_id: trip.trip_id,
      data: trip,
    });
  }

  if (pathname === "/api/companions" && method === "POST") {
    const body = parseBody(init) as Companion;

    state.companions.push(body);
    state.companions.sort((left, right) => left.name.localeCompare(right.name, "ko"));

    return jsonResponse({ item: body });
  }

  if (pathname === "/api/vehicles" && method === "POST") {
    const body = parseBody(init) as Vehicle;

    state.vehicles.push(body);
    state.vehicles.sort((left, right) => left.name.localeCompare(right.name, "ko"));

    return jsonResponse({ item: body });
  }

  if (pathname === "/api/equipment" && method === "GET") {
    return jsonResponse(state.equipment);
  }

  if (pathname === "/api/equipment/categories" && method === "GET") {
    return jsonResponse(state.equipmentCategories);
  }

  const companionIdFromPath = readCompanionIdFromPath(pathname);
  const vehicleIdFromPath = readVehicleIdFromPath(pathname);

  if (companionIdFromPath && method === "PUT") {
    const body = parseBody(init) as Companion;
    const index = state.companions.findIndex((item) => item.id === companionIdFromPath);

    if (index >= 0) {
      state.companions[index] = body;
    }

    state.companions.sort((left, right) => left.name.localeCompare(right.name, "ko"));
    return jsonResponse({ item: body });
  }

  if (companionIdFromPath && method === "DELETE") {
    state.companions = state.companions.filter((item) => item.id !== companionIdFromPath);
    return emptyResponse();
  }

  if (vehicleIdFromPath && method === "PUT") {
    const body = parseBody(init) as Vehicle;
    const index = state.vehicles.findIndex((item) => item.id === vehicleIdFromPath);

    if (index >= 0) {
      state.vehicles[index] = body;
    }

    state.vehicles.sort((left, right) => left.name.localeCompare(right.name, "ko"));
    return jsonResponse({ item: body });
  }

  if (vehicleIdFromPath && method === "DELETE") {
    state.vehicles = state.vehicles.filter((item) => item.id !== vehicleIdFromPath);
    return emptyResponse();
  }

  const equipmentItemParams = readEquipmentItemParams(pathname);
  const equipmentCategoryParams = readEquipmentCategoryParams(pathname);
  const durableMetadataRefreshId = readDurableEquipmentMetadataRefreshId(pathname);

  if (equipmentCategoryParams && !equipmentCategoryParams.categoryId && method === "POST") {
    const body = parseBody(init) as { id?: string; label: string };

    if (!body.id) {
      return jsonResponse(
        {
          status: "failed",
          warnings: [],
          error: {
            code: "TRIP_INVALID",
            message: EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
          },
        },
        400,
      );
    }

    const item = {
      id: body.id,
      label: body.label,
      sort_order:
        Math.max(
          0,
          ...state.equipmentCategories[equipmentCategoryParams.section].map(
            (category) => category.sort_order,
          ),
        ) + 1,
    };

    state.equipmentCategories[equipmentCategoryParams.section].push(item);

    return jsonResponse({ item });
  }

  if (equipmentCategoryParams?.categoryId && method === "PUT") {
    const body = parseBody(init) as { label: string };

    if (!body.label?.trim()) {
      return jsonResponse(
        {
          status: "failed",
          error: {
            code: "TRIP_INVALID",
            message:
              "장비 카테고리 수정 요청 형식이 올바르지 않습니다. label: 값을 입력해야 합니다.",
          },
        },
        400,
      );
    }

    const categories = state.equipmentCategories[equipmentCategoryParams.section];
    const index = categories.findIndex((item) => item.id === equipmentCategoryParams.categoryId);

    if (index >= 0) {
      categories[index] = {
        ...categories[index],
        label: body.label,
      };
    }

    return jsonResponse({ item: categories[index] });
  }

  if (equipmentCategoryParams?.categoryId && method === "DELETE") {
    state.equipmentCategories[equipmentCategoryParams.section] = state.equipmentCategories[
      equipmentCategoryParams.section
    ].filter((item) => item.id !== equipmentCategoryParams.categoryId);

    return emptyResponse();
  }

  if (durableMetadataRefreshId && method === "POST") {
    const index = state.equipment.durable.items.findIndex(
      (item) => item.id === durableMetadataRefreshId,
    );

    if (index < 0) {
      return jsonResponse(
        {
          status: "failed",
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: `장비를 찾을 수 없습니다: ${durableMetadataRefreshId}`,
          },
        },
        404,
      );
    }

    const currentItem = state.equipment.durable.items[index];
    const nextItem = {
      ...currentItem,
      metadata: {
        lookup_status: "found" as const,
        searched_at: "2026-03-23T12:00:00.000Z",
        query: `${currentItem.name} ${currentItem.model ?? ""}`.trim(),
        summary: "포장 크기와 설치 시간을 확인했습니다.",
        product: {
          brand: "테스트 브랜드",
          official_name: currentItem.name,
          model: currentItem.model,
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
          season_notes: ["봄, 여름, 가을 중심으로 적합"],
          weather_notes: ["우천 시 플라이를 먼저 확인"],
        },
        sources: [
          {
            title: "테스트 상품 페이지",
            url: currentItem.purchase_link ?? "https://example.com/product",
            domain: "example.com",
          },
        ],
      },
    };

    state.equipment.durable.items[index] = nextItem;
    return jsonResponse({ item: nextItem });
  }

  if (equipmentItemParams?.itemId && method === "PUT") {
    const { section, itemId } = equipmentItemParams;
    const body = parseBody(init) as
      | DurableEquipmentItem
      | ConsumableEquipmentItem
      | PrecheckItem;
    const index = state.equipment[section].items.findIndex((item) => item.id === itemId);

    if (index >= 0) {
      if (section === "durable") {
        state.equipment.durable.items[index] = body as DurableEquipmentItem;
      } else if (section === "consumables") {
        state.equipment.consumables.items[index] = body as ConsumableEquipmentItem;
      } else {
        state.equipment.precheck.items[index] = body as PrecheckItem;
      }
    }

    return jsonResponse({ item: body });
  }

  if (equipmentItemParams?.itemId && method === "DELETE") {
    const { section, itemId } = equipmentItemParams;
    if (section === "durable") {
      state.equipment.durable.items = state.equipment.durable.items.filter(
        (item) => item.id !== itemId,
      );
    } else if (section === "consumables") {
      state.equipment.consumables.items = state.equipment.consumables.items.filter(
        (item) => item.id !== itemId,
      );
    } else {
      state.equipment.precheck.items = state.equipment.precheck.items.filter(
        (item) => item.id !== itemId,
      );
    }

    return emptyResponse();
  }

  if (pathname === "/api/history" && method === "GET") {
    return jsonResponse({ items: state.history });
  }

  if (pathname === "/api/links" && method === "GET") {
    return jsonResponse({ items: state.links });
  }

  const tripIdFromPath = readTripIdFromPath(pathname);

  if (tripIdFromPath && method === "GET") {
    const trip = state.tripDetails[tripIdFromPath];

    if (!trip) {
      return jsonResponse({
        status: "failed",
        error: {
          code: "TRIP_NOT_FOUND",
          message: `trip 파일을 찾을 수 없습니다: ${tripIdFromPath}`,
        },
      }, 404);
    }

    return jsonResponse({
      trip_id: tripIdFromPath,
      data: trip,
    });
  }

  if (tripIdFromPath && method === "PUT") {
    const body = parseBody(init) as TripData;
    const trip = {
      ...body,
      trip_id: tripIdFromPath,
    } satisfies TripData;

    state.tripDetails[tripIdFromPath] = trip;
    updateTripSummary(trip);
    state.updateTripCalls.push({
      tripId: tripIdFromPath,
      body: trip,
    });

    return jsonResponse({
      trip_id: tripIdFromPath,
      data: trip,
    });
  }

  if (pathname === "/api/validate-trip" && method === "POST") {
    const body = parseBody(init);
    const tripId = body?.trip_id as string;
    const response = state.validations[tripId];

    if (!response) {
      throw new Error(`Unhandled validation request: ${tripId}`);
    }

    return jsonResponse(response.body, response.status ?? 200);
  }

  if (pathname === "/api/analyze-trip" && method === "POST") {
    return jsonResponse(state.analysis.body, state.analysis.status ?? 200);
  }

  if (pathname === "/api/outputs" && method === "POST") {
    return jsonResponse({
      status: "saved",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
    });
  }

  const outputTripIdFromPath = readOutputTripIdFromPath(pathname);

  if (outputTripIdFromPath && method === "GET") {
    const output = state.outputs[outputTripIdFromPath];

    if (!output) {
      return jsonResponse(
        {
          status: "failed",
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: `분석 결과 파일을 찾을 수 없습니다: ${outputTripIdFromPath}`,
          },
        },
        404,
      );
    }

    return jsonResponse(output);
  }

  const assistantMatch = pathname.match(/^\/api\/trips\/([^/]+)\/assistant$/u);

  if (assistantMatch && method === "POST") {
    return jsonResponse({
      trip_id: assistantMatch[1],
      warnings: [],
      assistant_message: "### AI 보조 응답\n- 비 예보 대비 타프를 검토하세요.",
      actions: [],
    });
  }

  throw new Error(`Unhandled request: ${method} ${pathname}`);
}

describe("App", () => {
  it("navigates to planning and renders analysis markdown", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    expect(await screen.findByText("4월 가평 가족 캠핑")).toBeInTheDocument();
    expect(await screen.findByText("AI 보조는 저장 후 질문할 때 사용")).toBeInTheDocument();
    expect(await screen.findByText("분석 결과는 최종 정리할 때 확인")).toBeInTheDocument();
    expect(
      screen.getByText(
        "계획과 장비 점검이 끝난 뒤 분석을 실행하면 준비물, 체크리스트, 식단, 이동 추천, 다음 캠핑 추천이 Markdown으로 정리됩니다.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "예: 빠진 준비물이 있는지 먼저 점검해줘. 비 예보와 아이 동행 기준으로 알려줘",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "계획 저장 후 분석 실행을 누르면 추천 장비, 개인 준비물, 출발 전 체크리스트, 식단, 이동/주변 추천, 다음 캠핑 추천 결과가 여기에 표시됩니다.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "분석 실행" }),
    );

    expect(await screen.findByText("테스트 결과")).toBeInTheDocument();
    expect(
      screen.getAllByText(".camping-data/outputs/2026-04-18-gapyeong-plan.md").length,
    ).toBeGreaterThan(0);
  });

  it("keeps the planning page after remount and restores saved analysis output", async () => {
    state.outputs["2026-04-18-gapyeong"] = {
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# 저장된 분석 결과\n\n- 자동 복원",
    };

    const firstRender = render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    expect(await screen.findByText("자동 복원")).toBeInTheDocument();

    firstRender.unmount();

    render(<App />);

    expect(await screen.findByRole("button", { name: "분석 실행" })).toBeInTheDocument();
    expect(await screen.findByText("자동 복원")).toBeInTheDocument();
  });

  it("does not block planning details while saved output is still loading", async () => {
    const deferredOutput = createDeferredResponse();

    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/outputs/2026-04-18-gapyeong" && method === "GET") {
        return deferredOutput.promise;
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    expect(await screen.findByDisplayValue("4월 가평 가족 캠핑")).toBeInTheDocument();

    deferredOutput.resolve({
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# 지연된 저장 결과\n\n- 나중에 도착",
    });

    expect(await screen.findByText("나중에 도착")).toBeInTheDocument();
  });

  it("does not show saved output when the trip detail request fails", async () => {
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        activePage: "planning",
        selectedTripId: "2026-04-18-gapyeong",
        selectedHistoryId: null,
        equipmentSection: "durable",
      }),
    );

    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/trips/2026-04-18-gapyeong" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_NOT_FOUND",
              message: "trip 파일을 찾을 수 없습니다: 2026-04-18-gapyeong",
            },
          },
          404,
        );
      }

      if (pathname === "/api/outputs/2026-04-18-gapyeong" && method === "GET") {
        return jsonResponse({
          trip_id: "2026-04-18-gapyeong",
          output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
          markdown: "# 남아 있는 결과\n\n- stale output",
        });
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 실패")).toBeInTheDocument();
    expect(
      screen.getByText("trip 파일을 찾을 수 없습니다: 2026-04-18-gapyeong"),
    ).toBeInTheDocument();
    expect(screen.queryByText("stale output")).toBeNull();
  });

  it("shows analysis API errors in the planning page", async () => {
    state.validations["2026-04-18-gapyeong"] = {
      body: {
        status: "ok",
        warnings: ["예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."],
      },
    };
    state.analysis = {
      status: 502,
      body: {
        trip_id: "2026-04-18-gapyeong",
        status: "failed",
        warnings: [],
        error: {
          code: "OPENAI_REQUEST_FAILED",
          message: "OpenAI 분석 요청에 실패했습니다.",
        },
      },
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    expect(
      await screen.findByText("예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "분석 실행" }));

    await waitFor(() => {
      expect(screen.getByText("분석 실패")).toBeInTheDocument();
      expect(
        screen.getByText("OpenAI 분석 요청에 실패했습니다."),
      ).toBeInTheDocument();
    });
  });

  it("keeps markdown visible when auto-save fails after analysis", async () => {
    state.analysis = {
      body: {
        trip_id: "2026-04-18-gapyeong",
        status: "failed",
        warnings: [],
        markdown: "# 분석은 완료됨\n\n- 저장만 실패",
        output_path: null,
        error: {
          code: "OUTPUT_SAVE_FAILED",
          message: "분석 결과를 저장하지 못했습니다: 2026-04-18-gapyeong",
        },
      },
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(await screen.findByRole("button", { name: "분석 실행" }));

    expect(
      await screen.findByText("결과 생성 완료, 저장 실패"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("분석 결과를 저장하지 못했습니다: 2026-04-18-gapyeong"),
    ).toBeInTheDocument();
    expect(screen.getByText("저장만 실패")).toBeInTheDocument();
  });

  it("always requests analysis with automatic output saving", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(await screen.findByRole("button", { name: "분석 실행" }));

    const analyzeCall = fetchMock.mock.calls.find(([input]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      return new URL(rawUrl, "http://localhost").pathname === "/api/analyze-trip";
    });

    expect(analyzeCall).toBeDefined();
    expect(parseBody(analyzeCall?.[1])).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        save_output: true,
      }),
    );
    expect(screen.queryByLabelText("분석 후 결과 저장")).toBeNull();
    expect(screen.queryByRole("button", { name: "결과 저장" })).toBeNull();
  });

  it("ignores stale analysis responses after switching to another trip", async () => {
    const deferredAnalysis = createDeferredResponse();

    state.trips.push({
      trip_id: "2026-04-20-yangyang",
      title: "양양 테스트 캠핑",
      start_date: "2026-04-20",
      region: "yangyang",
      companion_count: 1,
    });
    state.tripDetails["2026-04-20-yangyang"] = {
      version: 1,
      trip_id: "2026-04-20-yangyang",
      title: "양양 테스트 캠핑",
      date: {
        start: "2026-04-20",
        end: "2026-04-21",
      },
      location: {
        region: "yangyang",
      },
      party: {
        companion_ids: ["self"],
      },
      notes: [],
    };
    state.validations["2026-04-20-yangyang"] = {
      body: {
        status: "ok",
        warnings: [],
      },
    };

    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/analyze-trip" && method === "POST") {
        return deferredAnalysis.promise;
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(await screen.findByRole("button", { name: "분석 실행" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /양양 테스트 캠핑/u }),
    );

    expect(await screen.findByDisplayValue("양양 테스트 캠핑")).toBeInTheDocument();

    deferredAnalysis.resolve({
      trip_id: "2026-04-18-gapyeong",
      status: "completed",
      warnings: [],
      markdown: "# 늦게 도착한 분석\n\n- 이전 계획 결과",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
    });

    await waitFor(() => {
      expect(screen.queryByText("이전 계획 결과")).toBeNull();
    });
    expect(screen.getByDisplayValue("양양 테스트 캠핑")).toBeInTheDocument();
  });

  it("keeps the app usable when companion loading fails on startup", async () => {
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/companions" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "companions.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 경고")).toBeInTheDocument();
    expect(
      screen.getByText("일부 데이터를 기본값 또는 빈 상태로 불러왔습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "동행자 목록을 불러오지 못했습니다. companions.yaml 형식이 올바르지 않습니다.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("운영 현황")).toBeInTheDocument();
    expect(screen.queryByText("초기 로딩 실패")).not.toBeInTheDocument();
  });

  it("shows startup warnings together when companion and category loading both fail", async () => {
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/companions" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "companions.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      if (pathname === "/api/equipment/categories" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "equipment/categories.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 경고")).toBeInTheDocument();
    expect(
      screen.getByText(
        "일부 데이터를 기본값 또는 빈 상태로 불러왔습니다.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "동행자 목록을 불러오지 못했습니다. companions.yaml 형식이 올바르지 않습니다.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "장비 카테고리를 불러오지 못했습니다. 기본 카테고리로 계속 진행합니다. equipment/categories.yaml 형식이 올바르지 않습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps startup warnings as inline banners instead of auto-dismissing toasts", async () => {
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/companions" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "companions.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 경고")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).toBeNull();

    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(6000);

    expect(screen.getByText("초기 로딩 경고")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).toBeNull();
  });

  it("renders action results as floating toasts", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.type(screen.getByPlaceholderText("예: tarp"), "storage-rack");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).not.toBeNull();
  });

  it("creates a manual data backup from the management page", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));
    await userEvent.click(screen.getByRole("button", { name: "지금 백업 생성" }));

    expect(await screen.findByText("로컬 데이터 백업 완료")).toBeInTheDocument();
    expect(
      screen.getByText(/\/workspace\/\.camping-backups\/2026-03-23T15-00-00\.000Z-1/u),
    ).toBeInTheDocument();

    const backupCall = fetchMock.mock.calls.find(([input, init]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;

      return (
        pathname === "/api/data-backups" &&
        (init?.method?.toUpperCase() ?? "GET") === "POST"
      );
    });

    expect(backupCall).toBeDefined();
  });

  it("keeps startup warning visible after a later floating toast appears", async () => {
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/companions" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "companions.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 경고")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "카테고리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.type(screen.getByPlaceholderText("예: tarp"), "storage-rack");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    expect(screen.getByText("초기 로딩 경고")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).not.toBeNull();
  });

  it("keeps an invalid trip editable and saves it to the selected trip id", async () => {
    state.trips.push({
      trip_id: "2026-04-20-broken-trip",
      title: "문제 계획",
      start_date: "2026-04-20",
      region: "yangyang",
      companion_count: 1,
    });
    state.tripDetails["2026-04-20-broken-trip"] = {
      version: 1,
      trip_id: "2026-04-20-broken-trip",
      title: "문제 계획",
      date: {
        start: "2026-04-20",
        end: "2026-04-21",
      },
      location: {
        region: "yangyang",
      },
      party: {
        companion_ids: ["ghost"],
      },
      notes: [],
    };
    state.validations["2026-04-20-broken-trip"] = {
      status: 400,
      body: {
        status: "failed",
        warnings: [],
        error: {
          code: "TRIP_INVALID",
          message: "등록되지 않은 동행자 ID가 있습니다: ghost",
        },
      },
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(await screen.findByRole("button", { name: /문제 계획/u }));

    expect(await screen.findByDisplayValue("문제 계획")).toBeInTheDocument();
    expect(
      await screen.findByText("등록되지 않은 동행자 ID가 있습니다: ghost"),
    ).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue("문제 계획");

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "문제 계획 수정");
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.updateTripCalls).toHaveLength(1);
    });

    expect(state.updateTripCalls[0]).toEqual(
      expect.objectContaining({
        tripId: "2026-04-20-broken-trip",
        body: expect.objectContaining({
          title: "문제 계획 수정",
        }),
      }),
    );
  });

  it("selects companions from the managed list and saves their ids", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.type(screen.getByPlaceholderText("새 캠핑 계획"), "선택 테스트 계획");

    await userEvent.click(screen.getByRole("checkbox", { name: /^본인/u }));
    await userEvent.click(screen.getByRole("checkbox", { name: /^첫째/u }));

    expect(screen.getByText("2명 선택")).toBeInTheDocument();
    expect(
      screen.queryByText("동행자를 선택하면 요약 정보가 여기 표시됩니다."),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.tripDetails["2026-05-01-new-trip"]).toBeDefined();
    });

    expect(state.tripDetails["2026-05-01-new-trip"]).toEqual(
      expect.objectContaining({
        party: {
          companion_ids: ["self", "child-1"],
        },
      }),
    );
  });

  it("selects a managed vehicle and saves its snapshot with the trip", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.type(screen.getByPlaceholderText("새 캠핑 계획"), "차량 선택 테스트");

    await userEvent.selectOptions(
      screen.getByRole("combobox"),
      "family-suv",
    );
    expect(screen.getByText("탑승 5명")).toBeInTheDocument();
    expect(screen.getByText("적재 400kg")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.tripDetails["2026-05-01-new-trip"]).toBeDefined();
    });

    expect(state.tripDetails["2026-05-01-new-trip"]).toEqual(
      expect.objectContaining({
        vehicle: expect.objectContaining({
          id: "family-suv",
          name: "패밀리 SUV",
          passenger_capacity: 5,
          load_capacity_kg: 400,
        }),
      }),
    );
  });

  it("preserves spaces in trip notes while editing", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    const notesInput = screen.getByPlaceholderText(
      "사이트 특이사항, 출발 전 꼭 챙길 것, 당일 일정 메모, 아직 장비/링크로 옮기지 않은 임시 메모를 줄 단위로 적어두세요.",
    );

    await userEvent.clear(notesInput);
    await userEvent.type(notesInput, "텐트 옆 공간 ");

    expect(notesInput).toHaveValue("텐트 옆 공간 ");
  });

  it("removes a deleted companion from the current trip selection", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "사람 관리" }));
    await userEvent.click(screen.getByRole("button", { name: /본인 성인/u }));
    await userEvent.click(screen.getByRole("button", { name: "사람 삭제" }));

    expect(await screen.findByText("동행자 삭제 완료")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.updateTripCalls).toHaveLength(1);
    });

    expect(state.updateTripCalls[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          party: {
            companion_ids: ["child-1"],
          },
        }),
      }),
    );
  });

  it("shows which trip field failed validation when creating a trip", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    expect(await screen.findByText("캠핑 계획 저장 실패")).toBeInTheDocument();
    expect(
      screen.getByText(
        "trip 생성 요청 형식이 올바르지 않습니다. title: 값을 입력해야 합니다.",
      ),
    ).toBeInTheDocument();
  });

  it("shows low stock threshold controls for consumables and derives stock status", async () => {
    state.equipment.consumables.items = [
      {
        id: "butane-gas",
        name: "부탄가스",
        category: "fuel",
        quantity_on_hand: 1,
        unit: "ea",
        low_stock_threshold: 2,
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("tab", { name: "소모품" }));
    await userEvent.click(screen.getByRole("button", { name: "연료 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "부탄가스 상세 펼치기" }),
    );

    expect(await screen.findAllByText("부족 기준")).toHaveLength(2);
    expect(screen.queryByRole("combobox", { name: "상태" })).toBeNull();
    expect(screen.getByText("부족")).toBeInTheDocument();
  });

  it("renders equipment sections as tabs and switches the tabpanel", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));

    const durableTab = screen.getByRole("tab", { name: "반복 장비" });
    const consumableTab = screen.getByRole("tab", { name: "소모품" });

    expect(screen.getByRole("tablist", { name: "장비 섹션" })).toBeInTheDocument();
    expect(durableTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "반복 장비" })).toBeInTheDocument();

    await userEvent.click(consumableTab);

    expect(consumableTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "소모품" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "소모품 목록" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "소모품 추가" })).toBeInTheDocument();
  });

  it("moves between equipment tabs with keyboard navigation", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));

    const durableTab = screen.getByRole("tab", { name: "반복 장비" });

    durableTab.focus();
    expect(durableTab).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "소모품" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "출발 전 점검" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "반복 장비" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: "반복 장비" })).toBeInTheDocument();
  });

  it("groups equipment by category and opens item details only when the item name row is clicked", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleeping",
        quantity: 1,
        status: "ok",
      },
      {
        id: "family-tent",
        name: "패밀리 텐트",
        category: "shelter",
        quantity: 1,
        status: "needs_repair",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));

    expect(
      screen.getByRole("button", { name: "침구 카테고리 펼치기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "침낭 상세 펼치기" })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("침낭")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "침낭 상세 펼치기" }));
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue("침낭");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "다운 침낭");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl = typeof input === "string" ? input : input.toString();
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        return (
          pathname === "/api/equipment/durable/items/sleeping-bag-3season-adult" &&
          init?.method === "PUT"
        );
      }),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "다운 침낭 상세 접기" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 접기" }));
    expect(screen.queryByRole("button", { name: /다운 침낭 상세/u })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    expect(
      await screen.findByRole("button", { name: "다운 침낭 상세 접기" }),
    ).toBeInTheDocument();
  });

  it("keeps an item visible when its category changes into a collapsed category", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleeping",
        quantity: 1,
        status: "ok",
      },
      {
        id: "family-tent",
        name: "패밀리 텐트",
        category: "shelter",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "침낭 상세 펼치기" }));

    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    const sleepingBagCard = screen
      .getByRole("button", { name: "침낭 상세 접기" })
      .closest("article");
    expect(sleepingBagCard).not.toBeNull();

    await userEvent.selectOptions(
      within(sleepingBagCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "shelter",
    );

    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 접기" }),
    ).toBeInTheDocument();
  });

  it("keeps an item visible when its category changes into a newly visible category", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleeping",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "침낭 상세 펼치기" }));

    const sleepingBagCard = screen
      .getByRole("button", { name: "침낭 상세 접기" })
      .closest("article");
    expect(sleepingBagCard).not.toBeNull();

    await userEvent.selectOptions(
      within(sleepingBagCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "shelter",
    );

    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 접기" }),
    ).toBeInTheDocument();
  });

  it("shows durable metadata in the detail panel and allows manual recollection", async () => {
    state.equipment.durable.items = [
      {
        id: "family-tent",
        name: "패밀리 텐트",
        model: "리빙쉘 4P",
        purchase_link: "https://example.com/product",
        category: "shelter",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "패밀리 텐트 상세 펼치기" }));

    const modelInput = screen.getByDisplayValue("리빙쉘 4P");

    expect(modelInput).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.com/product")).toBeInTheDocument();
    expect(screen.getByText("장비 메타데이터")).toBeInTheDocument();
    expect(screen.getByText("미수집")).toBeInTheDocument();

    await userEvent.clear(modelInput);
    await userEvent.type(modelInput, "리빙쉘 5P");

    await userEvent.click(screen.getByRole("button", { name: "메타데이터 재수집" }));

    expect(await screen.findByText("장비 메타데이터 재수집 완료")).toBeInTheDocument();
    expect(screen.getByText("수집 완료")).toBeInTheDocument();
    expect(screen.getByText("68 x 34 x 30 cm")).toBeInTheDocument();
    expect(screen.getByText(/검색 질의: 패밀리 텐트 리빙쉘 5P/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "테스트 상품 페이지" })).toHaveAttribute(
      "href",
      "https://example.com/product",
    );
    const updateCallIndex = fetchMock.mock.calls.findIndex(([input, init]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;

      return pathname === "/api/equipment/durable/items/family-tent" && init?.method === "PUT";
    });
    const refreshCallIndex = fetchMock.mock.calls.findIndex(([input, init]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;

      return (
        pathname === "/api/equipment/durable/items/family-tent/metadata/refresh" &&
        init?.method === "POST"
      );
    });

    expect(updateCallIndex).toBeGreaterThanOrEqual(0);
    expect(refreshCallIndex).toBeGreaterThan(updateCallIndex);
    expect(
      parseBody(fetchMock.mock.calls[updateCallIndex]?.[1])?.model,
    ).toBe("리빙쉘 5P");
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl = typeof input === "string" ? input : input.toString();
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        return (
          pathname === "/api/equipment/durable/items/family-tent/metadata/refresh" &&
          init?.method === "POST"
        );
      }),
    ).toBe(true);
  });

  it("keeps a consumable visible when its category changes into a collapsed category", async () => {
    state.equipment.consumables.items = [
      {
        id: "butane-gas",
        name: "부탄가스",
        category: "fuel",
        quantity_on_hand: 2,
        unit: "ea",
      },
      {
        id: "fire-starter",
        name: "착화제",
        category: "ignition",
        quantity_on_hand: 1,
        unit: "pack",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("tab", { name: "소모품" }));
    await userEvent.click(screen.getByRole("button", { name: "연료 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "부탄가스 상세 펼치기" }));

    expect(await screen.findByDisplayValue("부탄가스")).toBeInTheDocument();

    const butaneGasCard = screen
      .getByRole("button", { name: "부탄가스 상세 접기" })
      .closest("article");
    expect(butaneGasCard).not.toBeNull();

    await userEvent.selectOptions(
      within(butaneGasCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "ignition",
    );

    expect(await screen.findByDisplayValue("부탄가스")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "점화 카테고리 접기" }),
    ).toBeInTheDocument();
  });

  it("keeps a precheck item visible when its category changes into a collapsed category", async () => {
    state.equipment.precheck.items = [
      {
        id: "lantern-battery",
        name: "랜턴 배터리",
        category: "battery",
        status: "ok",
      },
      {
        id: "tire-pressure",
        name: "타이어 공기압",
        category: "vehicle",
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("tab", { name: "출발 전 점검" }));
    await userEvent.click(screen.getByRole("button", { name: "배터리 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "랜턴 배터리 상세 펼치기" }));

    expect(await screen.findByDisplayValue("랜턴 배터리")).toBeInTheDocument();

    const lanternBatteryCard = screen
      .getByRole("button", { name: "랜턴 배터리 상세 접기" })
      .closest("article");
    expect(lanternBatteryCard).not.toBeNull();

    await userEvent.selectOptions(
      within(lanternBatteryCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "vehicle",
    );

    expect(await screen.findByDisplayValue("랜턴 배터리")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "차량 카테고리 접기" })).toBeInTheDocument();
  });

  it("renders equipment categories as selects and can add a managed category", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    expect(screen.getAllByRole("combobox", { name: "카테고리" }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "카테고리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.type(screen.getByPlaceholderText("예: tarp"), "tarp");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "수납 카테고리 설정 펼치기" }),
    ).toBeInTheDocument();
  });

  it("requires a category code when creating a category", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 실패")).toBeInTheDocument();
    expect(
      screen.getByText(EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE),
    ).toBeInTheDocument();
  });

  it("keeps saved category labels in equipment selects until category save succeeds", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));
    const initialShelterExpandButton = screen.queryByRole("button", {
      name: "쉘터/텐트 카테고리 설정 펼치기",
    });
    if (initialShelterExpandButton) {
      await userEvent.click(initialShelterExpandButton);
    }

    const shelterCard = screen.getByText("shelter").closest("article");
    expect(shelterCard).not.toBeNull();

    const labelInput = within(shelterCard as HTMLElement).getByDisplayValue("쉘터/텐트");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "임시 라벨");

    expect(labelInput).toHaveValue("임시 라벨");

    await userEvent.click(screen.getByRole("button", { name: "장비 관리" }));

    expect(screen.getAllByRole("option", { name: "쉘터/텐트" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("option", { name: "임시 라벨" })).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "카테고리 설정" }));
    const updatedShelterExpandButton = screen.queryByRole("button", {
      name: "임시 라벨 카테고리 설정 펼치기",
    });
    if (updatedShelterExpandButton) {
      await userEvent.click(updatedShelterExpandButton);
    }

    const updatedShelterCard = screen.getByText("shelter").closest("article");
    expect(updatedShelterCard).not.toBeNull();

    const updatedInput = within(updatedShelterCard as HTMLElement).getByDisplayValue(
      "임시 라벨",
    );
    await userEvent.clear(updatedInput);
    await userEvent.click(
      within(updatedShelterCard as HTMLElement).getByRole("button", { name: "저장" }),
    );

    expect(await screen.findByText("장비 카테고리 저장 실패")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "장비 관리" }));
    expect(screen.getAllByRole("option", { name: "쉘터/텐트" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("option", { name: "임시 라벨" })).toHaveLength(0);
  });

  it("deletes equipment successfully when the API returns 204", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleep",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "sleep 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "침낭 상세 펼치기" }),
    );

    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.getByText("장비 삭제 완료")).toBeInTheDocument();
    });
    expect(window.confirm).toHaveBeenCalledWith(
      "장비 항목을 삭제할까요?\ndurable / sleeping-bag-3season-adult",
    );
    expect(screen.queryByDisplayValue("침낭")).not.toBeInTheDocument();
  });

  it("shows a sync warning instead of a failure when category refresh fails after delete", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleeping",
        quantity: 1,
        status: "ok",
      },
    ];

    let categoryGetCount = 0;
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/equipment/categories" && method === "GET") {
        categoryGetCount += 1;

        if (categoryGetCount >= 2) {
          return jsonResponse(
            {
              status: "failed",
              error: {
                code: "TRIP_INVALID",
                message: "equipment/categories.yaml 형식이 올바르지 않습니다.",
              },
            },
            400,
          );
        }
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "침낭 상세 펼치기" }),
    );
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByText("장비 삭제 완료")).toBeInTheDocument();
    expect(
      screen.getByText(
        "sleeping-bag-3season-adult / 장비 카테고리 동기화 실패: equipment/categories.yaml 형식이 올바르지 않습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("장비 삭제 실패")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("침낭")).not.toBeInTheDocument();
  });

  it("does not delete equipment when the confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleep",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "sleep 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "침낭 상세 펼치기" }),
    );

    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "장비 항목을 삭제할까요?\ndurable / sleeping-bag-3season-adult",
    );
    expect(screen.queryByText("장비 삭제 완료")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("침낭")).toBeInTheDocument();
  });

  it("opens archived output markdown from history detail", async () => {
    state.history = [
      {
        version: 1,
        history_id: "2026-03-08-yangpyeong",
        source_trip_id: "2026-03-08-yangpyeong",
        title: "3월 양평 주말 캠핑",
        date: {
          start: "2026-03-08",
          end: "2026-03-09",
        },
        location: {
          region: "yangpyeong",
        },
        companion_ids: ["self", "child-1"],
        companion_snapshots: [
          state.companions[0],
          state.companions[1],
        ],
        attendee_count: 2,
        vehicle_snapshot: state.vehicles[0],
        notes: ["비 예보가 있어 타프를 추가함"],
        archived_at: "2026-03-10T09:00:00.000Z",
        output_path: ".camping-data/outputs/2026-03-08-yangpyeong-plan.md",
        trip_snapshot: {
          version: 1,
          trip_id: "2026-03-08-yangpyeong",
          title: "3월 양평 주말 캠핑",
          date: {
            start: "2026-03-08",
            end: "2026-03-09",
          },
          location: {
            region: "yangpyeong",
          },
          party: {
            companion_ids: ["self", "child-1"],
          },
          vehicle: {
            id: "family-suv",
            name: "패밀리 SUV",
            passenger_capacity: 5,
            load_capacity_kg: 400,
            notes: [],
          },
          notes: [],
        },
      },
    ];
    state.outputs["2026-03-08-yangpyeong"] = {
      trip_id: "2026-03-08-yangpyeong",
      output_path: ".camping-data/outputs/2026-03-08-yangpyeong-plan.md",
      markdown: "# 양평 히스토리 결과\n\n- 타프와 난방 장비 확인",
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 히스토리" }));

    expect(
      await screen.findByText(".camping-data/outputs/2026-03-08-yangpyeong-plan.md"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "결과 열기" }));

    expect(await screen.findByText("양평 히스토리 결과")).toBeInTheDocument();
    expect(screen.getByText("타프와 난방 장비 확인")).toBeInTheDocument();
  });

  it("ignores stale history output responses after selection changes", async () => {
    state.history = [
      {
        version: 1,
        history_id: "2026-03-08-yangpyeong",
        source_trip_id: "2026-03-08-yangpyeong",
        title: "3월 양평 주말 캠핑",
        date: {
          start: "2026-03-08",
          end: "2026-03-09",
        },
        location: {
          region: "yangpyeong",
        },
        companion_ids: ["self", "child-1"],
        companion_snapshots: [
          state.companions[0],
          state.companions[1],
        ],
        attendee_count: 2,
        vehicle_snapshot: state.vehicles[0],
        notes: [],
        archived_at: "2026-03-10T09:00:00.000Z",
        output_path: ".camping-data/outputs/2026-03-08-yangpyeong-plan.md",
        trip_snapshot: {
          version: 1,
          trip_id: "2026-03-08-yangpyeong",
          title: "3월 양평 주말 캠핑",
          date: {
            start: "2026-03-08",
            end: "2026-03-09",
          },
          location: {
            region: "yangpyeong",
          },
          party: {
            companion_ids: ["self", "child-1"],
          },
          vehicle: {
            id: "family-suv",
            name: "패밀리 SUV",
            passenger_capacity: 5,
            load_capacity_kg: 400,
            notes: [],
          },
          notes: [],
        },
      },
      {
        version: 1,
        history_id: "2026-04-12-sokcho",
        source_trip_id: "2026-04-12-sokcho",
        title: "4월 속초 주말 캠핑",
        date: {
          start: "2026-04-12",
          end: "2026-04-13",
        },
        location: {
          region: "sokcho",
        },
        companion_ids: ["self"],
        companion_snapshots: [state.companions[0]],
        attendee_count: 1,
        vehicle_snapshot: state.vehicles[0],
        notes: [],
        archived_at: "2026-04-15T09:00:00.000Z",
        output_path: ".camping-data/outputs/2026-04-12-sokcho-plan.md",
        trip_snapshot: {
          version: 1,
          trip_id: "2026-04-12-sokcho",
          title: "4월 속초 주말 캠핑",
          date: {
            start: "2026-04-12",
            end: "2026-04-13",
          },
          location: {
            region: "sokcho",
          },
          party: {
            companion_ids: ["self"],
          },
          vehicle: {
            id: "family-suv",
            name: "패밀리 SUV",
            passenger_capacity: 5,
            load_capacity_kg: 400,
            notes: [],
          },
          notes: [],
        },
      },
    ];
    state.outputs["2026-03-08-yangpyeong"] = {
      trip_id: "2026-03-08-yangpyeong",
      output_path: ".camping-data/outputs/2026-03-08-yangpyeong-plan.md",
      markdown: "# 늦게 도착한 양평 결과\n\n- stale 응답",
    };
    state.outputs["2026-04-12-sokcho"] = {
      trip_id: "2026-04-12-sokcho",
      output_path: ".camping-data/outputs/2026-04-12-sokcho-plan.md",
      markdown: "# 속초 결과\n\n- 현재 선택 결과",
    };

    let resolveDelayedOutput:
      | ((response: Response) => void)
      | undefined;

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/outputs/2026-03-08-yangpyeong" && method === "GET") {
        return new Promise<Response>((resolve) => {
          resolveDelayedOutput = resolve;
        });
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 히스토리" }));
    await userEvent.click(screen.getByRole("button", { name: "결과 열기" }));
    await userEvent.click(
      screen.getByRole("button", { name: /4월 속초 주말 캠핑/u }),
    );

    resolveDelayedOutput?.({
      ok: true,
      status: 200,
      json: async () => state.outputs["2026-03-08-yangpyeong"],
    } as Response);

    await waitFor(() => {
      expect(screen.getByDisplayValue("4월 속초 주말 캠핑")).toBeInTheDocument();
    });
    expect(screen.queryByText("늦게 도착한 양평 결과")).not.toBeInTheDocument();
  });

  it("renders external links grouped by category", async () => {
    state.links = [
      {
        id: "weather-kma",
        category: "weather",
        name: "기상청",
        url: "https://weather.go.kr",
        notes: "예보 확인",
        sort_order: 1,
      },
      {
        id: "food-map",
        category: "food",
        name: "맛집 지도",
        url: "https://example.com/food",
        notes: "근처 맛집",
        sort_order: 2,
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "외부 링크" }));

    expect(await screen.findByRole("heading", { name: "날씨" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "맛집" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("기상청")).toBeInTheDocument();
    expect(screen.getByDisplayValue("맛집 지도")).toBeInTheDocument();
  });
});

function createMockState(): MockState {
  const trip: TripData = {
    version: 1,
    trip_id: "2026-04-18-gapyeong",
    title: "4월 가평 가족 캠핑",
    date: {
      start: "2026-04-18",
      end: "2026-04-19",
    },
    location: {
      campsite_name: "자라섬 캠핑장",
      region: "gapyeong",
    },
    party: {
      companion_ids: ["self", "child-1"],
    },
    vehicle: {
      id: "family-suv",
      name: "패밀리 SUV",
      passenger_capacity: 5,
      load_capacity_kg: 400,
      notes: [],
    },
    conditions: {
      electricity_available: true,
      cooking_allowed: true,
      expected_weather: {
        source: "manual",
        summary: "맑음",
      },
    },
    meal_plan: {
      use_ai_recommendation: true,
      requested_dishes: ["bbq"],
    },
    travel_plan: {
      use_ai_recommendation: true,
      requested_stops: [],
    },
    notes: [],
  };

  return {
    companions: [
      {
        id: "self",
        name: "본인",
        age_group: "adult",
        birth_year: 1990,
        health_notes: [],
        required_medications: [],
        traits: {
          cold_sensitive: false,
          heat_sensitive: false,
          rain_sensitive: false,
        },
      },
      {
        id: "child-1",
        name: "첫째",
        age_group: "preschooler",
        birth_year: 2021,
        health_notes: [],
        required_medications: [],
        traits: {
          cold_sensitive: true,
          heat_sensitive: false,
          rain_sensitive: true,
        },
      },
    ],
    vehicles: [
      {
        id: "family-suv",
        name: "패밀리 SUV",
        description: "가족 캠핑용 기본 차량",
        passenger_capacity: 5,
        load_capacity_kg: 400,
        notes: [],
      },
    ],
    trips: [summarizeTrip(trip)],
    tripDetails: {
      [trip.trip_id]: trip,
    },
    validations: {
      [trip.trip_id]: {
        body: {
          status: "ok",
          warnings: [],
        },
      },
    },
    analysis: {
      body: {
        trip_id: "2026-04-18-gapyeong",
        status: "completed",
        warnings: [],
        markdown: "# 4월 가평 가족 캠핑 분석 결과\n\n## 1. 요약\n\n- 테스트 결과",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      },
    },
    equipment: {
      durable: {
        version: 1,
        items: [],
      },
      consumables: {
        version: 1,
        items: [],
      },
      precheck: {
        version: 1,
        items: [],
      },
    },
    equipmentCategories: {
      version: 1,
      durable: [
        { id: "shelter", label: "쉘터/텐트", sort_order: 1 },
        { id: "sleeping", label: "침구", sort_order: 2 },
      ],
      consumables: [
        { id: "fuel", label: "연료", sort_order: 1 },
        { id: "ignition", label: "점화", sort_order: 2 },
      ],
      precheck: [
        { id: "battery", label: "배터리", sort_order: 1 },
        { id: "vehicle", label: "차량", sort_order: 2 },
      ],
    },
    history: [],
    links: [],
    outputs: {},
    updateTripCalls: [],
    dataBackups: [],
  };
}
