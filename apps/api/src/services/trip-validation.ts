import type { TripBundle } from "@camping/shared";
import { AppError } from "./app-error";

export type ValidationResult = {
  warnings: string[];
};

export function validateTripBundle(bundle: TripBundle): ValidationResult {
  const warnings: string[] = [];
  const { trip, companions, caches } = bundle;

  const hasDate = Boolean(trip.date?.start || trip.date?.end);
  const hasLocation = Boolean(
    trip.location?.campsite_name ||
      trip.location?.region ||
      trip.location?.coordinates,
  );

  if (!hasDate && !hasLocation) {
    throw new AppError(
      "TRIP_INVALID",
      "날짜와 장소가 모두 비어 있어 분석을 진행할 수 없습니다.",
      400,
    );
  }

  if (trip.party.companion_ids.length === 0) {
    throw new AppError(
      "TRIP_INVALID",
      "동행자 정보가 비어 있어 분석을 진행할 수 없습니다.",
      400,
    );
  }

  const knownCompanionIds = new Set(
    companions.companions.map((companion) => companion.id),
  );
  const missingCompanionIds = trip.party.companion_ids.filter(
    (id) => !knownCompanionIds.has(id),
  );

  if (missingCompanionIds.length > 0) {
    throw new AppError(
      "TRIP_INVALID",
      `등록되지 않은 동행자 ID가 있습니다: ${missingCompanionIds.join(", ")}`,
      400,
    );
  }

  if (!hasDate) {
    warnings.push(
      "날짜 정보가 없어 계절성과 기온 기반 판단 정확도가 제한될 수 있습니다.",
    );
  }

  if (!hasLocation) {
    warnings.push(
      "장소 정보가 없어 지역 특화 추천과 주변 추천 정확도가 제한될 수 있습니다.",
    );
  }

  if (!trip.conditions?.expected_weather) {
    warnings.push(
      "예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다.",
    );
  }

  if (!trip.vehicle?.load_capacity_kg) {
    warnings.push(
      "차량 적재량 정보가 없어 적재 최적화 판단이 제한될 수 있습니다.",
    );
  }

  if (
    !trip.meal_plan?.use_ai_recommendation &&
    (trip.meal_plan?.requested_dishes.length ?? 0) === 0
  ) {
    warnings.push(
      "식단 계획 정보가 부족해 메뉴 추천이 넓게 제안될 수 있습니다.",
    );
  }

  if (
    !trip.travel_plan?.use_ai_recommendation &&
    (trip.travel_plan?.requested_stops.length ?? 0) === 0 &&
    caches.places.length === 0
  ) {
    warnings.push(
      "이동/주변 추천에 활용할 장소 정보가 적어 일반 제안 위주로 응답할 수 있습니다.",
    );
  }

  return { warnings };
}
