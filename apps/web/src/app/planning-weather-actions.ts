import type { Dispatch, SetStateAction } from "react";
import type { TripDraft, TripExpectedWeather } from "@camping/shared";
import { apiClient } from "../api/client";
import type { OperationState } from "./view-model-types";

type CollectTripWeatherIntoDraftInput = {
  setCollectingTripWeather: Dispatch<SetStateAction<boolean>>;
  setExpectedWeatherEditedSinceLoad: Dispatch<SetStateAction<boolean>>;
  setOperationState: Dispatch<SetStateAction<OperationState | null>>;
  setTripDraft: Dispatch<SetStateAction<TripDraft | null>>;
  tripDraft: TripDraft;
};

export function hasMeaningfulExpectedWeather(
  expectedWeather?: TripExpectedWeather,
) {
  return Boolean(
    expectedWeather?.summary?.trim() ||
      expectedWeather?.precipitation?.trim() ||
      typeof expectedWeather?.min_temp_c === "number" ||
      typeof expectedWeather?.max_temp_c === "number",
  );
}

export function canCollectTripWeatherFromDraft(draft?: TripDraft | null) {
  return Boolean(draft?.location?.region?.trim() && (draft.date?.start || draft.date?.end));
}

export async function collectTripWeatherIntoDraft(
  input: CollectTripWeatherIntoDraftInput,
) {
  if (!canCollectTripWeatherFromDraft(input.tripDraft)) {
    input.setOperationState({
      title: "날씨 수집 조건 부족",
      tone: "warning",
      description: "지역과 시작일 또는 종료일을 먼저 입력해야 날씨를 수집할 수 있습니다.",
    });
    return;
  }

  input.setCollectingTripWeather(true);
  input.setOperationState(null);

  try {
    const response = await apiClient.collectTripWeather({
      region: input.tripDraft.location?.region?.trim() ?? "",
      campsite_name: input.tripDraft.location?.campsite_name?.trim(),
      start_date: input.tripDraft.date?.start,
      end_date: input.tripDraft.date?.end,
    });

    input.setTripDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        conditions: {
          ...current.conditions,
          expected_weather: hasMeaningfulExpectedWeather(response.expected_weather)
            ? response.expected_weather
            : current.conditions?.expected_weather,
        },
      };
    });
    input.setExpectedWeatherEditedSinceLoad(false);

    const descriptionBase =
      response.item.lookup_status === "found"
        ? "Google 검색 결과를 분석해 날씨 입력란을 채웠습니다. 저장하면 계획 파일에 반영됩니다."
        : "Google 검색 결과에서 신뢰할 만한 날씨를 충분히 읽지 못했습니다. 필요하면 직접 보완하세요.";

    input.setOperationState({
      title:
        response.item.lookup_status === "found"
          ? "날씨 수집 완료"
          : "날씨 수집 확인 필요",
      tone: response.item.lookup_status === "found" ? "success" : "warning",
      description: descriptionBase,
      items: response.item.notes.length > 0 ? response.item.notes : undefined,
    });
  } catch (error) {
    input.setOperationState({
      title: "날씨 수집 실패",
      tone: "error",
      description:
        error instanceof Error ? error.message : "날씨 수집 요청에 실패했습니다.",
    });
  } finally {
    input.setCollectingTripWeather(false);
  }
}
