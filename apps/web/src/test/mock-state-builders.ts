import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  TRIP_ANALYSIS_CATEGORY_METADATA,
} from "@camping/shared";
import type {
  AnalyzeTripResponse,
  TripData,
  TripSummary,
  UserLearningJobStatusResponse,
} from "@camping/shared";

export function summarizeTrip(trip: TripData): TripSummary {
  return {
    trip_id: trip.trip_id,
    title: trip.title,
    start_date: trip.date?.start,
    end_date: trip.date?.end,
    region: trip.location?.region,
    companion_count: trip.party.companion_ids.length,
  };
}

export function createAnalysisResponse(
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

export function createUserLearningStatus(
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
