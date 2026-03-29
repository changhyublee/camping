import { describe, expect, it } from "vitest";
import type { TripBundle } from "@camping/shared";
import { buildAnalysisPrompt } from "../src/services/prompt-builder";

function createBundle(overrides: Partial<TripBundle["trip"]> = {}): TripBundle {
  return {
    profile: {
      version: 1,
      owner: {
        name: "테스터",
      },
      home_region: "seoul",
    },
    companions: {
      version: 1,
      companions: [
        {
          id: "self",
          name: "본인",
          age_group: "adult",
          health_notes: [],
          required_medications: [],
          traits: {},
        },
        {
          id: "child-1",
          name: "아이",
          age_group: "preschooler",
          health_notes: [],
          required_medications: [],
          traits: {},
        },
      ],
    },
    vehicles: {
      version: 1,
      vehicles: [
        {
          id: "family-suv",
          name: "패밀리 SUV",
          description: "주력 가족 차량",
          passenger_capacity: 5,
          load_capacity_kg: 400,
          notes: [],
        },
      ],
    },
    selected_vehicle: {
      id: "family-suv",
      name: "패밀리 SUV",
      description: "주력 가족 차량",
      passenger_capacity: 5,
      load_capacity_kg: 400,
      notes: [],
    },
    durableEquipment: {
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
    travelPreferences: {
      version: 1,
      travel_style: {
        preferred_stop_count: 1,
        max_extra_drive_minutes: 60,
      },
      interests: ["nature"],
      constraints: {
        child_friendly_preferred: true,
      },
    },
    foodPreferences: {
      version: 1,
      favorite_styles: [],
      disliked_ingredients: [],
      allergies: [],
      meal_preferences: {},
      cooking_preferences: {},
    },
    links: {
      version: 1,
      items: [
        {
          id: "weather-kma",
          category: "weather",
          name: "기상청",
          url: "https://www.weather.go.kr",
          notes: "공식 날씨 예보",
          sort_order: 1,
        },
      ],
    },
    userLearningProfile: null,
    trip: {
      version: 1,
      trip_id: "2026-04-18-gapyeong",
      title: "4월 가평 가족 캠핑",
      location: {
        region: "gapyeong",
      },
      departure: {
        region: "seoul",
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
      travel_plan: {
        use_ai_recommendation: true,
        requested_stops: [],
      },
      notes: [],
      ...overrides,
    },
    caches: {
      weather: [],
      places: [],
      campsiteTips: [],
    },
  };
}

describe("buildAnalysisPrompt", () => {
  it("uses the provided reference date when trip dates are missing", () => {
    const prompt = buildAnalysisPrompt({
      bundle: createBundle(),
      analysisPrompt: "# 분석 규칙",
      categories: ["next_camping"],
      referenceDocuments: [],
      warnings: [],
      referenceDate: new Date("2026-03-23T12:00:00.000Z"),
    });

    expect(prompt).toContain("## next-camping-recommendation-context");
    expect(prompt).toContain("reference_date: 2026-03-23");
    expect(prompt).toContain("start: 2026-03-28");
    expect(prompt).toContain("family_friendly_required: true");
    expect(prompt).toContain("name: 기상청");
  });

  it("includes enriched durable equipment metadata in the analysis context", () => {
    const prompt = buildAnalysisPrompt({
      bundle: createBundle({
        notes: [],
      }),
      analysisPrompt: "# 분석 규칙",
      categories: ["equipment"],
      referenceDocuments: [],
      warnings: [],
      referenceDate: new Date("2026-03-23T12:00:00.000Z"),
    });

    const enrichedBundle = createBundle();
    enrichedBundle.durableEquipment.items = [
      {
        id: "tunnel-tent-4p-khaki",
        name: "4인용 터널 텐트 카키",
        model: "A사 패밀리 터널 4P",
        purchase_link: "https://example.com/product",
        category: "shelter",
        quantity: 1,
        status: "ok",
        metadata: {
          lookup_status: "found",
          searched_at: "2026-03-23T12:00:00.000Z",
          query: "4인용 터널 텐트 카키",
          summary: "포장 크기와 설치 시간을 확인함.",
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
            season_notes: ["봄, 여름, 가을 중심"],
            weather_notes: ["우천 시 플라이 확인 필요"],
          },
          sources: [
            {
              title: "A사 패밀리 터널 4P",
              url: "https://example.com/product",
              domain: "example.com",
            },
          ],
        },
      },
    ];

    const enrichedPrompt = buildAnalysisPrompt({
      bundle: enrichedBundle,
      analysisPrompt: "# 분석 규칙",
      categories: ["equipment"],
      referenceDocuments: [],
      warnings: [],
      referenceDate: new Date("2026-03-23T12:00:00.000Z"),
    });

    expect(prompt).not.toContain("purchase_link");
    expect(enrichedPrompt).toContain("purchase_link: https://example.com/product");
    expect(enrichedPrompt).toContain("lookup_status: found");
    expect(enrichedPrompt).toContain("setup_time_minutes: 20");
  });

  it("includes campsite tip research in the analysis context", () => {
    const bundle = createBundle({
      location: {
        campsite_name: "자라섬 캠핑장",
        region: "gapyeong",
      },
    });
    bundle.caches.campsiteTips = [
      {
        name: "2026-04-18-gapyeong-campsite-tips.json",
        content: {
          lookup_status: "found",
          searched_at: "2026-03-26T08:00:00.000Z",
          query: "자라섬 캠핑장 후기 블로그",
          campsite_name: "자라섬 캠핑장",
          region: "gapyeong",
          summary: "그늘과 소음, 장보기 접근성 관련 팁이 반복 확인됨.",
          tip_items: [
            {
              title: "그늘 대비 타프 준비",
              detail: "나무 그늘이 적다는 후기가 반복되어 차광 준비가 유용함.",
              helpful_for: "봄 낮 시간, 아이 동행",
            },
          ],
          best_site_items: [
            {
              site_name: "A4, A7",
              reason: "앞 시야가 트여 경치가 좋고 가로막힘이 적다고 언급됨.",
              helpful_for: "뷰를 중시하는 가족 캠핑",
              caution: "바람을 더 탈 수 있음",
            },
          ],
          sources: [
            {
              title: "자라섬 캠핑장 후기",
              url: "https://example.com/blog-1",
              domain: "example.com",
            },
          ],
        },
      },
    ];

    const prompt = buildAnalysisPrompt({
      bundle,
      analysisPrompt: "# 분석 규칙",
      categories: ["campsite_tips"],
      referenceDocuments: [],
      warnings: [],
      referenceDate: new Date("2026-03-23T12:00:00.000Z"),
    });

    expect(prompt).toContain("cache/campsite-tips/2026-04-18-gapyeong-campsite-tips.json");
    expect(prompt).toContain("그늘 대비 타프 준비");
    expect(prompt).toContain("\"A4, A7\"");
    expect(prompt).toContain("자라섬 캠핑장");
  });
});
