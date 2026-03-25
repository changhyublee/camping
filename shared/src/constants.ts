import type {
  AgeGroup,
  EquipmentMetadataLookupStatus,
  DurableEquipmentItem,
  EquipmentCategoriesData,
  EquipmentCategory,
  EquipmentSection,
  ErrorCode,
  ExternalLinkCategory,
  PrecheckItem,
  TripAnalysisCategory,
  TripAnalysisSection,
  TripAnalysisStatus,
} from "./types";

type DurableStatus = Extract<
  DurableEquipmentItem["status"],
  "ok" | "low" | "needs_check" | "needs_repair"
>;
type ConsumableStatus = "ok" | "low" | "empty";
type PrecheckStatus = Extract<
  PrecheckItem["status"],
  "ok" | "needs_check" | "needs_repair"
>;

export const TRIP_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE =
  "카테고리 코드를 영문 소문자, 숫자, -, _ 형식으로 입력해 주세요.";

export const ERROR_CODES: Record<ErrorCode, ErrorCode> = {
  INVALID_TRIP_ID_FORMAT: "INVALID_TRIP_ID_FORMAT",
  TRIP_NOT_FOUND: "TRIP_NOT_FOUND",
  TRIP_INVALID: "TRIP_INVALID",
  DEPENDENCY_MISSING: "DEPENDENCY_MISSING",
  OPENAI_REQUEST_FAILED: "OPENAI_REQUEST_FAILED",
  OUTPUT_SAVE_FAILED: "OUTPUT_SAVE_FAILED",
  BACKUP_FAILED: "BACKUP_FAILED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  adult: "성인",
  preschooler: "유치원생",
  elementary: "초등학생",
  middle_school: "중학생",
  high_school: "고등학생",
  senior: "시니어",
};

export const EXTERNAL_LINK_CATEGORY_LABELS: Record<
  ExternalLinkCategory,
  string
> = {
  weather: "날씨",
  place: "장소",
  food: "맛집",
  shopping: "장보기",
  general: "기타",
};

export const DURABLE_STATUS_LABELS: Record<DurableStatus, string> = {
  ok: "정상",
  low: "부족",
  needs_check: "점검 필요",
  needs_repair: "수리 필요",
};

export const DURABLE_METADATA_STATUS_LABELS: Record<
  EquipmentMetadataLookupStatus,
  string
> = {
  found: "수집 완료",
  not_found: "재원 미확인",
  failed: "수집 실패",
};

export const CONSUMABLE_STATUS_LABELS: Record<ConsumableStatus, string> = {
  ok: "정상",
  low: "부족",
  empty: "없음",
};

export const PRECHECK_STATUS_LABELS: Record<PrecheckStatus, string> = {
  ok: "정상",
  needs_check: "점검 필요",
  needs_repair: "수리 필요",
};

export const TRIP_ANALYSIS_STATUS_LABELS: Record<TripAnalysisStatus, string> = {
  idle: "미수집",
  queued: "대기 중",
  running: "수집 중",
  completed: "수집 완료",
  failed: "실패",
  interrupted: "중단",
};

export const TRIP_ANALYSIS_CATEGORY_METADATA: Record<
  TripAnalysisCategory,
  {
    label: string;
    summary: string;
    sections: TripAnalysisSection[];
  }
> = {
  summary: {
    label: "1. 요약",
    summary: "핵심 요약",
    sections: [{ order: 1, title: "요약" }],
  },
  equipment: {
    label: "2. 추천 장비",
    summary: "추천 장비",
    sections: [{ order: 2, title: "추천 장비" }],
  },
  personal_items: {
    label: "3. 연령대별 개인 준비물",
    summary: "연령대별 개인 준비물",
    sections: [{ order: 3, title: "연령대별 개인 준비물" }],
  },
  shortage: {
    label: "4. 부족한 장비/소모품",
    summary: "부족한 장비와 소모품",
    sections: [{ order: 4, title: "부족한 장비/소모품" }],
  },
  precheck: {
    label: "5. 출발 전 체크리스트",
    summary: "출발 전 체크리스트",
    sections: [{ order: 5, title: "출발 전 체크리스트" }],
  },
  meals: {
    label: "6. 추천 식단/요리",
    summary: "추천 식단과 요리",
    sections: [{ order: 6, title: "추천 식단/요리" }],
  },
  travel_route: {
    label: "7. 이동 중 방문 후보 지역과 장소",
    summary: "이동 중 방문 후보 지역과 장소",
    sections: [{ order: 7, title: "이동 중 방문 후보 지역과 장소" }],
  },
  nearby_places: {
    label: "8. 캠핑장 주변 방문 후보 지역과 장소",
    summary: "캠핑장 주변 방문 후보 지역과 장소",
    sections: [{ order: 8, title: "캠핑장 주변 방문 후보 지역과 장소" }],
  },
  campsite_tips: {
    label: "9. 캠핑장 tip",
    summary: "캠핑장 후기 기반 tip",
    sections: [{ order: 9, title: "캠핑장 tip" }],
  },
  risks_limits: {
    label: "10. 주의사항 및 한계",
    summary: "리스크와 한계",
    sections: [{ order: 10, title: "주의사항 및 한계" }],
  },
  next_camping: {
    label: "11. 다음 캠핑 추천",
    summary: "다음 캠핑 추천",
    sections: [{ order: 11, title: "다음 캠핑 추천" }],
  },
};

export const ALL_TRIP_ANALYSIS_CATEGORIES = Object.freeze(
  Object.keys(TRIP_ANALYSIS_CATEGORY_METADATA) as TripAnalysisCategory[],
);

export const EQUIPMENT_SECTION_LABELS: Record<EquipmentSection, string> = {
  durable: "반복 장비",
  consumables: "소모품",
  precheck: "출발 전 점검",
};

const DEFAULT_DURABLE_CATEGORIES: EquipmentCategory[] = [
  { id: "shelter", label: "쉘터/텐트", sort_order: 1 },
  { id: "sleeping", label: "침구", sort_order: 2 },
  { id: "furniture", label: "가구", sort_order: 3 },
  { id: "lighting", label: "조명", sort_order: 4 },
  { id: "cooking_fire", label: "화기", sort_order: 5 },
  { id: "cooking", label: "조리", sort_order: 6 },
];

const DEFAULT_CONSUMABLE_CATEGORIES: EquipmentCategory[] = [
  { id: "fuel", label: "연료", sort_order: 1 },
  { id: "insect_repellent", label: "벌레 퇴치", sort_order: 2 },
  { id: "ignition", label: "점화", sort_order: 3 },
];

const DEFAULT_PRECHECK_CATEGORIES: EquipmentCategory[] = [
  { id: "battery", label: "배터리", sort_order: 1 },
  { id: "vehicle", label: "차량", sort_order: 2 },
];

export const DEFAULT_EQUIPMENT_CATEGORIES: EquipmentCategoriesData = {
  version: 1,
  durable: DEFAULT_DURABLE_CATEGORIES,
  consumables: DEFAULT_CONSUMABLE_CATEGORIES,
  precheck: DEFAULT_PRECHECK_CATEGORIES,
};
