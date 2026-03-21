import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalyzeTripResponse,
  Companion,
  EquipmentCatalog,
  EquipmentCategoriesData,
  GetOutputResponse,
  HistoryRecord,
  TripDraft,
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
  companions: Companion[];
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
};

let state: MockState;
beforeEach(() => {
  state = createMockState();
  fetchMock.mockImplementation(mockFetch);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  fetchMock.mockReset();
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

function readOutputTripIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/outputs\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readEquipmentDeleteParams(pathname: string) {
  const match = pathname.match(/^\/api\/equipment\/([^/]+)\/items\/([^/]+)$/u);

  if (!match) {
    return null;
  }

  return {
    section: match[1] as "durable" | "consumables" | "precheck",
    itemId: match[2],
  };
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

  if (pathname === "/api/equipment" && method === "GET") {
    return jsonResponse(state.equipment);
  }

  if (pathname === "/api/equipment/categories" && method === "GET") {
    return jsonResponse(state.equipmentCategories);
  }

  const companionIdFromPath = readCompanionIdFromPath(pathname);

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

  const equipmentDeleteParams = readEquipmentDeleteParams(pathname);
  const equipmentCategoryParams = readEquipmentCategoryParams(pathname);

  if (equipmentCategoryParams && !equipmentCategoryParams.categoryId && method === "POST") {
    const body = parseBody(init) as { label: string };
    const item = {
      id: body.label.toLowerCase().replace(/\s+/gu, "-"),
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

  if (equipmentDeleteParams && method === "DELETE") {
    const { section, itemId } = equipmentDeleteParams;

    state.equipment[section].items = state.equipment[section].items.filter(
      (item) => item.id !== itemId,
    );

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

  it("auto-creates missing companions when saving a trip", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    const companionInput = await screen.findByPlaceholderText(
      "콤마로 구분 (예: self, child-1)",
    );

    await userEvent.clear(companionInput);
    await userEvent.type(companionInput, "self, ghost");
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.updateTripCalls).toHaveLength(1);
      expect(state.companions.some((item) => item.id === "ghost")).toBe(true);
    });

    expect(state.updateTripCalls[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          party: {
            companion_ids: ["self", "ghost"],
          },
        }),
      }),
    );
    expect(await screen.findByText(/기본 프로필로 추가했습니다/u)).toBeInTheDocument();
  });

  it("preserves trailing commas in companion input while saving parsed ids", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    const companionInput = await screen.findByPlaceholderText(
      "콤마로 구분 (예: self, child-1)",
    );

    await userEvent.clear(companionInput);
    await userEvent.type(companionInput, "self,");

    expect(companionInput).toHaveValue("self,");

    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.updateTripCalls).toHaveLength(1);
    });

    expect(state.updateTripCalls[0]).toEqual(
      expect.objectContaining({
        tripId: "2026-04-18-gapyeong",
        body: expect.objectContaining({
          party: {
            companion_ids: ["self"],
          },
        }),
      }),
    );
  });

  it("preserves spaces in trip notes while editing", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    const notesInput = screen.getByPlaceholderText("메모를 줄 단위로 입력");

    await userEvent.clear(notesInput);
    await userEvent.type(notesInput, "텐트 옆 공간 ");

    expect(notesInput).toHaveValue("텐트 옆 공간 ");
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

    expect(await screen.findAllByText("부족 기준")).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: "없음" }).length).toBeGreaterThan(0);
  });

  it("renders equipment categories as selects and can add a managed category", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    expect(screen.getAllByRole("combobox", { name: "카테고리" }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "관리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("수납").length).toBeGreaterThan(0);
  });

  it("keeps saved category labels in equipment selects until category save succeeds", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "관리 설정" }));

    const shelterCard = screen.getByText("shelter").closest("article");
    expect(shelterCard).not.toBeNull();

    const labelInput = within(shelterCard as HTMLElement).getByDisplayValue("쉘터/텐트");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "임시 라벨");

    expect(labelInput).toHaveValue("임시 라벨");

    await userEvent.click(screen.getByRole("button", { name: "장비 관리" }));

    expect(screen.getAllByRole("option", { name: "쉘터/텐트" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("option", { name: "임시 라벨" })).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "관리 설정" }));

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
        attendee_count: 2,
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
        attendee_count: 1,
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
  };
}
