import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalyzeTripResponse,
  EquipmentCatalog,
  GetOutputResponse,
  HistoryRecord,
  TripData,
  TripSummary,
  ValidateTripResponse,
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
  trips: TripSummary[];
  tripDetails: Record<string, TripData>;
  validations: Record<
    string,
    ApiResponse<ValidateTripResponse | FailedValidationResponse>
  >;
  analysis: ApiResponse<AnalyzeTripResponse>;
  equipment: EquipmentCatalog;
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
};

let state: MockState;

beforeEach(() => {
  state = createMockState();
  fetchMock.mockImplementation(mockFetch);
});

afterEach(() => {
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
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

function readOutputTripIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/outputs\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const rawUrl = typeof input === "string" ? input : input.toString();
  const pathname = new URL(rawUrl, "http://localhost").pathname;
  const method = init?.method?.toUpperCase() ?? "GET";

  if (pathname === "/api/trips" && method === "GET") {
    return jsonResponse({ items: state.trips });
  }

  if (pathname === "/api/equipment" && method === "GET") {
    return jsonResponse(state.equipment);
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

    await userEvent.click(
      await screen.findByRole("button", { name: "분석 실행" }),
    );

    expect(await screen.findByText("테스트 결과")).toBeInTheDocument();
    expect(
      screen.getByText(".camping-data/outputs/2026-04-18-gapyeong-plan.md"),
    ).toBeInTheDocument();
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

  it("shows low stock threshold and status controls for consumables", async () => {
    state.equipment.consumables.items = [
      {
        id: "butane-gas",
        name: "부탄가스",
        category: "fuel",
        quantity_on_hand: 1,
        unit: "ea",
        low_stock_threshold: 2,
        status: "low",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "소모품" }));

    expect(await screen.findAllByPlaceholderText("부족 기준")).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: "empty" }).length).toBeGreaterThan(0);
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
        attendee_count: 2,
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
        markdown: "# 4월 가평 가족 캠핑 캠핑 분석 결과\n\n## 1. 요약\n\n- 테스트 결과",
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
    history: [],
    links: [],
    outputs: {},
    updateTripCalls: [],
  };
}
