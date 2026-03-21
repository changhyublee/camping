import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalyzeTripResponse,
  EquipmentCatalog,
  HistoryRecord,
  TripData,
  TripSummary,
  ValidateTripResponse,
} from "@camping/shared";
import { App } from "./App";

const fetchMock = vi.fn<typeof fetch>();

vi.stubGlobal("fetch", fetchMock);

type MockState = {
  trips: TripSummary[];
  trip: TripData;
  validation: ValidateTripResponse;
  analysis: { body: AnalyzeTripResponse; status?: number };
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

function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method?.toUpperCase() ?? "GET";

  if (url.endsWith("/api/trips") && method === "GET") {
    return jsonResponse({ items: state.trips });
  }

  if (url.endsWith("/api/equipment") && method === "GET") {
    return jsonResponse(state.equipment);
  }

  if (url.endsWith("/api/history") && method === "GET") {
    return jsonResponse({ items: state.history });
  }

  if (url.endsWith("/api/links") && method === "GET") {
    return jsonResponse({ items: state.links });
  }

  if (url.endsWith(`/api/trips/${state.trip.trip_id}`) && method === "GET") {
    return jsonResponse({
      trip_id: state.trip.trip_id,
      data: state.trip,
    });
  }

  if (url.endsWith("/api/validate-trip") && method === "POST") {
    return jsonResponse(state.validation);
  }

  if (url.endsWith("/api/analyze-trip") && method === "POST") {
    return jsonResponse(state.analysis.body, state.analysis.status ?? 200);
  }

  if (url.endsWith("/api/outputs") && method === "POST") {
    return jsonResponse({
      status: "saved",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
    });
  }

  if (url.endsWith(`/api/trips/${state.trip.trip_id}/assistant`) && method === "POST") {
    return jsonResponse({
      trip_id: state.trip.trip_id,
      warnings: [],
      assistant_message: "### AI 보조 응답\n- 비 예보 대비 타프를 검토하세요.",
      actions: [],
    });
  }

  throw new Error(`Unhandled request: ${method} ${url}`);
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
    state.validation = {
      status: "ok",
      warnings: ["예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."],
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
});

function createMockState(): MockState {
  return {
    trips: [
      {
        trip_id: "2026-04-18-gapyeong",
        title: "4월 가평 가족 캠핑",
        start_date: "2026-04-18",
        region: "gapyeong",
        companion_count: 2,
      },
    ],
    trip: {
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
    },
    validation: {
      status: "ok",
      warnings: [],
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
  };
}
