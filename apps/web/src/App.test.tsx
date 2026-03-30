import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
  TRIP_ANALYSIS_CATEGORY_METADATA,
} from "@camping/shared";
import type {
  AnalyzeTripResponse,
  GetOutputResponse,
  HistoryRecord,
  RefreshDurableEquipmentMetadataResponse,
  TripData,
  UserLearningJobStatusResponse,
  UserLearningProfile,
} from "@camping/shared";
import { App } from "./App";
import {
  type ApiResponse,
  MockEventSource,
  createAnalysisResponse,
  createDeferredResponse,
  createHistoryRecord,
  createUserLearningStatus,
  emptyResponse,
  fetchMock,
  jsonResponse,
  mockFetch,
  openPage,
  openPageTab,
  parseBody,
  state,
  summarizeTrip,
  type MockState,
} from "./test/app-test-helpers";

describe("App", () => {
  it("navigates to planning and renders analysis markdown", async () => {
    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");
    expect(await screen.findByRole("button", { name: "전체 분석 실행" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));

    expect(screen.getByRole("tablist", { name: "계획 상세 보기" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "분석 결과" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "분석 결과" })).toHaveAttribute(
      "aria-controls",
      "planning-detail-panel-analysis",
    );
    expect(screen.getByRole("tab", { name: "AI 보조" })).not.toHaveAttribute("aria-controls");
    expect(await screen.findByText("섹션별 분석")).toBeInTheDocument();
    expect(
      screen.getByText(
        "필요한 섹션만 먼저 수집하고, 누적된 결과를 하나의 Markdown 플랜으로 계속 합성합니다.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "AI 보조" }));
    expect(screen.getByRole("tab", { name: "AI 보조" })).toHaveAttribute(
      "aria-controls",
      "planning-detail-panel-assistant",
    );
    expect(screen.getByRole("tab", { name: "분석 결과" })).not.toHaveAttribute("aria-controls");
    expect(await screen.findByText("AI 보조는 저장 후 질문할 때 사용")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "예: 빠진 준비물이 있는지 먼저 점검해줘. 비 예보와 아이 동행 기준으로 알려줘",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "분석 결과" }));
    expect(
      screen.getByText(
        "1. 요약",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "원본 입력" }));
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));
    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));

    expect(await screen.findByText("테스트 결과")).toBeInTheDocument();
    expect(
      screen.getAllByText(".camping-data/outputs/2026-04-18-gapyeong-plan.md").length,
    ).toBeGreaterThan(0);
  });

  it("uses the current URL as the initial page when opening a direct route", async () => {
    window.history.replaceState(null, "", "/planning");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "캠핑 계획" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "캠핑 계획" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("tab", { name: "계획 목록" })).toBeInTheDocument();
  });

  it("opens the dashboard at the root path even when session storage remembers another page", async () => {
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        activePage: "planning",
        selectedTripId: "2026-04-18-gapyeong",
        selectedHistoryId: null,
        equipmentSection: "durable",
      }),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "대시보드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대시보드" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(window.location.pathname).toBe("/dashboard");
  });

  it("pushes page navigation into browser history so back restores the previous page", async () => {
    render(<App />);

    expect(window.location.pathname).toBe("/dashboard");

    await openPage("캠핑 계획");
    expect(window.location.pathname).toBe("/planning");
    expect(await screen.findByRole("heading", { name: "캠핑 계획" })).toBeInTheDocument();

    await openPage("장비 관리");
    expect(window.location.pathname).toBe("/equipment");
    expect(
      await screen.findByRole("heading", { name: "장비 점검과 재고 관리" }),
    ).toBeInTheDocument();

    window.history.back();
    fireEvent.popState(window);

    expect(await screen.findByRole("heading", { name: "캠핑 계획" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/planning");
  });

  it("opens the planning analysis markdown in a wide layer and closes it with Escape", async () => {
    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));
    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));

    expect(await screen.findByText("테스트 결과")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "넓게 보기" }));

    const dialog = await screen.findByRole("dialog", {
      name: "4월 가평 가족 캠핑 분석 결과",
    });
    expect(
      within(dialog).getByText(
        "본문 폭을 넓혀 이번 캠핑의 최종 Markdown 정리본을 다시 읽는 전용 보기입니다.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(".camping-data/outputs/2026-04-18-gapyeong-plan.md"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "결과 레이어 닫기" }),
    ).toHaveFocus();

    await userEvent.tab();

    expect(
      within(dialog).getByRole("button", { name: "결과 레이어 닫기" }),
    ).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "4월 가평 가족 캠핑 분석 결과" }),
      ).toBeNull();
    });
  });

  it("keeps the planning page after remount and restores saved analysis output", async () => {
    state.outputs["2026-04-18-gapyeong"] = {
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# 저장된 분석 결과\n\n- 자동 복원",
    };
    state.outputAvailability["2026-04-18-gapyeong"] = true;

    const firstRender = render(<App />);

    await openPageTab("캠핑 계획", "AI·결과");
    expect(await screen.findByText("자동 복원")).toBeInTheDocument();

    firstRender.unmount();

    render(<App />);

    expect(await screen.findByRole("tab", { name: "원본 입력" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));
    expect(await screen.findByText("자동 복원")).toBeInTheDocument();
  });

  it("restores the analyzing button state after remount when background analysis is still running", async () => {
    window.history.replaceState(null, "", "/planning");
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        activePage: "planning",
        selectedTripId: "2026-04-18-gapyeong",
        selectedHistoryId: null,
        equipmentSection: "durable",
      }),
    );
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: (() => {
        const response = createAnalysisResponse("2026-04-18-gapyeong", {
          status: "running",
          requested_at: "2026-03-24T10:00:00.000Z",
          started_at: "2026-03-24T10:00:01.000Z",
        });

        return {
          ...response,
          categories: response.categories.map((category, index) =>
            index === 0
              ? {
                  ...category,
                  status: "running",
                  requested_at: "2026-03-24T10:00:00.000Z",
                  started_at: "2026-03-24T10:00:01.000Z",
                }
              : category,
          ),
        };
      })(),
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("tab", { name: "원본 입력" }));
    const button = await screen.findByRole("button", { name: "분석 중..." });
    expect(button).toBeDisabled();

    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));
    const sectionCollectButton = await screen.findByRole("button", { name: "선택 수집" });
    expect(sectionCollectButton).toBeEnabled();

    await userEvent.click(sectionCollectButton);

    const analyzeCalls = fetchMock.mock.calls.filter(([input]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      return new URL(rawUrl, "http://localhost").pathname === "/api/analyze-trip";
    });
    expect(analyzeCalls.length).toBeGreaterThan(0);
  });

  it("updates planning status and output immediately from SSE analysis events", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const runningResponse = createAnalysisResponse("2026-04-18-gapyeong", {
      status: "running",
      requested_at: "2026-03-24T10:00:00.000Z",
      started_at: "2026-03-24T10:00:01.000Z",
      categories: createAnalysisResponse("2026-04-18-gapyeong").categories.map(
        (category, index) =>
          index === 0
            ? {
                ...category,
                status: "running",
                requested_at: "2026-03-24T10:00:00.000Z",
                started_at: "2026-03-24T10:00:01.000Z",
              }
            : category,
      ),
    });
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: runningResponse,
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");
    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });
    MockEventSource.latest().open();

    MockEventSource.latest().emit("analysis-status", {
      type: "analysis-status",
      status: runningResponse,
    });

    expect(await screen.findByRole("button", { name: "분석 중..." })).toBeDisabled();

    state.outputs["2026-04-18-gapyeong"] = {
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# SSE 최신 결과\n\n- 실시간으로 갱신됨",
    };
    state.outputAvailability["2026-04-18-gapyeong"] = true;

    MockEventSource.latest().emit("analysis-status", {
      type: "analysis-status",
      status: {
        ...runningResponse,
        status: "completed",
        finished_at: "2026-03-24T10:05:00.000Z",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        completed_category_count: 1,
        categories: runningResponse.categories.map((category, index) =>
          index === 0
            ? {
                ...category,
                status: "completed",
                has_result: true,
                finished_at: "2026-03-24T10:05:00.000Z",
                collected_at: "2026-03-24T10:05:00.000Z",
              }
            : category,
        ),
      },
    });

    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));
    expect(await screen.findByText("실시간으로 갱신됨")).toBeInTheDocument();
    expect(await screen.findByText("분석 완료")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockEventSource.latest().readyState).toBe(2);
    });
  });

  it("refreshes history learning and user profile from SSE user-learning events", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    state.history = [
      createHistoryRecord({
        retrospectives: [
          {
            entry_id: "retro-1",
            created_at: "2026-03-29T12:00:00.000Z",
            overall_satisfaction: 4,
            used_durable_item_ids: ["family-tent-4p"],
            unused_items: [],
            missing_or_needed_items: ["아이 여벌 옷"],
            meal_feedback: [],
            route_feedback: [],
            site_feedback: [],
            issues: ["야간 보온 준비 부족"],
            next_time_requests: ["보온 장비 보강"],
            freeform_note: "아이와 함께라 저녁 이후에는 보온이 중요했다.",
          },
        ],
      }),
    ];
    state.userLearningStatus = createUserLearningStatus({
      status: "queued",
      trigger_history_id: "2026-03-08-yangpyeong",
      requested_at: "2026-03-29T12:00:00.000Z",
    });

    render(<App />);

    await openPageTab("캠핑 히스토리", "상세 보기");
    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });
    MockEventSource.latest().open();

    state.historyLearning["2026-03-08-yangpyeong"] = {
      history_id: "2026-03-08-yangpyeong",
      updated_at: "2026-03-29T12:05:00.000Z",
      source_entry_count: 1,
      summary: "보온과 차광을 함께 점검해야 하는 패턴이 보였다.",
      behavior_patterns: ["아이 장비를 여유 있게 챙김"],
      equipment_hints: ["타프와 방풍 장비를 먼저 확인"],
      meal_hints: [],
      route_hints: [],
      campsite_hints: [],
      avoidances: [],
      issues: ["야간 보온 준비 부족"],
      next_time_requests: ["아이 여벌 옷 추가"],
      next_trip_focus: ["보온과 차광 장비 우선 확인"],
    };
    state.userLearningProfile = {
      updated_at: "2026-03-29T12:05:00.000Z",
      source_history_ids: ["2026-03-08-yangpyeong"],
      source_entry_count: 1,
      summary: "아이 동반 기준으로 보온, 차광, 이동 여유를 중시하는 패턴이 누적됐다.",
      behavior_patterns: ["아이 장비를 여유 있게 챙김"],
      equipment_hints: ["보온 장비와 타프를 먼저 점검"],
      meal_hints: [],
      route_hints: [],
      campsite_hints: [],
      avoidances: ["강풍 노출 사이트 회피"],
      next_trip_focus: ["보온과 차광 장비 우선 확인"],
    };

    MockEventSource.latest().emit("user-learning-status", {
      type: "user-learning-status",
      status: createUserLearningStatus({
        status: "completed",
        trigger_history_id: "2026-03-08-yangpyeong",
        source_history_ids: ["2026-03-08-yangpyeong"],
        source_entry_count: 1,
        requested_at: "2026-03-29T12:00:00.000Z",
        started_at: "2026-03-29T12:00:01.000Z",
        finished_at: "2026-03-29T12:05:00.000Z",
      }),
    });

    expect(
      await screen.findByText("보온과 차광을 함께 점검해야 하는 패턴이 보였다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "아이 동반 기준으로 보온, 차광, 이동 여유를 중시하는 패턴이 누적됐다.",
      ),
    ).toBeInTheDocument();
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

    await openPageTab("캠핑 계획", "원본 입력");
    expect(await screen.findByDisplayValue("4월 가평 가족 캠핑")).toBeInTheDocument();

    deferredOutput.resolve({
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# 지연된 저장 결과\n\n- 나중에 도착",
    });

    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));
    expect(await screen.findByText("나중에 도착")).toBeInTheDocument();
  });

  it("does not show saved output when the trip detail request fails", async () => {
    window.history.replaceState(null, "", "/planning");
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
      body: createAnalysisResponse("2026-04-18-gapyeong", {
        status: "failed",
        finished_at: "2026-03-24T10:05:00.000Z",
        error: {
          code: "OPENAI_REQUEST_FAILED",
          message: "OpenAI 분석 요청에 실패했습니다.",
        },
      }),
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    expect(
      await screen.findByText("예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));
    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));

    await waitFor(() => {
      expect(screen.getByText("분석 실패")).toBeInTheDocument();
      expect(
        screen.getByText("OpenAI 분석 요청에 실패했습니다."),
      ).toBeInTheDocument();
    });
  });

  it("keeps the previous markdown visible when background analysis fails", async () => {
    state.outputAvailability["2026-04-18-gapyeong"] = true;
    state.outputs["2026-04-18-gapyeong"] = {
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# 이전 분석 결과\n\n- 그대로 유지",
    };
    state.analysis = {
      body: createAnalysisResponse("2026-04-18-gapyeong", {
        status: "failed",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: "2026-03-24T10:00:05.000Z",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        error: {
          code: "OUTPUT_SAVE_FAILED",
          message: "분석 결과를 저장하지 못했습니다: 2026-04-18-gapyeong",
        },
      }),
    };

    render(<App />);

    await openPageTab("캠핑 계획", "AI·결과");
    expect(await screen.findByText("그대로 유지")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "원본 입력" }));
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));
    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));

    expect(
      (
        await screen.findAllByText(
          "분석 결과를 저장하지 못했습니다: 2026-04-18-gapyeong",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("그대로 유지")).toBeInTheDocument();
  });

  it("always requests analysis with automatic output saving", async () => {
    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));

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

    await openPageTab("캠핑 계획", "원본 입력");
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));
    await userEvent.click(screen.getByRole("tab", { name: "계획 목록" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /양양 테스트 캠핑/u }),
    );
    await userEvent.click(screen.getByRole("tab", { name: "원본 입력" }));

    expect(await screen.findByDisplayValue("양양 테스트 캠핑")).toBeInTheDocument();

    deferredAnalysis.resolve({
      ...createAnalysisResponse("2026-04-18-gapyeong", {
        status: "completed",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: "2026-03-24T10:00:10.000Z",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      }),
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

    await openPageTab("카테고리 설정", "보조 작업");
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.type(screen.getByPlaceholderText("예: tarp"), "storage-rack");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).not.toBeNull();
  });

  it("creates a manual data backup from the management page", async () => {
    render(<App />);

    await openPageTab("카테고리 설정", "보조 작업");
    await userEvent.click(screen.getByRole("tab", { name: "로컬 백업" }));
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

  it("cancels all AI jobs from the sidebar and refreshes the selected planning state", async () => {
    const runningAnalysis = createAnalysisResponse("2026-04-18-gapyeong", {
      status: "running",
      requested_at: "2026-03-24T10:00:00.000Z",
      started_at: "2026-03-24T10:00:01.000Z",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
    });
    runningAnalysis.categories = runningAnalysis.categories.map((category) =>
      category.category === "equipment"
        ? {
            ...category,
            status: "running",
            requested_at: "2026-03-24T10:00:00.000Z",
            started_at: "2026-03-24T10:00:01.000Z",
          }
        : category,
    );
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: runningAnalysis,
    };
    state.metadataStatuses["family-tent"] = {
      body: {
        item_id: "family-tent",
        status: "running",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: null,
      },
    };
    window.history.replaceState(null, "", "/planning");
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        activePage: "planning",
        selectedTripId: "2026-04-18-gapyeong",
        selectedHistoryId: null,
        equipmentSection: "durable",
      }),
    );

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "모든 AI 요청 중단" }));

    expect(await screen.findByText("모든 AI 요청 중단 완료")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "AI·결과" }));
    expect(await screen.findByText("분석 중단")).toBeInTheDocument();
    expect(
      screen.getAllByText("사용자 요청으로 모든 AI 분석을 중단했습니다.").length,
    ).toBeGreaterThan(0);

    const cancelCall = fetchMock.mock.calls.find(([input, init]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;

      return (
        pathname === "/api/ai-jobs/cancel-all" &&
        (init?.method?.toUpperCase() ?? "GET") === "POST"
      );
    });

    expect(cancelCall).toBeDefined();
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

    await openPageTab("카테고리 설정", "보조 작업");
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

    await openPageTab("캠핑 계획", "계획 목록");
    await userEvent.click(await screen.findByRole("button", { name: /문제 계획/u }));
    await userEvent.click(screen.getByRole("tab", { name: "원본 입력" }));

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

    await openPageTab("캠핑 계획", "계획 목록");
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.click(screen.getByRole("tab", { name: "원본 입력" }));
    await userEvent.type(screen.getByPlaceholderText("새 캠핑 계획"), "선택 테스트 계획");

    await userEvent.click(screen.getByRole("checkbox", { name: /^본인/u }));
    await userEvent.click(screen.getByRole("checkbox", { name: /^첫째/u }));

    expect(
      screen.queryByText("동행자를 선택하면 요약 정보가 여기 표시됩니다."),
    ).toBeNull();
    expect(screen.getByText("self")).toBeInTheDocument();
    expect(screen.getByText("child-1")).toBeInTheDocument();
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

  it("opens the planning editor tab immediately after selecting a trip from the list tab", async () => {
    render(<App />);

    await openPageTab("캠핑 계획", "계획 목록");
    await userEvent.click(screen.getByRole("button", { name: /4월 가평 가족 캠핑/u }));

    expect(screen.getByRole("tab", { name: "원본 입력" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByDisplayValue("4월 가평 가족 캠핑")).toBeInTheDocument();
  });

  it("opens the planning list tab first when entering the page from the sidebar", async () => {
    render(<App />);

    await openPage("캠핑 계획");

    expect(screen.getByRole("tab", { name: "계획 목록" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("button", { name: "새 계획 작성" })).toBeInTheDocument();
  });

  it("resets the planning page to the list tab when returning through the sidebar", async () => {
    render(<App />);

    await openPageTab("캠핑 계획", "AI·결과");
    expect(screen.getByRole("tab", { name: "AI·결과" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await openPage("대시보드");
    await openPage("캠핑 계획");

    expect(screen.getByRole("tab", { name: "계획 목록" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("button", { name: "새 계획 작성" })).toBeInTheDocument();
  });

  it("opens the planning list tab from the dashboard quick action", async () => {
    render(<App />);

    await openPageTab("캠핑 계획", "AI·결과");
    await openPage("대시보드");
    await userEvent.click(screen.getByRole("tab", { name: "빠른 실행" }));
    await userEvent.click(screen.getByRole("button", { name: /캠핑 계획 열기/u }));

    expect(screen.getByRole("tab", { name: "계획 목록" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("button", { name: "새 계획 작성" })).toBeInTheDocument();
  });

  it("opens the companion editor tab immediately after selecting a person from the list tab", async () => {
    render(<App />);

    await openPageTab("사람 관리", "사람 목록");
    await userEvent.click(screen.getByRole("button", { name: /본인 성인/u }));

    expect(screen.getByRole("tab", { name: "프로필 편집" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("button", { name: "사람 삭제" })).toBeInTheDocument();
  });

  it("selects a managed vehicle and saves its snapshot with the trip", async () => {
    render(<App />);

    await openPageTab("캠핑 계획", "계획 목록");
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.click(screen.getByRole("tab", { name: "원본 입력" }));
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

    await openPageTab("캠핑 계획", "원본 입력");

    const notesInput = screen.getByPlaceholderText(
      "사이트 특이사항, 출발 전 꼭 챙길 것, 당일 일정 메모, 아직 장비/링크로 옮기지 않은 임시 메모를 줄 단위로 적어두세요.",
    );

    await userEvent.clear(notesInput);
    await userEvent.type(notesInput, "텐트 옆 공간 ");

    expect(notesInput).toHaveValue("텐트 옆 공간 ");
  });

  it("removes a deleted companion from the current trip selection", async () => {
    render(<App />);

    await openPageTab("사람 관리", "사람 목록");
    await userEvent.click(screen.getByRole("button", { name: /본인 성인/u }));
    await userEvent.click(screen.getByRole("tab", { name: "프로필 편집" }));
    await userEvent.click(screen.getByRole("button", { name: "사람 삭제" }));

    expect(await screen.findByText("동행자 삭제 완료")).toBeInTheDocument();

    await openPageTab("캠핑 계획", "원본 입력");
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

    await openPageTab("캠핑 계획", "계획 목록");
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.click(screen.getByRole("tab", { name: "원본 입력" }));
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

    await openPage("장비 관리");
    await userEvent.click(screen.getByRole("tab", { name: "소모품" }));
    await userEvent.click(screen.getByRole("button", { name: "연료 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "부탄가스 상세 펼치기" }),
    );

    expect(await screen.findByText("부족 기준")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "상태" })).toBeNull();
    expect(screen.getByText("부족")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "상세 작업" }));
    await userEvent.click(screen.getByRole("tab", { name: "항목 추가" }));
    expect(await screen.findByText("부족 기준")).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("tab", { name: "상세 작업" }));
    expect(screen.getByRole("tablist", { name: "장비 상세 보기" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "항목 추가" }));
    expect(
      screen.getByRole("button", { name: "소모품 추가" }),
    ).toBeInTheDocument();
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

  it("moves an item into the new category only after saving when the target category is collapsed", async () => {
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

    expect(
      within(sleepingBagCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("shelter");
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl = typeof input === "string" ? input : input.toString();
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        const body =
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as { category?: string })
            : null;
        return (
          pathname === "/api/equipment/durable/items/sleeping-bag-3season-adult" &&
          init?.method === "PUT" &&
          body?.category === "shelter"
        );
      }),
    ).toBe(true);
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 접기" }),
    ).toBeInTheDocument();
  });

  it("creates the target category group only after saving when the category changes", async () => {
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

    expect(
      within(sleepingBagCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("shelter");
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
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
    const queuedStatus: ApiResponse<RefreshDurableEquipmentMetadataResponse> = {
      status: 202,
      body: {
        item_id: "family-tent",
        status: "queued",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: null,
        finished_at: null,
      },
    };
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";
      const currentStatus = state.metadataStatuses["family-tent"];

      if (
        (pathname === "/api/equipment/durable/metadata-statuses" ||
          pathname === "/api/equipment") &&
        method === "GET"
      ) {
        if (Array.isArray(currentStatus) && currentStatus[0] === null) {
          state.equipment.durable.items[0] = {
            ...state.equipment.durable.items[0],
            metadata: {
              lookup_status: "found",
              searched_at: "2026-03-23T12:00:00.000Z",
              query: `${state.equipment.durable.items[0].name} ${state.equipment.durable.items[0].model ?? ""}`.trim(),
              summary: "포장 크기와 설치 시간을 확인했습니다.",
              product: {
                brand: "테스트 브랜드",
                official_name: state.equipment.durable.items[0].name,
                model: state.equipment.durable.items[0].model,
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
                  url:
                    state.equipment.durable.items[0].purchase_link ??
                    "https://example.com/product",
                  domain: "example.com",
                },
              ],
            },
          };
        }
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "패밀리 텐트 상세 펼치기" }));
    const familyTentCard = screen
      .getByRole("button", { name: "패밀리 텐트 상세 접기" })
      .closest("article");
    expect(familyTentCard).not.toBeNull();

    const modelInput = screen.getByDisplayValue("리빙쉘 4P");

    expect(modelInput).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.com/product")).toBeInTheDocument();
    expect(screen.getByText("장비 메타데이터")).toBeInTheDocument();
    expect(screen.getByText("미수집")).toBeInTheDocument();

    await userEvent.clear(modelInput);
    await userEvent.type(modelInput, "리빙쉘 5P");
    await userEvent.selectOptions(
      within(familyTentCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "sleeping",
    );

    state.metadataStatuses["family-tent"] = [queuedStatus, null];
    fireEvent.click(screen.getByRole("button", { name: "메타데이터 재수집" }));

    expect(await screen.findByText("장비 메타데이터 수집 시작")).toBeInTheDocument();
    expect(await screen.findByText("수집 완료")).toBeInTheDocument();
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
      parseBody(fetchMock.mock.calls[updateCallIndex]?.[1])?.category,
    ).toBe("sleeping");
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
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl = typeof input === "string" ? input : input.toString();
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        return pathname === "/api/equipment/durable/metadata-statuses" && !init?.method;
      }),
    ).toBe(true);
  });

  it("updates durable metadata cards immediately from SSE completion events", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

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
    state.metadataStatuses["family-tent"] = {
      body: {
        item_id: "family-tent",
        status: "queued",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: null,
        finished_at: null,
      },
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });
    MockEventSource.latest().open();
    await userEvent.click(screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "패밀리 텐트 상세 펼치기" }));

    expect(
      await screen.findByRole("button", { name: "메타데이터 수집 중..." }),
    ).toBeDisabled();

    state.equipment.durable.items[0] = {
      ...state.equipment.durable.items[0],
      metadata: {
        lookup_status: "found",
        searched_at: "2026-03-24T10:05:00.000Z",
        query: "패밀리 텐트 리빙쉘 4P",
        summary: "포장 크기와 설치 시간을 확인했습니다.",
        product: {
          brand: "테스트 브랜드",
          official_name: "패밀리 텐트",
          model: "리빙쉘 4P",
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
            url: "https://example.com/product",
            domain: "example.com",
          },
        ],
      },
    };

    MockEventSource.latest().emit("durable-metadata-completed", {
      type: "durable-metadata-completed",
      item_id: "family-tent",
      completed_at: "2026-03-24T10:05:00.000Z",
    });

    expect(await screen.findByText("수집 완료")).toBeInTheDocument();
    expect(await screen.findByText("포장 크기와 설치 시간을 확인했습니다.")).toBeInTheDocument();
    expect(await screen.findByText("68 x 34 x 30 cm")).toBeInTheDocument();
  });

  it("does not create the ai job stream while every background job is idle", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    render(<App />);

    expect(await screen.findByRole("button", { name: "대시보드" })).toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("moves a consumable into the new category only after saving", async () => {
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

    expect(
      within(butaneGasCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("ignition");
    expect(await screen.findByDisplayValue("부탄가스")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "점화 카테고리 펼치기" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("부탄가스")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "점화 카테고리 접기" }),
    ).toBeInTheDocument();
  });

  it("moves a precheck item into the new category only after saving", async () => {
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

    expect(
      within(lanternBatteryCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("vehicle");
    expect(await screen.findByDisplayValue("랜턴 배터리")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "차량 카테고리 펼치기" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("랜턴 배터리")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "차량 카테고리 접기" })).toBeInTheDocument();
  });

  it("renders equipment categories as selects and can add a managed category", async () => {
    render(<App />);

    await openPageTab("장비 관리", "상세 작업");
    await userEvent.click(screen.getByRole("tab", { name: "항목 추가" }));
    expect(screen.getAllByRole("combobox", { name: "카테고리" }).length).toBeGreaterThan(0);

    await openPageTab("카테고리 설정", "보조 작업");
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.type(screen.getByPlaceholderText("예: tarp"), "tarp");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "카테고리 목록" }));
    expect(
      screen.getByRole("button", { name: "수납 카테고리 설정 펼치기" }),
    ).toBeInTheDocument();
  });

  it("toggles category sections open and closed from the category management menu", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));

    expect(
      screen.queryByRole("button", { name: "쉘터/텐트 카테고리 설정 펼치기" }),
    ).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "반복 장비 섹션 펼치기" }),
    );

    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 설정 펼치기" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "반복 장비 섹션 접기" }),
    );

    expect(
      screen.queryByRole("button", { name: "쉘터/텐트 카테고리 설정 펼치기" }),
    ).toBeNull();
  });

  it("requires a category code when creating a category", async () => {
    render(<App />);

    await openPageTab("카테고리 설정", "보조 작업");
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
    await userEvent.click(
      screen.getByRole("button", { name: "반복 장비 섹션 펼치기" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 설정 펼치기" }),
    );

    const shelterCard = screen.getByText("shelter").closest("article");
    expect(shelterCard).not.toBeNull();

    const labelInput = within(shelterCard as HTMLElement).getByDisplayValue("쉘터/텐트");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "임시 라벨");

    expect(labelInput).toHaveValue("임시 라벨");

    await openPageTab("장비 관리", "상세 작업");
    await userEvent.click(screen.getByRole("tab", { name: "항목 추가" }));

    expect(screen.getAllByRole("option", { name: "쉘터/텐트" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("option", { name: "임시 라벨" })).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "카테고리 설정" }));
    const durableSectionExpandButton = screen.queryByRole("button", {
      name: "반복 장비 섹션 펼치기",
    });
    if (durableSectionExpandButton) {
      await userEvent.click(durableSectionExpandButton);
    }
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

    await openPageTab("장비 관리", "상세 작업");
    await userEvent.click(screen.getByRole("tab", { name: "항목 추가" }));
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

  it("appends retrospective entries from history detail and shows queued learning state", async () => {
    state.history = [createHistoryRecord()];

    render(<App />);

    await openPageTab("캠핑 히스토리", "상세 보기");
    await userEvent.click(screen.getByRole("tab", { name: "후기 작성" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "자유 후기" }),
      "강풍 때문에 방풍 장비가 더 필요했다.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "후기 저장 후 학습 업데이트" }),
    );

    expect(await screen.findByText("후기 저장 완료")).toBeInTheDocument();
    expect(screen.getByText("학습 업데이트 중")).toBeInTheDocument();
    expect(state.history[0].retrospectives).toHaveLength(1);
    expect(state.userLearningStatus.status).toBe("queued");
  });

  it("keeps history save action available in the overview tab", async () => {
    state.history = [createHistoryRecord()];

    render(<App />);

    await openPageTab("캠핑 히스토리", "상세 보기");

    const titleInput = screen.getByRole("textbox", { name: "히스토리 제목" });

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "수정한 히스토리 제목");
    await userEvent.click(screen.getByRole("button", { name: "히스토리 저장" }));

    expect(await screen.findByText("히스토리 저장 완료")).toBeInTheDocument();
    expect(state.history[0]?.title).toBe("수정한 히스토리 제목");
  });

  it("keeps retrospective draft when switching history detail tabs", async () => {
    state.history = [createHistoryRecord()];

    render(<App />);

    await openPageTab("캠핑 히스토리", "상세 보기");
    await userEvent.click(screen.getByRole("tab", { name: "후기 작성" }));

    const freeformInput = screen.getByRole("textbox", { name: "자유 후기" });

    await userEvent.type(freeformInput, "강풍 때문에 팩을 더 챙겨야 했다");
    await userEvent.click(screen.getByRole("tab", { name: "학습" }));
    await userEvent.click(screen.getByRole("tab", { name: "후기 작성" }));

    expect(screen.getByRole("textbox", { name: "자유 후기" })).toHaveValue(
      "강풍 때문에 팩을 더 챙겨야 했다",
    );
  });

  it("saves shared history draft edited across overview and records tabs", async () => {
    state.history = [createHistoryRecord()];

    render(<App />);

    await openPageTab("캠핑 히스토리", "상세 보기");
    const titleInput = screen.getByRole("textbox", { name: "히스토리 제목" });

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "탭 이동 후 저장할 제목");
    await userEvent.click(screen.getByRole("tab", { name: "기록/결과" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "메모" }),
      "방풍 장비 보강 필요",
    );
    await userEvent.click(screen.getByRole("button", { name: "히스토리 저장" }));

    expect(await screen.findByText("히스토리 저장 완료")).toBeInTheDocument();
    expect(state.history[0]?.title).toBe("탭 이동 후 저장할 제목");
    expect(state.history[0]?.notes).toEqual(["방풍 장비 보강 필요"]);
  });

  it("opens the history detail tab immediately after selecting a record from the list tab", async () => {
    state.history = [createHistoryRecord()];

    render(<App />);

    await openPageTab("캠핑 히스토리", "히스토리 목록");
    await userEvent.click(screen.getByRole("button", { name: /3월 양평 주말 캠핑/u }));

    expect(screen.getByRole("tab", { name: "상세 보기" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("textbox", { name: "히스토리 제목" })).toBeInTheDocument();
  });

  it("opens the history list tab first when entering the page from the sidebar", async () => {
    state.history = [createHistoryRecord()];

    render(<App />);

    await openPage("캠핑 히스토리");

    expect(screen.getByRole("tab", { name: "히스토리 목록" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("캠핑 히스토리 목록")).toBeInTheDocument();
  });

  it("opens the retrospective tab after archiving a trip", async () => {
    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");
    await userEvent.click(screen.getByRole("button", { name: "히스토리로 이동" }));

    expect(await screen.findByText("히스토리 아카이브 완료")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "상세 보기" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "후기 작성" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("textbox", { name: "자유 후기" })).toBeInTheDocument();
  });

  it("restores the last opened planning page tab from session storage", async () => {
    window.history.replaceState(null, "", "/planning");
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        activePage: "planning",
        selectedTripId: "2026-04-18-gapyeong",
        selectedHistoryId: null,
        equipmentSection: "durable",
        planningPageTab: "details",
      }),
    );

    render(<App />);

    expect(await screen.findByRole("tab", { name: "AI·결과" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tablist", { name: "계획 상세 보기" })).toBeInTheDocument();
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
        retrospectives: [],
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
    state.outputAvailability["2026-03-08-yangpyeong"] = true;

    render(<App />);

    await openPageTab("캠핑 히스토리", "상세 보기");
    await userEvent.click(screen.getByRole("tab", { name: "기록/결과" }));

    expect(
      await screen.findByText(".camping-data/outputs/2026-03-08-yangpyeong-plan.md"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "결과 열기" }));

    expect(await screen.findByText("양평 히스토리 결과")).toBeInTheDocument();
    expect(screen.getByText("타프와 난방 장비 확인")).toBeInTheDocument();
  });

  it("opens archived output markdown in a wide layer from history detail", async () => {
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
        companion_snapshots: [state.companions[0], state.companions[1]],
        attendee_count: 2,
        vehicle_snapshot: state.vehicles[0],
        notes: ["비 예보가 있어 타프를 추가함"],
        retrospectives: [],
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
    state.outputAvailability["2026-03-08-yangpyeong"] = true;

    render(<App />);

    await openPageTab("캠핑 히스토리", "상세 보기");
    await userEvent.click(screen.getByRole("tab", { name: "기록/결과" }));
    await userEvent.click(await screen.findByRole("button", { name: "결과 열기" }));

    expect(await screen.findByText("양평 히스토리 결과")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "넓게 보기" }));

    const dialog = await screen.findByRole("dialog", {
      name: "3월 양평 주말 캠핑 저장 결과",
    });
    expect(
      within(dialog).getByText(
        "아카이브 당시 저장된 Markdown 결과를 넓은 폭으로 다시 확인하는 보기입니다.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(".camping-data/outputs/2026-03-08-yangpyeong-plan.md"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "결과 레이어 닫기" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "3월 양평 주말 캠핑 저장 결과" }),
      ).toBeNull();
    });
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
        retrospectives: [],
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
        retrospectives: [],
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
    state.outputAvailability["2026-03-08-yangpyeong"] = true;
    state.outputs["2026-04-12-sokcho"] = {
      trip_id: "2026-04-12-sokcho",
      output_path: ".camping-data/outputs/2026-04-12-sokcho-plan.md",
      markdown: "# 속초 결과\n\n- 현재 선택 결과",
    };
    state.outputAvailability["2026-04-12-sokcho"] = true;

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

    await openPageTab("캠핑 히스토리", "상세 보기");
    await userEvent.click(screen.getByRole("tab", { name: "기록/결과" }));
    await userEvent.click(screen.getByRole("button", { name: "결과 열기" }));
    await userEvent.click(screen.getByRole("tab", { name: "히스토리 목록" }));
    await userEvent.click(screen.getByRole("button", { name: /4월 속초 주말 캠핑/u }));
    await userEvent.click(screen.getByRole("tab", { name: "상세 보기" }));

    resolveDelayedOutput?.({
      ok: true,
      status: 200,
      json: async () => state.outputs["2026-03-08-yangpyeong"],
    } as Response);

    await userEvent.click(screen.getByRole("tab", { name: "요약" }));

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
