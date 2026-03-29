import type {
  AnalyzeTripResponse,
  Companion,
  ExternalLink,
  HistoryRecord,
  TripDraft,
  TripAnalysisCategoryStatusResponse,
  UserLearningJobStatusResponse,
  Vehicle,
} from "@camping/shared";
import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  TRIP_ANALYSIS_CATEGORY_METADATA,
  TRIP_ANALYSIS_STATUS_LABELS,
} from "@camping/shared";
import { createPlaceholderCompanion } from "./view-model-drafts";

export function getMissingCompanionIds(
  companionIds: string[],
  knownCompanionIds: string[],
) {
  const knownIds = new Set(knownCompanionIds);
  return [...new Set(companionIds.filter((item) => item && !knownIds.has(item)))];
}

export function toggleSelectionId(currentIds: string[], targetId: string) {
  return currentIds.includes(targetId)
    ? currentIds.filter((item) => item !== targetId)
    : [...currentIds, targetId];
}

export function resolveSelectedCompanions(
  companionIds: string[],
  companions: Companion[],
) {
  const companionMap = new Map(companions.map((item) => [item.id, item]));

  return companionIds.map(
    (companionId) =>
      companionMap.get(companionId) ?? createPlaceholderCompanion(companionId),
  );
}

export function sortVehicles(left: Vehicle, right: Vehicle) {
  return left.name.localeCompare(right.name, "ko");
}

export function buildVehicleOptions(
  vehicles: Vehicle[],
  currentVehicle?: TripDraft["vehicle"],
) {
  const merged = [...vehicles];

  if (
    currentVehicle?.id &&
    !merged.some((vehicle) => vehicle.id === currentVehicle.id)
  ) {
    merged.push({
      id: currentVehicle.id,
      name: currentVehicle.name ?? currentVehicle.id,
      description: currentVehicle.description,
      passenger_capacity: currentVehicle.passenger_capacity,
      load_capacity_kg: currentVehicle.load_capacity_kg,
      notes: currentVehicle.notes ?? [],
    });
  }

  return merged.sort(sortVehicles);
}

export function buildTripVehicleSelection(
  vehicleId: string,
  vehicles: Vehicle[],
  currentVehicle?: TripDraft["vehicle"],
): TripDraft["vehicle"] {
  if (!vehicleId) {
    return undefined;
  }

  const matchedVehicle = buildVehicleOptions(vehicles, currentVehicle).find(
    (vehicle) => vehicle.id === vehicleId,
  );

  if (!matchedVehicle) {
    return currentVehicle?.id === vehicleId ? currentVehicle : { id: vehicleId };
  }

  return {
    id: matchedVehicle.id,
    name: matchedVehicle.name,
    description: matchedVehicle.description,
    passenger_capacity: matchedVehicle.passenger_capacity,
    load_capacity_kg: matchedVehicle.load_capacity_kg,
    notes: [...matchedVehicle.notes],
  };
}

export function resolveSelectedVehicle(
  tripVehicle: TripDraft["vehicle"],
  vehicles: Vehicle[],
): Vehicle | null {
  if (!tripVehicle) {
    return null;
  }

  const matchedVehicle = tripVehicle.id
    ? vehicles.find((vehicle) => vehicle.id === tripVehicle.id) ?? null
    : null;

  if (!matchedVehicle && !tripVehicle.id && !tripVehicle.name) {
    return null;
  }

  return {
    id: tripVehicle.id ?? matchedVehicle?.id ?? "vehicle-snapshot",
    name: tripVehicle.name ?? matchedVehicle?.name ?? tripVehicle.id ?? "차량",
    description: tripVehicle.description ?? matchedVehicle?.description,
    passenger_capacity:
      tripVehicle.passenger_capacity ?? matchedVehicle?.passenger_capacity,
    load_capacity_kg:
      tripVehicle.load_capacity_kg ?? matchedVehicle?.load_capacity_kg,
    notes:
      tripVehicle.notes && tripVehicle.notes.length > 0
        ? tripVehicle.notes
        : matchedVehicle?.notes ?? [],
  };
}

export function resolveHistoryCompanionSnapshots(
  history: HistoryRecord,
  companions: Companion[],
) {
  if (history.companion_snapshots.length > 0) {
    return history.companion_snapshots;
  }

  return resolveSelectedCompanions(history.companion_ids, companions);
}

export function resolveHistoryVehicleSnapshot(
  history: HistoryRecord | null,
  vehicles: Vehicle[],
) {
  if (!history) {
    return null;
  }

  if (history.vehicle_snapshot) {
    return resolveSelectedVehicle(history.vehicle_snapshot, vehicles);
  }

  return resolveSelectedVehicle(history.trip_snapshot.vehicle, vehicles);
}

export function sortCompanions(left: Companion, right: Companion) {
  return left.name.localeCompare(right.name, "ko");
}

export function sortLinks(left: ExternalLink, right: ExternalLink) {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.name.localeCompare(right.name, "ko");
}

export function createIdleAnalysisCategoryStatuses(): TripAnalysisCategoryStatusResponse[] {
  return ALL_TRIP_ANALYSIS_CATEGORIES.map((category) => ({
    category,
    label: TRIP_ANALYSIS_CATEGORY_METADATA[category].label,
    sections: TRIP_ANALYSIS_CATEGORY_METADATA[category].sections,
    status: "idle",
    has_result: false,
    requested_at: null,
    started_at: null,
    finished_at: null,
    collected_at: null,
  }));
}

export function createIdleAnalysisStatus(tripId: string): AnalyzeTripResponse {
  return {
    trip_id: tripId,
    status: "idle",
    requested_at: null,
    started_at: null,
    finished_at: null,
    output_path: null,
    categories: createIdleAnalysisCategoryStatuses(),
    completed_category_count: 0,
    total_category_count: ALL_TRIP_ANALYSIS_CATEGORIES.length,
  };
}

export function isPendingAnalysisStatus(status?: AnalyzeTripResponse["status"] | null) {
  return status === "queued" || status === "running";
}

export function isPendingUserLearningStatus(
  status?: UserLearningJobStatusResponse["status"] | null,
) {
  return status === "queued" || status === "running";
}

export function getAiJobRealtimeReconnectDelay(attemptCount: number) {
  if (attemptCount <= 0) {
    return 1000;
  }

  if (attemptCount === 1) {
    return 3000;
  }

  return 5000;
}

export function getTripAnalysisStatusLabel(status: AnalyzeTripResponse["status"]) {
  return TRIP_ANALYSIS_STATUS_LABELS[status] ?? status;
}
