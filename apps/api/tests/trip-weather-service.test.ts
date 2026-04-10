import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenMeteoTripWeatherClient,
  type TripWeatherCollectionInput,
} from "../src/services/trip-weather-service";

describe("OpenMeteoTripWeatherClient", () => {
  it("collects structured weather from Open-Meteo geocoding and forecast responses", async () => {
    const client = new OpenMeteoTripWeatherClient(createMockFetch((url) => {
      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        return jsonResponse({
          results: [
            {
              name: "Gapyeong",
              latitude: 37.8315,
              longitude: 127.5097,
              timezone: "Asia/Seoul",
              admin1: "Gyeonggi-do",
              country: "South Korea",
            },
          ],
        });
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        return jsonResponse({
          latitude: 37.8315,
          longitude: 127.5097,
          timezone: "Asia/Seoul",
          timezone_abbreviation: "KST",
          daily: {
            time: ["2026-04-18", "2026-04-19"],
            weather_code: [3, 61],
            temperature_2m_min: [11, 12],
            temperature_2m_max: [18, 17],
            precipitation_probability_max: [25, 70],
            precipitation_sum: [0.2, 5.1],
          },
        });
      }

      throw new Error(`unexpected url: ${url}`);
    }));

    const result = await client.collectTripWeather({
      region: "gapyeong",
      campsiteName: "자라섬 캠핑장",
      startDate: "2026-04-18",
      endDate: "2026-04-19",
    });

    expect(result).toEqual(
      expect.objectContaining({
        lookup_status: "found",
        region: "gapyeong",
        campsite_name: "자라섬 캠핑장",
        source: "open-meteo",
        summary: "비 예상입니다.",
        min_temp_c: 11,
        max_temp_c: 18,
        lookup_url: expect.stringContaining("https://api.open-meteo.com/v1/forecast"),
        precipitation: expect.stringContaining("70%"),
        search_result_excerpt: expect.stringContaining("최저 11°C / 최고 18°C"),
      }),
    );
    expect(result.sources).toEqual([
      expect.objectContaining({
        title: "Open-Meteo Geocoding API",
        domain: "geocoding-api.open-meteo.com",
      }),
      expect.objectContaining({
        title: "Open-Meteo Forecast API",
        domain: "api.open-meteo.com",
      }),
    ]);
    expect(result.notes).toContain(
      "기간 전체 일별 예보를 합쳐 최저/최고 기온과 최대 강수 확률을 요약했습니다.",
    );
  });

  it("returns not_found when the region cannot be geocoded", async () => {
    const client = new OpenMeteoTripWeatherClient(
      createMockFetch((url) => {
        if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
          return jsonResponse({});
        }

        throw new Error(`unexpected url: ${url}`);
      }),
    );

    const result = await client.collectTripWeather({
      region: "없는지역",
      startDate: "2026-04-18",
      endDate: "2026-04-19",
    });

    expect(result.lookup_status).toBe("not_found");
    expect(result.summary).toBeUndefined();
    expect(result.source).toBe("open-meteo");
    expect(result.notes[0]).toContain("좌표를 찾지 못했습니다");
  });

  it("falls back to campsite name only when the combined geocoding query does not resolve", async () => {
    const geocodingCalls: string[] = [];
    const client = new OpenMeteoTripWeatherClient(createMockFetch((url) => {
      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        geocodingCalls.push(url);
        const queryName = new URL(url).searchParams.get("name");

        if (queryName === "자라섬 캠핑장 gapyeong") {
          return jsonResponse({});
        }

        if (queryName === "자라섬 캠핑장") {
          return jsonResponse({
            results: [
              {
                name: "자라섬 캠핑장",
                latitude: 37.822,
                longitude: 127.521,
              },
            ],
          });
        }

        throw new Error(`unexpected geocoding query: ${url}`);
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        return jsonResponse({
          daily: {
            time: ["2026-04-18"],
            weather_code: [1],
            temperature_2m_min: [10],
            temperature_2m_max: [19],
            precipitation_probability_max: [20],
            precipitation_sum: [0],
          },
        });
      }

      throw new Error(`unexpected url: ${url}`);
    }));

    const result = await client.collectTripWeather({
      region: "gapyeong",
      campsiteName: "자라섬 캠핑장",
      startDate: "2026-04-18",
      endDate: "2026-04-18",
    });

    expect(result.lookup_status).toBe("found");
    expect(geocodingCalls).toEqual([
      expect.stringContaining("name=%EC%9E%90%EB%9D%BC%EC%84%AC+%EC%BA%A0%ED%95%91%EC%9E%A5+gapyeong"),
      expect.stringContaining("name=%EC%9E%90%EB%9D%BC%EC%84%AC+%EC%BA%A0%ED%95%91%EC%9E%A5"),
    ]);
  });

  it("returns not_found when the requested date is outside the forecast window", async () => {
    const client = new OpenMeteoTripWeatherClient(
      createMockFetch(() => {
        throw new Error("forecast window check should short-circuit before fetching");
      }),
    );

    const futureRange = createFarFutureInput();
    const result = await client.collectTripWeather(futureRange);

    expect(result.lookup_status).toBe("not_found");
    expect(result.source).toBe("open-meteo");
    expect(result.notes[0]).toContain("최대 16일");
  });

  it("uses the local calendar day instead of UTC when checking the forecast window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T16:30:00.000Z"));

    const client = new OpenMeteoTripWeatherClient(createMockFetch((url) => {
      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        return jsonResponse({
          results: [
            {
              name: "Gapyeong",
              latitude: 37.8315,
              longitude: 127.5097,
            },
          ],
        });
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        return jsonResponse({
          daily: {
            time: ["2026-04-11"],
            weather_code: [1],
            temperature_2m_min: [9],
            temperature_2m_max: [17],
            precipitation_probability_max: [10],
            precipitation_sum: [0],
          },
        });
      }

      throw new Error(`unexpected url: ${url}`);
    }));

    const result = await client.collectTripWeather({
      region: "gapyeong",
      startDate: "2026-04-11",
      endDate: "2026-04-11",
    });

    expect(result.lookup_status).toBe("found");
  });

  it("clips already-past days and still collects the remaining forecast range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T16:30:00.000Z"));
    let requestedForecastUrl = "";

    const client = new OpenMeteoTripWeatherClient(createMockFetch((url) => {
      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        return jsonResponse({
          results: [
            {
              name: "Gapyeong",
              latitude: 37.8315,
              longitude: 127.5097,
            },
          ],
        });
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        requestedForecastUrl = url;
        return jsonResponse({
          daily: {
            time: ["2026-04-11", "2026-04-12"],
            weather_code: [1, 3],
            temperature_2m_min: [9, 11],
            temperature_2m_max: [17, 18],
            precipitation_probability_max: [10, 35],
            precipitation_sum: [0, 1.2],
          },
        });
      }

      throw new Error(`unexpected url: ${url}`);
    }));

    const result = await client.collectTripWeather({
      region: "gapyeong",
      startDate: "2026-04-10",
      endDate: "2026-04-12",
    });

    expect(result.lookup_status).toBe("found");
    expect(requestedForecastUrl).toContain("start_date=2026-04-11");
    expect(requestedForecastUrl).toContain("end_date=2026-04-12");
    expect(result.notes).toContain(
      "요청 기간 중 지난 날짜(2026-04-10~2026-04-10)는 예보 범위를 벗어나 제외했습니다.",
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function createMockFetch(resolver: (url: string) => Response | Promise<Response>) {
  return async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    return resolver(url);
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createFarFutureInput(): TripWeatherCollectionInput {
  const target = new Date();
  target.setUTCDate(target.getUTCDate() + 30);
  const isoDate = target.toISOString().slice(0, 10);

  return {
    region: "gapyeong",
    startDate: isoDate,
    endDate: isoDate,
  };
}
