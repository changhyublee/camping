import type { CollectTripWeatherResponse } from "@camping/shared";
import type { ApiResponse, MockState } from "./mock-state";

export function isTripWeatherCollectionPath(pathname: string) {
  return pathname === "/api/trips/weather/collect";
}

export function handleTripWeatherCollectionRequest(input: {
  init?: RequestInit;
  jsonResponse: (body: unknown, status?: number) => Promise<Response>;
  state: MockState;
}) {
  const { init, jsonResponse, state } = input;
  const body =
    init?.body && typeof init.body === "string"
      ? (JSON.parse(init.body) as {
          region?: string;
          campsite_name?: string;
          start_date?: string;
          end_date?: string;
        })
      : {};

  state.collectTripWeatherCalls.push({
    body: {
      region: body.region ?? "",
      campsite_name: body.campsite_name,
      start_date: body.start_date,
      end_date: body.end_date,
    },
  });

  const response =
    state.tripWeatherResponse ??
    ({
      body: createTripWeatherCollectionResponse(body),
    } satisfies ApiResponse<CollectTripWeatherResponse>);

  return jsonResponse(response.body, response.status ?? 200);
}

function createTripWeatherCollectionResponse(body: {
  region?: string;
  campsite_name?: string;
  start_date?: string;
  end_date?: string;
}): CollectTripWeatherResponse {
  return {
    item: {
      lookup_status: "found",
      searched_at: "2026-04-10T08:00:00.000Z",
      query: [body.region, body.campsite_name, body.start_date, body.end_date, "날씨"]
        .filter(Boolean)
        .join(" "),
      region: body.region ?? "gapyeong",
      campsite_name: body.campsite_name,
      start_date: body.start_date,
      end_date: body.end_date,
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
    expected_weather: {
      source: "google-search-ai",
      summary: "흐리고 오후 한때 비 가능성",
      min_temp_c: 11,
      max_temp_c: 18,
      precipitation: "토요일 오후 한때 비 예보",
    },
  };
}
