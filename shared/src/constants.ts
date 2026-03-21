import type { AgeGroup, ErrorCode, ExternalLinkCategory } from "./types";

export const TRIP_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ERROR_CODES: Record<ErrorCode, ErrorCode> = {
  INVALID_TRIP_ID_FORMAT: "INVALID_TRIP_ID_FORMAT",
  TRIP_NOT_FOUND: "TRIP_NOT_FOUND",
  TRIP_INVALID: "TRIP_INVALID",
  DEPENDENCY_MISSING: "DEPENDENCY_MISSING",
  OPENAI_REQUEST_FAILED: "OPENAI_REQUEST_FAILED",
  OUTPUT_SAVE_FAILED: "OUTPUT_SAVE_FAILED",
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
