import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CollectTripWeatherResponse } from "@camping/shared";
import { App } from "./App";
import { openPageTab, state } from "./test/app-test-helpers";

describe("App trip weather collection", () => {
  it("collects weather into the planning draft from the manual collect button", async () => {
    state.tripDetails["2026-04-18-gapyeong"].conditions = {
      electricity_available: true,
      cooking_allowed: true,
      expected_weather: {
        source: "manual",
      },
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    await userEvent.click(screen.getByRole("button", { name: "수집" }));

    expect(state.collectTripWeatherCalls).toEqual([
      {
        body: {
          region: "gapyeong",
          campsite_name: "자라섬 캠핑장",
          start_date: "2026-04-18",
          end_date: "2026-04-19",
        },
      },
    ]);
    expect(
      await screen.findByDisplayValue("흐리고 오후 한때 비 가능성"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Google 검색 결과를 분석해 날씨 입력란을 채웠습니다. 저장하면 계획 파일에 반영됩니다."),
    ).toBeInTheDocument();
  });

  it("replaces stale weather fields when manual collection returns a narrower result", async () => {
    state.tripDetails["2026-04-18-gapyeong"].conditions = {
      electricity_available: true,
      cooking_allowed: true,
      expected_weather: {
        source: "manual",
        summary: "이전 요약",
        precipitation: "이전 강수 정보",
      },
    };
    state.tripWeatherResponse = {
      body: {
        item: {
          lookup_status: "found",
          searched_at: "2026-04-10T08:00:00.000Z",
          query: "gapyeong 2026-04-18 날씨",
          region: "gapyeong",
          start_date: "2026-04-18",
          summary: "맑고 건조함",
          search_result_excerpt: "Google 검색 결과에 맑음으로 표시됨",
          source: "google-search-ai",
          google_search_url: "https://www.google.com/search?q=gapyeong%20weather",
          notes: [],
          sources: [
            {
              title: "Google 검색 결과",
              url: "https://www.google.com/search?q=gapyeong%20weather",
              domain: "www.google.com",
            },
          ],
        },
        expected_weather: {
          source: "google-search-ai",
          summary: "맑고 건조함",
        },
      } satisfies CollectTripWeatherResponse,
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");
    await userEvent.click(screen.getByRole("button", { name: "수집" }));

    expect(await screen.findByDisplayValue("맑고 건조함")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("이전 강수 정보")).not.toBeInTheDocument();
  });

  it("keeps the current weather input when collection cannot find usable weather details", async () => {
    state.tripDetails["2026-04-18-gapyeong"].conditions = {
      electricity_available: true,
      cooking_allowed: true,
      expected_weather: {
        source: "manual",
        summary: "직접 입력한 날씨",
        precipitation: "수동 강수 메모",
      },
    };
    state.tripWeatherResponse = {
      body: {
        item: {
          lookup_status: "not_found",
          searched_at: "2026-04-10T08:10:00.000Z",
          query: "gapyeong 2026-04-18 날씨",
          region: "gapyeong",
          start_date: "2026-04-18",
          source: "google-search-ai",
          google_search_url: "https://www.google.com/search?q=gapyeong%20weather",
          notes: ["검색 결과에서 신뢰할 만한 날씨를 읽지 못함"],
          sources: [
            {
              title: "Google 검색 결과",
              url: "https://www.google.com/search?q=gapyeong%20weather",
              domain: "www.google.com",
            },
          ],
        },
        expected_weather: {
          source: "google-search-ai",
        },
      } satisfies CollectTripWeatherResponse,
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");
    await userEvent.click(screen.getByRole("button", { name: "수집" }));

    expect(await screen.findByDisplayValue("직접 입력한 날씨")).toBeInTheDocument();
    expect(screen.getByDisplayValue("수동 강수 메모")).toBeInTheDocument();
  });

  it("announces background weather collection after saving a trip without weather", async () => {
    state.tripDetails["2026-04-18-gapyeong"].conditions = {
      electricity_available: true,
      cooking_allowed: true,
      expected_weather: {
        source: "manual",
      },
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    expect(
      await screen.findByText((content) =>
        content.includes(
          "날씨 입력이 비어 있어 Google 검색 기반 자동 수집을 백그라운드에서 시작했습니다.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("preserves server-collected weather on a later save when the local draft is still empty", async () => {
    state.tripDetails["2026-04-18-gapyeong"] = {
      ...state.tripDetails["2026-04-18-gapyeong"],
      conditions: {
        electricity_available: true,
        cooking_allowed: true,
        expected_weather: {
          source: "manual",
        },
      },
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    state.tripDetails["2026-04-18-gapyeong"] = {
      ...state.tripDetails["2026-04-18-gapyeong"],
      conditions: {
        electricity_available: true,
        cooking_allowed: true,
        expected_weather: {
          source: "google-search-ai",
          summary: "서버에만 저장된 자동 수집 날씨",
          precipitation: "새벽 약한 비 가능성",
        },
      },
    };

    await userEvent.clear(screen.getByLabelText("계획 제목"));
    await userEvent.type(screen.getByLabelText("계획 제목"), "수정된 제목");
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    expect(state.updateTripCalls.at(-1)?.body.conditions?.expected_weather).toEqual({
      source: "google-search-ai",
      summary: "서버에만 저장된 자동 수집 날씨",
      precipitation: "새벽 약한 비 가능성",
    });
  });

  it("allows intentionally cleared weather inputs to save without restoring the old server weather", async () => {
    state.tripDetails["2026-04-18-gapyeong"] = {
      ...state.tripDetails["2026-04-18-gapyeong"],
      conditions: {
        electricity_available: true,
        cooking_allowed: true,
        expected_weather: {
          source: "google-search-ai",
          summary: "이전 자동 수집 날씨",
          precipitation: "이전 강수 정보",
        },
      },
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");
    await userEvent.clear(screen.getByLabelText("날씨 요약"));
    await userEvent.clear(screen.getByLabelText("강수 정보"));
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    expect(state.updateTripCalls.at(-1)?.body.conditions?.expected_weather).toEqual({
      source: "google-search-ai",
    });
  });
});
