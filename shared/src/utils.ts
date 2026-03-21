import type { TripData, TripId, TripSummary } from "./types";
import { TRIP_ID_REGEX } from "./constants";

export function isTripId(value: string): value is TripId {
  return TRIP_ID_REGEX.test(value);
}

export function getTripOutputFilename(tripId: TripId): string {
  return `${tripId}-plan.md`;
}

export function getTripOutputRelativePath(tripId: TripId): string {
  return `.camping-data/outputs/${getTripOutputFilename(tripId)}`;
}

export function toTripSummary(trip: TripData): TripSummary {
  return {
    trip_id: trip.trip_id,
    title: trip.title,
    start_date: trip.date?.start,
    end_date: trip.date?.end,
    region: trip.location?.region,
  };
}
