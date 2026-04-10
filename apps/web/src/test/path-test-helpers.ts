export function readTripIdFromPath(pathname: string) {
  return pathname.match(/^\/api\/trips\/([^/]+)$/u)?.[1] ?? null;
}

export function readCompanionIdFromPath(pathname: string) {
  return pathname.match(/^\/api\/companions\/([^/]+)$/u)?.[1] ?? null;
}

export function readVehicleIdFromPath(pathname: string) {
  return pathname.match(/^\/api\/vehicles\/([^/]+)$/u)?.[1] ?? null;
}

export function readOutputTripIdFromPath(pathname: string) {
  return pathname.match(/^\/api\/outputs\/([^/]+)$/u)?.[1] ?? null;
}

export function readTripAnalysisStatusTripId(pathname: string) {
  return pathname.match(/^\/api\/trips\/([^/]+)\/analysis-status$/u)?.[1] ?? null;
}

export function readHistoryIdFromPath(pathname: string) {
  return pathname.match(/^\/api\/history\/([^/]+)$/u)?.[1] ?? null;
}

export function readHistoryLearningIdFromPath(pathname: string) {
  return pathname.match(/^\/api\/history\/([^/]+)\/learning$/u)?.[1] ?? null;
}

export function readHistoryRetrospectiveIdFromPath(pathname: string) {
  return pathname.match(/^\/api\/history\/([^/]+)\/retrospectives$/u)?.[1] ?? null;
}

export function readEquipmentItemParams(pathname: string) {
  const match = pathname.match(/^\/api\/equipment\/([^/]+)\/items(?:\/([^/]+))?$/u);

  if (!match) {
    return null;
  }

  return {
    section: match[1] as "durable" | "consumables" | "precheck",
    itemId: match[2] ?? null,
  };
}

export function readDurableEquipmentMetadataRefreshId(pathname: string) {
  return pathname.match(/^\/api\/equipment\/durable\/items\/([^/]+)\/metadata\/refresh$/u)?.[1] ?? null;
}

export function isDurableMetadataStatusesPath(pathname: string) {
  return pathname === "/api/equipment/durable/metadata-statuses";
}

export function readEquipmentCategoryParams(pathname: string) {
  const match = pathname.match(/^\/api\/equipment\/categories\/([^/]+)(?:\/([^/]+))?$/u);

  if (!match) {
    return null;
  }

  return {
    section: match[1] as "durable" | "consumables" | "precheck",
    categoryId: match[2] ?? null,
  };
}
