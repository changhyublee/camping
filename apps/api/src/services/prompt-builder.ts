import { stringify } from "yaml";
import type { TripBundle } from "@camping/shared";

type PromptDocument = {
  name: string;
  content: string;
};

type SeasonId = "spring" | "summer" | "autumn" | "winter";

type BuildPromptInput = {
  bundle: TripBundle;
  analysisPrompt: string;
  referenceDocuments: PromptDocument[];
  warnings: string[];
  overrideInstructions?: string;
  referenceDate?: Date;
};

function serializeYamlSection(title: string, value: unknown): string {
  return `## ${title}\n\`\`\`yaml\n${stringify(value).trim()}\n\`\`\``;
}

function serializeJsonSection(title: string, value: unknown): string {
  return `## ${title}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export function buildAnalysisPrompt({
  bundle,
  analysisPrompt,
  referenceDocuments,
  warnings,
  overrideInstructions,
  referenceDate,
}: BuildPromptInput): string {
  const documentBlock = referenceDocuments
    .map(
      (document) =>
        `## ${document.name}\n\`\`\`md\n${document.content.trim()}\n\`\`\``,
    )
    .join("\n\n");

  const cacheSections = [
    ...bundle.caches.weather.map((cache) =>
      serializeJsonSection(`cache/weather/${cache.name}`, cache.content),
    ),
    ...bundle.caches.places.map((cache) =>
      serializeJsonSection(`cache/places/${cache.name}`, cache.content),
    ),
  ];

  const warningLines =
    warnings.length > 0
      ? warnings.map((warning) => `- ${warning}`).join("\n")
      : "- 현재 검증 경고 없음";

  const overrideBlock = overrideInstructions?.trim()
    ? `\n## 추가 사용자 지시\n${overrideInstructions.trim()}\n`
    : "";

  return [
    "# 분석 작업 지시",
    analysisPrompt.trim(),
    "",
    "## 검증 경고",
    warningLines,
    overrideBlock.trim(),
    "",
    "# 문서 기준",
    documentBlock,
    "",
    "# 로컬 데이터",
    serializeYamlSection("profile.yaml", bundle.profile),
    serializeYamlSection("companions.yaml", bundle.companions),
    serializeYamlSection("equipment/durable.yaml", bundle.durableEquipment),
    serializeYamlSection("equipment/consumables.yaml", bundle.consumables),
    serializeYamlSection("equipment/precheck.yaml", bundle.precheck),
    serializeYamlSection("preferences/travel.yaml", bundle.travelPreferences),
    serializeYamlSection("preferences/food.yaml", bundle.foodPreferences),
    serializeYamlSection("links.yaml", bundle.links),
    serializeYamlSection(`trips/${bundle.trip.trip_id}.yaml`, bundle.trip),
    "",
    "# 추가 계산 컨텍스트",
    serializeYamlSection(
      "next-camping-recommendation-context",
      buildNextCampingRecommendationContext(bundle, referenceDate ?? new Date()),
    ),
    "",
    "# 선택적 캐시",
    cacheSections.length > 0 ? cacheSections.join("\n\n") : "없음",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildNextCampingRecommendationContext(bundle: TripBundle, referenceDate: Date) {
  const anchor = resolveNextCampingAnchor(bundle, referenceDate);
  const recommendationWindowStart = addDaysUtc(anchor.date, 1);
  const recommendationWindowEnd = addMonthsUtc(anchor.date, 1);
  const candidateWeekends = collectWeekendCandidates(
    recommendationWindowStart,
    recommendationWindowEnd,
  );
  const familyReasons = collectFamilyReasons(bundle);
  const dominantSeason = candidateWeekends[0]
    ? candidateWeekends[0].season
    : getSeasonId(recommendationWindowStart);

  return {
    reference_date: formatDateUtc(anchor.date),
    reference_reason: anchor.reason,
    recommendation_window: {
      start: formatDateUtc(recommendationWindowStart),
      end: formatDateUtc(recommendationWindowEnd),
      rule: "기준일 다음 날부터 1개월 이내 주말만 다음 캠핑 후보로 검토",
    },
    candidate_weekends: candidateWeekends.map((candidate) => ({
      start: formatDateUtc(candidate.start),
      end: formatDateUtc(candidate.end),
      season: candidate.season,
      season_label: getSeasonLabel(candidate.season),
    })),
    family_context: {
      family_friendly_required: true,
      reasons:
        familyReasons.length > 0
          ? familyReasons
          : ["가족 단위 적합성을 기본 선호 조건으로 유지"],
    },
    location_hints: {
      current_trip_region: bundle.trip.location?.region,
      current_campsite_name: bundle.trip.location?.campsite_name,
      departure_region: bundle.trip.departure?.region,
      home_region: bundle.profile.home_region,
    },
    preference_hints: {
      interests: bundle.travelPreferences.interests,
      requested_stops: bundle.trip.travel_plan?.requested_stops ?? [],
      preferred_stop_count:
        bundle.travelPreferences.travel_style.preferred_stop_count,
      max_extra_drive_minutes:
        bundle.travelPreferences.travel_style.max_extra_drive_minutes,
    },
    seasonal_focus: buildSeasonalFocus(dominantSeason),
    recommended_links: bundle.links.items
      .filter((item) =>
        ["weather", "place", "food", "general"].includes(item.category),
      )
      .slice(0, 5)
      .map((item) => ({
        category: item.category,
        name: item.name,
        url: item.url,
        notes: item.notes,
      })),
  };
}

function resolveNextCampingAnchor(
  bundle: TripBundle,
  referenceDate: Date,
): { date: Date; reason: string } {
  if (bundle.trip.date?.end) {
    return {
      date: parseDateOnly(bundle.trip.date.end),
      reason: "현재 trip 종료일 기준으로 다음 캠핑 후보 주말 계산",
    };
  }

  if (bundle.trip.date?.start) {
    return {
      date: parseDateOnly(bundle.trip.date.start),
      reason: "현재 trip 시작일 기준으로 다음 캠핑 후보 주말 계산",
    };
  }

  return {
    date: toUtcStartOfDay(referenceDate),
    reason: "현재 trip 날짜가 없어 분석 실행일 기준으로 다음 캠핑 후보 주말 계산",
  };
}

function collectWeekendCandidates(
  windowStart: Date,
  windowEnd: Date,
): Array<{ start: Date; end: Date; season: SeasonId }> {
  const firstSaturdayOffset = (6 - windowStart.getUTCDay() + 7) % 7;
  const firstSaturday = addDaysUtc(windowStart, firstSaturdayOffset);
  const candidates: Array<{ start: Date; end: Date; season: SeasonId }> = [];

  for (
    let current = firstSaturday;
    current.getTime() <= windowEnd.getTime();
    current = addDaysUtc(current, 7)
  ) {
    candidates.push({
      start: current,
      end: addDaysUtc(current, 1),
      season: getSeasonId(current),
    });
  }

  return candidates;
}

function collectFamilyReasons(bundle: TripBundle): string[] {
  const companionMap = new Map(
    bundle.companions.companions.map((companion) => [companion.id, companion]),
  );
  const selectedCompanions = bundle.trip.party.companion_ids
    .map((id) => companionMap.get(id))
    .filter(
      (companion): companion is TripBundle["companions"]["companions"][number] =>
        companion !== undefined,
    );
  const reasons: string[] = [];

  if (
    selectedCompanions.some(
      (companion) =>
        companion.age_group === "preschooler" ||
        companion.age_group === "elementary" ||
        companion.age_group === "middle_school" ||
        companion.age_group === "high_school",
    )
  ) {
    reasons.push("아이 동행자가 포함되어 있어 가족 단위 이용 편의성이 중요");
  }

  if (bundle.travelPreferences.constraints.child_friendly_preferred) {
    reasons.push("travel 선호에서 아이 동반 친화 장소 선호가 설정됨");
  }

  return reasons;
}

function buildSeasonalFocus(season: SeasonId): string[] {
  switch (season) {
    case "spring":
      return [
        "봄철 산책, 꽃구경, 강변 걷기처럼 낮 활동이 편한 장소를 우선",
        "일교차가 커도 아이와 머물기 무리 없는 가족형 캠핑장을 우선",
      ];
    case "summer":
      return [
        "그늘, 물놀이 접근성, 통풍이 좋은 여름형 장소를 우선",
        "가족 단위 샤워실, 매점, 실내 대피 동선이 있는 곳을 우선",
      ];
    case "autumn":
      return [
        "단풍, 숲길, 선선한 산책 코스를 즐기기 좋은 가을 장소를 우선",
        "아침저녁 기온 차에 대응하기 쉬운 가족형 사이트를 우선",
      ];
    case "winter":
      return [
        "강풍을 피하고 난방, 전기, 실내 대체 동선이 있는 겨울형 장소를 우선",
        "가족 단위 화장실, 샤워실, 난방 편의가 확보된 곳을 우선",
      ];
  }
}

function getSeasonId(value: Date): SeasonId {
  const month = value.getUTCMonth() + 1;

  if (month >= 3 && month <= 5) {
    return "spring";
  }

  if (month >= 6 && month <= 8) {
    return "summer";
  }

  if (month >= 9 && month <= 11) {
    return "autumn";
  }

  return "winter";
}

function getSeasonLabel(season: SeasonId): string {
  switch (season) {
    case "spring":
      return "봄";
    case "summer":
      return "여름";
    case "autumn":
      return "가을";
    case "winter":
      return "겨울";
  }
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toUtcStartOfDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  );
}

function addDaysUtc(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsUtc(value: Date, months: number): Date {
  const targetMonthStart = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth(),
      Math.min(value.getUTCDate(), lastDayOfTargetMonth),
    ),
  );
}

function formatDateUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}
