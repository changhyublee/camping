import type {
  EquipmentCategoriesData,
  EquipmentCategory,
  HistoryRecord,
  TripData,
  TripId,
  TripSummary,
} from "./types";
import { DEFAULT_EQUIPMENT_CATEGORIES, TRIP_ID_REGEX } from "./constants";

export function isTripId(value: string): value is TripId {
  return TRIP_ID_REGEX.test(value);
}

export function getTripOutputFilename(tripId: TripId): string {
  return `${tripId}-plan.md`;
}

export function getTripOutputRelativePath(tripId: TripId): string {
  return `.camping-data/outputs/${getTripOutputFilename(tripId)}`;
}

export function getHistoryFilename(historyId: string): string {
  return `${historyId}.yaml`;
}

export function getHistoryRelativePath(historyId: string): string {
  return `.camping-data/history/${getHistoryFilename(historyId)}`;
}

export function toTripSummary(trip: TripData): TripSummary {
  return {
    trip_id: trip.trip_id,
    title: trip.title,
    start_date: trip.date?.start,
    end_date: trip.date?.end,
    region: trip.location?.region,
    companion_count: trip.party.companion_ids.length,
  };
}

export function toHistorySummary(history: HistoryRecord) {
  return {
    history_id: history.history_id,
    title: history.title,
    start_date: history.date?.start,
    end_date: history.date?.end,
    region: history.location?.region,
    attendee_count: history.attendee_count ?? history.companion_ids.length,
  };
}

export function buildKebabId(
  prefix: string,
  parts: Array<string | undefined | null>,
): string {
  const normalized = parts
    .flatMap((part) => normalizeIdPart(part).split("-"))
    .filter(Boolean);

  const base = normalized.join("-");
  return base ? `${prefix}-${base}`.replace(/^trip-trip-/, "trip-") : prefix;
}

function normalizeIdPart(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function cloneEquipmentCategories(): EquipmentCategoriesData {
  return {
    version: DEFAULT_EQUIPMENT_CATEGORIES.version,
    durable: DEFAULT_EQUIPMENT_CATEGORIES.durable.map(cloneEquipmentCategory),
    consumables: DEFAULT_EQUIPMENT_CATEGORIES.consumables.map(
      cloneEquipmentCategory,
    ),
    precheck: DEFAULT_EQUIPMENT_CATEGORIES.precheck.map(cloneEquipmentCategory),
  };
}

export function humanizeEquipmentCategoryId(categoryId: string): string {
  return categoryId
    .split(/[-_]/)
    .filter(Boolean)
    .join(" ");
}

function cloneEquipmentCategory(category: EquipmentCategory): EquipmentCategory {
  return {
    id: category.id,
    label: category.label,
    sort_order: category.sort_order,
  };
}
