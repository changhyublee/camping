import type { TripDraft } from "@camping/shared";
import { apiClient } from "../api/client";
import { hasMeaningfulExpectedWeather } from "./planning-weather-actions";

export async function mergeLatestExpectedWeatherIntoDraft(
  tripId: string,
  draft: TripDraft,
  expectedWeatherEditedSinceLoad: boolean,
): Promise<TripDraft> {
  if (
    !tripId ||
    expectedWeatherEditedSinceLoad ||
    hasMeaningfulExpectedWeather(draft.conditions?.expected_weather)
  ) {
    return draft;
  }

  try {
    const latestTrip = await apiClient.getTrip(tripId);

    if (!hasMeaningfulExpectedWeather(latestTrip.data.conditions?.expected_weather)) {
      return draft;
    }

    return {
      ...draft,
      conditions: {
        ...draft.conditions,
        expected_weather: latestTrip.data.conditions?.expected_weather,
      },
    };
  } catch {
    return draft;
  }
}
