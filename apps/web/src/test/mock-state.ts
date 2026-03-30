import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  TRIP_ANALYSIS_CATEGORY_METADATA,
} from "@camping/shared";
import type {
  AnalyzeTripResponse,
  Companion,
  DataBackupSnapshot,
  EquipmentCatalog,
  EquipmentCategoriesData,
  GetOutputResponse,
  HistoryLearningInsight,
  RefreshDurableEquipmentMetadataResponse,
  TripData,
  TripSummary,
  UserLearningJobStatusResponse,
  UserLearningProfile,
  ValidateTripResponse,
  Vehicle,
} from "@camping/shared";

export type ApiResponse<T> = {
  body: T;
  status?: number;
};

type MetadataStatusSequenceEntry =
  | ApiResponse<RefreshDurableEquipmentMetadataResponse>
  | null;

type FailedValidationResponse = {
  status: "failed";
  warnings: string[];
  error: {
    code: string;
    message: string;
  };
};

export type MockState = {
  companions: Companion[];
  vehicles: Vehicle[];
  trips: TripSummary[];
  tripDetails: Record<string, TripData>;
  validations: Record<
    string,
    ApiResponse<ValidateTripResponse | FailedValidationResponse>
  >;
  analysis: ApiResponse<AnalyzeTripResponse>;
  analysisStatuses: Record<
    string,
    ApiResponse<AnalyzeTripResponse> | ApiResponse<AnalyzeTripResponse>[]
  >;
  equipment: EquipmentCatalog;
  equipmentCategories: EquipmentCategoriesData;
  history: import("@camping/shared").HistoryRecord[];
  historyLearning: Record<string, HistoryLearningInsight | null>;
  userLearningProfile: UserLearningProfile | null;
  userLearningStatus: UserLearningJobStatusResponse;
  links: Array<{
    id: string;
    category: "weather" | "place" | "food" | "shopping" | "general";
    name: string;
    url: string;
    notes?: string;
    sort_order: number;
  }>;
  outputs: Record<string, GetOutputResponse>;
  outputAvailability: Record<string, boolean>;
  updateTripCalls: Array<{
    tripId: string;
    body: TripData;
  }>;
  dataBackups: DataBackupSnapshot[];
  metadataStatuses: Record<
    string,
    MetadataStatusSequenceEntry | MetadataStatusSequenceEntry[]
  >;
};

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

function createAnalysisResponse(
  tripId: string,
  overrides: Partial<AnalyzeTripResponse> = {},
): AnalyzeTripResponse {
  const categories = ALL_TRIP_ANALYSIS_CATEGORIES.map((category) => ({
    category,
    label: TRIP_ANALYSIS_CATEGORY_METADATA[category].label,
    sections: TRIP_ANALYSIS_CATEGORY_METADATA[category].sections,
    status: "idle" as const,
    has_result: false,
    requested_at: null,
    started_at: null,
    finished_at: null,
    collected_at: null,
  }));

  return {
    trip_id: tripId,
    status: "idle",
    requested_at: null,
    started_at: null,
    finished_at: null,
    output_path: null,
    categories,
    completed_category_count: 0,
    total_category_count: ALL_TRIP_ANALYSIS_CATEGORIES.length,
    ...overrides,
  };
}

function createUserLearningStatus(
  overrides: Partial<UserLearningJobStatusResponse> = {},
): UserLearningJobStatusResponse {
  return {
    status: "idle",
    trigger_history_id: null,
    source_history_ids: [],
    source_entry_count: 0,
    requested_at: null,
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

export function createMockState(): MockState {
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
      body: createAnalysisResponse("2026-04-18-gapyeong", {
        status: "completed",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: "2026-03-24T10:00:10.000Z",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      }),
    },
    analysisStatuses: {
      [trip.trip_id]: {
        body: createAnalysisResponse(trip.trip_id),
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
    historyLearning: {},
    userLearningProfile: null,
    userLearningStatus: createUserLearningStatus(),
    links: [],
    outputs: {
      [trip.trip_id]: {
        trip_id: trip.trip_id,
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        markdown: "# 4월 가평 가족 캠핑 분석 결과\n\n## 1. 요약\n\n- 테스트 결과",
      },
    },
    outputAvailability: {},
    updateTripCalls: [],
    dataBackups: [],
    metadataStatuses: {},
  };
}
