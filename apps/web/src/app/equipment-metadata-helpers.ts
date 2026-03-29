import type {
  DurableEquipmentMetadata,
  DurableMetadataJobStatus,
  DurableMetadataJobStatusResponse,
  DurableEquipmentItem,
  EquipmentCatalog,
} from "@camping/shared";
import {
  CONSUMABLE_STATUS_LABELS,
  DURABLE_METADATA_STATUS_LABELS,
  PRECHECK_STATUS_LABELS,
  getConsumableStatus,
} from "@camping/shared";
import type { DurableMetadataJobStatusMap } from "./view-model-types";
import { getStatusLabel } from "./common-formatters";

export function toDurableEquipmentInput(item: DurableEquipmentItem) {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    model: item.model,
    purchase_link: item.purchase_link,
    category: item.category,
    quantity: item.quantity,
    capacity: item.capacity,
    season_support: item.season_support,
    tags: item.tags,
    status: item.status,
    notes: item.notes,
  };
}

export function buildDurableMetadataFingerprint(
  item: Pick<DurableEquipmentItem, "name" | "model" | "purchase_link" | "category">,
) {
  return [item.name, item.model ?? "", item.purchase_link ?? "", item.category].join("::");
}

export function buildDurableFingerprintMap(catalog: EquipmentCatalog) {
  return Object.fromEntries(
    catalog.durable.items.map((item) => [item.id, buildDurableMetadataFingerprint(item)]),
  );
}

export function createDurableMetadataJobStatusMap(
  items: DurableMetadataJobStatusResponse[],
): DurableMetadataJobStatusMap {
  return Object.fromEntries(items.map((item) => [item.item_id, item]));
}

export function isPendingDurableMetadataJobStatus(status?: DurableMetadataJobStatus) {
  return status === "queued" || status === "running";
}

export function getDurableMetadataStatusLabel(status?: DurableMetadataJobStatus) {
  switch (status) {
    case "queued":
      return "대기 중";
    case "running":
      return "수집 중";
    case "failed":
      return "수집 실패";
    case "interrupted":
      return "수집 중단";
    default:
      return "미수집";
  }
}

export function getDurableMetadataSummaryStatusLabel(status?: DurableMetadataJobStatus) {
  switch (status) {
    case "queued":
    case "running":
      return "메타 수집 중";
    case "failed":
      return "메타 실패";
    case "interrupted":
      return "메타 중단";
    default:
      return undefined;
  }
}

export function getDurableMetadataCardBadgeLabel(
  status: DurableMetadataJobStatus | undefined,
  metadata?: DurableEquipmentMetadata,
) {
  if (status === "queued" || status === "running") {
    return "백그라운드 수집 중";
  }

  if (status === "failed") {
    return "재수집 실패";
  }

  if (status === "interrupted") {
    return "재수집 중단";
  }

  return metadata ? DURABLE_METADATA_STATUS_LABELS[metadata.lookup_status] : "미수집";
}

export function buildDashboardAlerts(catalog: EquipmentCatalog | null) {
  if (!catalog) {
    return [];
  }

  const consumableAlerts = catalog.consumables.items
    .filter((item) => getConsumableStatus(item) !== "ok")
    .map(
      (item) =>
        `${item.name} ${item.quantity_on_hand}${item.unit ? ` ${item.unit}` : ""} / ${getStatusLabel(
          CONSUMABLE_STATUS_LABELS,
          getConsumableStatus(item),
        )}`,
    );

  const precheckAlerts = catalog.precheck.items
    .filter((item) => item.status !== "ok")
    .map((item) => `${item.name} / ${getStatusLabel(PRECHECK_STATUS_LABELS, item.status)}`);

  return [...consumableAlerts, ...precheckAlerts].slice(0, 6);
}
