import type { DurableEquipmentMetadata } from "@camping/shared";
import { ApiClientError } from "../api/client";

export function parseNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseInteger(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function joinCommaList(values?: string[]) {
  return values?.join(", ") ?? "";
}

export function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinLineList(values?: string[]) {
  return values?.join("\n") ?? "";
}

export function splitLineList(value: string) {
  return value
    .split("\n")
    .filter((item) => item.trim().length > 0);
}

export function appendSyncWarnings(base: string, warnings: string[]) {
  if (warnings.length === 0) {
    return base;
  }

  return `${base} / ${warnings.join(" / ")}`;
}

export function formatCompactTripId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [year, month, day, ...rest] = value.split("-");

  if (!year || !month || !day || rest.length === 0) {
    return value;
  }

  return `${year}-${month}-${day} / ${rest.join("-")}`;
}

export function formatPackedSize(metadata: DurableEquipmentMetadata) {
  const values = [
    metadata.packing?.width_cm,
    metadata.packing?.depth_cm,
    metadata.packing?.height_cm,
  ].filter((value): value is number => typeof value === "number");

  return values.length === 3 ? `${values.join(" x ")} cm` : null;
}

export function formatRelativeDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ko-KR");
}

export function getStatusLabel(labels: Record<string, string>, status: string) {
  return labels[status] ?? status;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export function toValidationWarnings(error: unknown): string[] {
  const message = getErrorMessage(error);
  return message ? [message] : ["검증 결과를 가져오지 못했습니다."];
}
