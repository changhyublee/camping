import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
  TRIP_ANALYSIS_CATEGORY_METADATA,
} from "@camping/shared";
import type {
  AddHistoryRetrospectiveResponse,
  AnalyzeTripResponse,
  Companion,
  ConsumableEquipmentItem,
  DataBackupSnapshot,
  DurableMetadataJobStatusResponse,
  DurableEquipmentItem,
  EquipmentCatalog,
  EquipmentCategoriesData,
  GetOutputResponse,
  HistoryLearningInsight,
  HistoryRecord,
  PrecheckItem,
  RefreshDurableEquipmentMetadataResponse,
  RetrospectiveEntryInput,
  TripDraft,
  TripData,
  TripSummary,
  UserLearningJobStatusResponse,
  UserLearningProfile,
  ValidateTripResponse,
  Vehicle,
} from "@camping/shared";
import {
  createMockState as createBaseMockState,
  type ApiResponse,
  type MockState,
} from "./mock-state";

export type { ApiResponse, MockState } from "./mock-state";
export { createMockState } from "./mock-state";

export const fetchMock = vi.fn<typeof fetch>();
const originalEventSource = globalThis.EventSource;

vi.stubGlobal("fetch", fetchMock);

export class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  readonly withCredentials = false;
  readyState = 0;
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(url: string | URL) {
    this.url = url.toString();
    MockEventSource.instances.push(this);
  }

  static latest() {
    const instance = MockEventSource.instances.at(-1);

    if (!instance) {
      throw new Error("No EventSource instance was created.");
    }

    return instance;
  }

  static reset() {
    MockEventSource.instances = [];
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const normalizedListener =
      typeof listener === "function"
        ? listener
        : (event: Event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(normalizedListener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type);

    if (!listeners) {
      return;
    }

    const normalizedListener =
      typeof listener === "function"
        ? listener
        : (event: Event) => listener.handleEvent(event);
    listeners.delete(normalizedListener);

    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  close() {
    this.readyState = 2;
  }

  open() {
    this.readyState = 1;
    this.dispatch("open", new Event("open"));
  }

  error() {
    this.readyState = 0;
    this.dispatch("error", new Event("error"));
  }

  emit(type: string, payload: unknown) {
    this.dispatch(type, new MessageEvent(type, { data: JSON.stringify(payload) }));
  }

  private dispatch(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

type MetadataStatusSequenceEntry =
  | ApiResponse<RefreshDurableEquipmentMetadataResponse>
  | null;

export let state: MockState;
beforeEach(() => {
  state = createBaseMockState();
  fetchMock.mockImplementation(mockFetch);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  MockEventSource.reset();

  if (originalEventSource) {
    vi.stubGlobal("EventSource", originalEventSource);
  } else {
    delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
  }
});

afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
  MockEventSource.reset();

  if (originalEventSource) {
    vi.stubGlobal("EventSource", originalEventSource);
  } else {
    delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
  }
});

export function jsonResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body);

  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  } as Response);
}

export function emptyResponse(status = 204) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("No JSON body");
    },
    text: async () => "",
  } as unknown as Response);
}

export function createDeferredResponse() {
  let resolve: ((value: Response) => void) | null = null;

  const promise = new Promise<Response>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: (body: unknown, status = 200) => {
      resolve?.({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response);
    },
  };
}

export function parseBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") {
    return undefined;
  }

  return JSON.parse(init.body) as Record<string, unknown>;
}

export async function openPage(pageName: string) {
  await userEvent.click(await screen.findByRole("button", { name: pageName }));
}

export async function openPageTab(pageName: string, tabName: string) {
  await openPage(pageName);
  await userEvent.click(await screen.findByRole("tab", { name: tabName }));
}

export function summarizeTrip(trip: TripData): TripSummary {
  return {
    trip_id: trip.trip_id,
    title: trip.title,
    start_date: trip.date?.start,
    end_date: trip.date?.end,
    region: trip.location?.region,
    companion_count: trip.party.companion_ids.length,
  };
}

function updateTripSummary(trip: TripData) {
  const nextSummary = summarizeTrip(trip);
  const index = state.trips.findIndex((item) => item.trip_id === trip.trip_id);

  if (index >= 0) {
    state.trips[index] = nextSummary;
    return;
  }

  state.trips.push(nextSummary);
}

function readTripIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/trips\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readCompanionIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/companions\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readVehicleIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/vehicles\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readOutputTripIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/outputs\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readTripAnalysisStatusTripId(pathname: string) {
  const match = pathname.match(/^\/api\/trips\/([^/]+)\/analysis-status$/u);
  return match?.[1] ?? null;
}

function readHistoryIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/history\/([^/]+)$/u);
  return match?.[1] ?? null;
}

function readHistoryLearningIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/history\/([^/]+)\/learning$/u);
  return match?.[1] ?? null;
}

function readHistoryRetrospectiveIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/history\/([^/]+)\/retrospectives$/u);
  return match?.[1] ?? null;
}

function readEquipmentItemParams(pathname: string) {
  const match = pathname.match(/^\/api\/equipment\/([^/]+)\/items(?:\/([^/]+))?$/u);

  if (!match) {
    return null;
  }

  return {
    section: match[1] as "durable" | "consumables" | "precheck",
    itemId: match[2] ?? null,
  };
}

function readDurableEquipmentMetadataRefreshId(pathname: string) {
  const match = pathname.match(
    /^\/api\/equipment\/durable\/items\/([^/]+)\/metadata\/refresh$/u,
  );

  return match?.[1] ?? null;
}

function isDurableMetadataStatusesPath(pathname: string) {
  return pathname === "/api/equipment/durable/metadata-statuses";
}

function readEquipmentCategoryParams(pathname: string) {
  const match = pathname.match(/^\/api\/equipment\/categories\/([^/]+)(?:\/([^/]+))?$/u);

  if (!match) {
    return null;
  }

  return {
    section: match[1] as "durable" | "consumables" | "precheck",
    categoryId: match[2] ?? null,
  };
}

export function createAnalysisResponse(
  tripId: string,
  overrides: Partial<AnalyzeTripResponse> = {},
): AnalyzeTripResponse {
  const categories = ALL_TRIP_ANALYSIS_CATEGORIES.map((category) => ({
    category,
    label: TRIP_ANALYSIS_CATEGORY_METADATA[category].label,
    sections: TRIP_ANALYSIS_CATEGORY_METADATA[category].sections,
    status: "idle" as const,
    has_result: false,
    requested_at: null,
    started_at: null,
    finished_at: null,
    collected_at: null,
  }));

  return {
    trip_id: tripId,
    status: "idle",
    requested_at: null,
    started_at: null,
    finished_at: null,
    output_path: null,
    categories,
    completed_category_count: 0,
    total_category_count: ALL_TRIP_ANALYSIS_CATEGORIES.length,
    ...overrides,
  };
}

export function createUserLearningStatus(
  overrides: Partial<UserLearningJobStatusResponse> = {},
): UserLearningJobStatusResponse {
  return {
    status: "idle",
    trigger_history_id: null,
    source_history_ids: [],
    source_entry_count: 0,
    requested_at: null,
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

export function createHistoryRecord(
  overrides: Partial<HistoryRecord> = {},
): HistoryRecord {
  return {
    version: 1,
    history_id: "2026-03-08-yangpyeong",
    source_trip_id: "2026-03-08-yangpyeong",
    title: "3월 양평 주말 캠핑",
    date: {
      start: "2026-03-08",
      end: "2026-03-09",
    },
    location: {
      region: "yangpyeong",
    },
    companion_ids: ["self", "child-1"],
    companion_snapshots: [state.companions[0], state.companions[1]],
    attendee_count: 2,
    vehicle_snapshot: state.vehicles[0],
    notes: [],
    retrospectives: [],
    archived_at: "2026-03-10T09:00:00.000Z",
    output_path: ".camping-data/outputs/2026-03-08-yangpyeong-plan.md",
    trip_snapshot: {
      version: 1,
      trip_id: "2026-03-08-yangpyeong",
      title: "3월 양평 주말 캠핑",
      date: {
        start: "2026-03-08",
        end: "2026-03-09",
      },
      location: {
        region: "yangpyeong",
      },
      party: {
        companion_ids: ["self", "child-1"],
      },
      vehicle: {
        id: "family-suv",
        name: "패밀리 SUV",
        passenger_capacity: 5,
        load_capacity_kg: 400,
        notes: [],
      },
      notes: [],
    },
    ...overrides,
  };
}

function consumeAnalysisStatusResponse(tripId: string) {
  const idleResponse: ApiResponse<AnalyzeTripResponse> = {
    body: createAnalysisResponse(tripId),
  };
  const response = state.analysisStatuses[tripId];

  if (!response) {
    return idleResponse;
  }

  if (Array.isArray(response)) {
    return response.length > 1 ? response.shift() ?? idleResponse : response[0] ?? idleResponse;
  }

  return response;
}

function peekAnalysisStatusResponse(tripId: string) {
  const response = state.analysisStatuses[tripId];

  if (!response) {
    return createAnalysisResponse(tripId);
  }

  if (Array.isArray(response)) {
    return response[0]?.body ?? createAnalysisResponse(tripId);
  }

  return response.body;
}

function consumeMetadataStatusResponse(itemId: string) {
  const response = state.metadataStatuses[itemId];

  if (!response) {
    return null;
  }

  if (Array.isArray(response)) {
    if (response.length > 1) {
      const current = response.shift() ?? null;

      if (response.length === 0) {
        delete state.metadataStatuses[itemId];
      }

      return current;
    }

    return response[0] ?? null;
  }

  return response;
}

function readMetadataRefreshResponse(itemId: string) {
  const response = state.metadataStatuses[itemId];

  if (!response) {
    const queuedResponse: ApiResponse<RefreshDurableEquipmentMetadataResponse> = {
      status: 202,
      body: {
        item_id: itemId,
        status: "queued",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: null,
        finished_at: null,
      },
    };

    state.metadataStatuses[itemId] = queuedResponse;
    return queuedResponse;
  }

  if (Array.isArray(response)) {
    const current = response.shift() ?? null;

    if (response.length === 0) {
      delete state.metadataStatuses[itemId];
    }

    if (current) {
      return current;
    }

    const queuedResponse: ApiResponse<RefreshDurableEquipmentMetadataResponse> = {
      status: 202,
      body: {
        item_id: itemId,
        status: "queued",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: null,
        finished_at: null,
      },
    };

    state.metadataStatuses[itemId] = queuedResponse;
    return queuedResponse;
  }

  return response;
}

export function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
  const rawUrl = typeof input === "string" ? input : input.toString();
  const pathname = new URL(rawUrl, "http://localhost").pathname;
  const method = init?.method?.toUpperCase() ?? "GET";

  if (pathname === "/api/trips" && method === "GET") {
    return jsonResponse({ items: state.trips });
  }

  if (pathname === "/api/companions" && method === "GET") {
    return jsonResponse({ items: state.companions });
  }

  if (pathname === "/api/vehicles" && method === "GET") {
    return jsonResponse({ items: state.vehicles });
  }

  if (pathname === "/api/data-backups" && method === "POST") {
    const item: DataBackupSnapshot = {
      created_at: "2026-03-23T15:00:00.000Z",
      reason: "manual",
      source_path: "/workspace/.camping-data",
      backup_path: `/workspace/.camping-backups/2026-03-23T15-00-00.000Z-${state.dataBackups.length + 1}`,
      data_path: `/workspace/.camping-backups/2026-03-23T15-00-00.000Z-${state.dataBackups.length + 1}/data`,
    };

    state.dataBackups.unshift(item);
    return jsonResponse({ item });
  }

  if (pathname === "/api/ai-jobs/cancel-all" && method === "POST") {
    const cancelledTripIds = Object.keys(state.analysisStatuses).filter((tripId) => {
      const status = peekAnalysisStatusResponse(tripId);
      return status.status === "queued" || status.status === "running";
    });
    const cancelledAnalysisCategoryCount = cancelledTripIds.reduce((count, tripId) => {
      const status = peekAnalysisStatusResponse(tripId);
      return (
        count +
        status.categories.filter(
          (category) => category.status === "queued" || category.status === "running",
        ).length
      );
    }, 0);
    const cancelledMetadataItemIds = Object.keys(state.metadataStatuses).filter((itemId) => {
      const response = consumeMetadataStatusResponse(itemId);

      if (!response) {
        return false;
      }

      state.metadataStatuses[itemId] = response;
      return response.body.status === "queued" || response.body.status === "running";
    });

    for (const tripId of cancelledTripIds) {
      const status = peekAnalysisStatusResponse(tripId);
      state.analysisStatuses[tripId] = {
        body: {
          ...status,
          status: "interrupted",
          finished_at: "2026-03-24T10:05:00.000Z",
          categories: status.categories.map((category) =>
            category.status === "queued" || category.status === "running"
              ? {
                  ...category,
                  status: "interrupted",
                  finished_at: "2026-03-24T10:05:00.000Z",
                  error: {
                    code: "INTERNAL_ERROR",
                    message: "사용자 요청으로 모든 AI 분석을 중단했습니다.",
                  },
                }
              : category,
          ),
          error: {
            code: "INTERNAL_ERROR",
            message: "사용자 요청으로 모든 AI 분석을 중단했습니다.",
          },
        },
      };
    }

    for (const itemId of cancelledMetadataItemIds) {
      state.metadataStatuses[itemId] = {
        body: {
          item_id: itemId,
          status: "interrupted",
          requested_at: "2026-03-24T10:00:00.000Z",
          started_at: "2026-03-24T10:00:01.000Z",
          finished_at: "2026-03-24T10:05:00.000Z",
          error: {
            code: "INTERNAL_ERROR",
            message: "사용자 요청으로 모든 AI 요청을 중단했습니다.",
          },
        },
      };
    }

    return jsonResponse({
      status: "cancelled",
      cancelled_analysis_trip_count: cancelledTripIds.length,
      cancelled_analysis_category_count: cancelledAnalysisCategoryCount,
      cancelled_metadata_item_count: cancelledMetadataItemIds.length,
    });
  }

  if (pathname === "/api/trips" && method === "POST") {
    const body = parseBody(init) as TripDraft;

    if (!body.title?.trim()) {
      return jsonResponse(
        {
          status: "failed",
          warnings: [],
          error: {
            code: "TRIP_INVALID",
            message: "trip 생성 요청 형식이 올바르지 않습니다. title: 값을 입력해야 합니다.",
          },
        },
        400,
      );
    }

    const trip = {
      ...body,
      trip_id: "2026-05-01-new-trip",
    } satisfies TripData;

    state.tripDetails[trip.trip_id] = trip;
    updateTripSummary(trip);

    return jsonResponse({
      trip_id: trip.trip_id,
      data: trip,
    });
  }

  if (pathname === "/api/companions" && method === "POST") {
    const body = parseBody(init) as Companion;

    state.companions.push(body);
    state.companions.sort((left, right) => left.name.localeCompare(right.name, "ko"));

    return jsonResponse({ item: body });
  }

  if (pathname === "/api/vehicles" && method === "POST") {
    const body = parseBody(init) as Vehicle;

    state.vehicles.push(body);
    state.vehicles.sort((left, right) => left.name.localeCompare(right.name, "ko"));

    return jsonResponse({ item: body });
  }

  if (pathname === "/api/equipment" && method === "GET") {
    return jsonResponse(state.equipment);
  }

  if (pathname === "/api/equipment/categories" && method === "GET") {
    return jsonResponse(state.equipmentCategories);
  }

  const companionIdFromPath = readCompanionIdFromPath(pathname);
  const vehicleIdFromPath = readVehicleIdFromPath(pathname);

  if (companionIdFromPath && method === "PUT") {
    const body = parseBody(init) as Companion;
    const index = state.companions.findIndex((item) => item.id === companionIdFromPath);

    if (index >= 0) {
      state.companions[index] = body;
    }

    state.companions.sort((left, right) => left.name.localeCompare(right.name, "ko"));
    return jsonResponse({ item: body });
  }

  if (companionIdFromPath && method === "DELETE") {
    state.companions = state.companions.filter((item) => item.id !== companionIdFromPath);
    return emptyResponse();
  }

  if (vehicleIdFromPath && method === "PUT") {
    const body = parseBody(init) as Vehicle;
    const index = state.vehicles.findIndex((item) => item.id === vehicleIdFromPath);

    if (index >= 0) {
      state.vehicles[index] = body;
    }

    state.vehicles.sort((left, right) => left.name.localeCompare(right.name, "ko"));
    return jsonResponse({ item: body });
  }

  if (vehicleIdFromPath && method === "DELETE") {
    state.vehicles = state.vehicles.filter((item) => item.id !== vehicleIdFromPath);
    return emptyResponse();
  }

  const equipmentItemParams = readEquipmentItemParams(pathname);
  const equipmentCategoryParams = readEquipmentCategoryParams(pathname);
  const durableMetadataRefreshId = readDurableEquipmentMetadataRefreshId(pathname);

  if (equipmentCategoryParams && !equipmentCategoryParams.categoryId && method === "POST") {
    const body = parseBody(init) as { id?: string; label: string };

    if (!body.id) {
      return jsonResponse(
        {
          status: "failed",
          warnings: [],
          error: {
            code: "TRIP_INVALID",
            message: EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
          },
        },
        400,
      );
    }

    const item = {
      id: body.id,
      label: body.label,
      sort_order:
        Math.max(
          0,
          ...state.equipmentCategories[equipmentCategoryParams.section].map(
            (category) => category.sort_order,
          ),
        ) + 1,
    };

    state.equipmentCategories[equipmentCategoryParams.section].push(item);

    return jsonResponse({ item });
  }

  if (equipmentCategoryParams?.categoryId && method === "PUT") {
    const body = parseBody(init) as { label: string };

    if (!body.label?.trim()) {
      return jsonResponse(
        {
          status: "failed",
          error: {
            code: "TRIP_INVALID",
            message:
              "장비 카테고리 수정 요청 형식이 올바르지 않습니다. label: 값을 입력해야 합니다.",
          },
        },
        400,
      );
    }

    const categories = state.equipmentCategories[equipmentCategoryParams.section];
    const index = categories.findIndex((item) => item.id === equipmentCategoryParams.categoryId);

    if (index >= 0) {
      categories[index] = {
        ...categories[index],
        label: body.label,
      };
    }

    return jsonResponse({ item: categories[index] });
  }

  if (equipmentCategoryParams?.categoryId && method === "DELETE") {
    state.equipmentCategories[equipmentCategoryParams.section] = state.equipmentCategories[
      equipmentCategoryParams.section
    ].filter((item) => item.id !== equipmentCategoryParams.categoryId);

    return emptyResponse();
  }

  if (isDurableMetadataStatusesPath(pathname) && method === "GET") {
    const items = Object.keys(state.metadataStatuses)
      .map((itemId) => consumeMetadataStatusResponse(itemId)?.body ?? null)
      .filter((item): item is DurableMetadataJobStatusResponse => item !== null);

    return jsonResponse({ items });
  }

  if (durableMetadataRefreshId && method === "POST") {
    const index = state.equipment.durable.items.findIndex(
      (item) => item.id === durableMetadataRefreshId,
    );

    if (index < 0) {
      return jsonResponse(
        {
          status: "failed",
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: `장비를 찾을 수 없습니다: ${durableMetadataRefreshId}`,
          },
        },
        404,
      );
    }

    const response = readMetadataRefreshResponse(durableMetadataRefreshId);
    return jsonResponse(response.body, response.status ?? 202);
  }

  if (equipmentItemParams?.itemId && method === "PUT") {
    const { section, itemId } = equipmentItemParams;
    const body = parseBody(init) as
      | DurableEquipmentItem
      | ConsumableEquipmentItem
      | PrecheckItem;
    const index = state.equipment[section].items.findIndex((item) => item.id === itemId);

    if (index >= 0) {
      if (section === "durable") {
        state.equipment.durable.items[index] = body as DurableEquipmentItem;
      } else if (section === "consumables") {
        state.equipment.consumables.items[index] = body as ConsumableEquipmentItem;
      } else {
        state.equipment.precheck.items[index] = body as PrecheckItem;
      }
    }

    return jsonResponse({ item: body });
  }

  if (equipmentItemParams?.itemId && method === "DELETE") {
    const { section, itemId } = equipmentItemParams;
    if (section === "durable") {
      state.equipment.durable.items = state.equipment.durable.items.filter(
        (item) => item.id !== itemId,
      );
    } else if (section === "consumables") {
      state.equipment.consumables.items = state.equipment.consumables.items.filter(
        (item) => item.id !== itemId,
      );
    } else {
      state.equipment.precheck.items = state.equipment.precheck.items.filter(
        (item) => item.id !== itemId,
      );
    }

    return emptyResponse();
  }

  if (pathname === "/api/history" && method === "GET") {
    return jsonResponse({ items: state.history });
  }

  if (pathname === "/api/user-learning" && method === "GET") {
    return jsonResponse({
      profile: state.userLearningProfile,
      status: state.userLearningStatus,
    });
  }

  const historyLearningId = readHistoryLearningIdFromPath(pathname);

  if (historyLearningId && method === "GET") {
    return jsonResponse({
      item: state.historyLearning[historyLearningId] ?? null,
    });
  }

  const historyRetrospectiveId = readHistoryRetrospectiveIdFromPath(pathname);

  if (historyRetrospectiveId && method === "POST") {
    const history = state.history.find((item) => item.history_id === historyRetrospectiveId);

    if (!history) {
      return jsonResponse(
        {
          status: "failed",
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: `history 파일을 찾을 수 없습니다: ${historyRetrospectiveId}`,
          },
        },
        404,
      );
    }

    const body = parseBody(init) as RetrospectiveEntryInput;
    const nextHistory = {
      ...history,
      retrospectives: [
        ...history.retrospectives,
        {
          entry_id: `retro-${history.retrospectives.length + 1}`,
          created_at: "2026-03-29T12:00:00.000Z",
          overall_satisfaction: body.overall_satisfaction,
          used_durable_item_ids: body.used_durable_item_ids ?? [],
          unused_items: body.unused_items ?? [],
          missing_or_needed_items: body.missing_or_needed_items ?? [],
          meal_feedback: body.meal_feedback ?? [],
          route_feedback: body.route_feedback ?? [],
          site_feedback: body.site_feedback ?? [],
          issues: body.issues ?? [],
          next_time_requests: body.next_time_requests ?? [],
          freeform_note: body.freeform_note,
        },
      ],
    } satisfies HistoryRecord;

    state.history = state.history.map((item) =>
      item.history_id === historyRetrospectiveId ? nextHistory : item,
    );
    state.userLearningStatus = {
      status: "queued",
      trigger_history_id: historyRetrospectiveId,
      source_history_ids: state.userLearningProfile?.source_history_ids ?? [],
      source_entry_count: state.userLearningProfile?.source_entry_count ?? 0,
      requested_at: "2026-03-29T12:00:00.000Z",
      started_at: null,
      finished_at: null,
    };

    return jsonResponse(
      {
        item: nextHistory,
        learning_status: state.userLearningStatus,
      } satisfies AddHistoryRetrospectiveResponse,
      202,
    );
  }

  const historyIdFromPath = readHistoryIdFromPath(pathname);

  if (historyIdFromPath && method === "PUT") {
    const body = parseBody(init) as HistoryRecord;
    const nextHistory = {
      ...body,
      history_id: historyIdFromPath,
    } satisfies HistoryRecord;
    state.history = state.history.map((item) =>
      item.history_id === historyIdFromPath ? nextHistory : item,
    );

    return jsonResponse({ item: nextHistory });
  }

  if (historyIdFromPath && method === "DELETE") {
    state.history = state.history.filter((item) => item.history_id !== historyIdFromPath);
    delete state.historyLearning[historyIdFromPath];
    return emptyResponse();
  }

  if (pathname === "/api/links" && method === "GET") {
    return jsonResponse({ items: state.links });
  }

  const tripIdFromPath = readTripIdFromPath(pathname);

  if (tripIdFromPath && method === "GET") {
    const trip = state.tripDetails[tripIdFromPath];

    if (!trip) {
      return jsonResponse({
        status: "failed",
        error: {
          code: "TRIP_NOT_FOUND",
          message: `trip 파일을 찾을 수 없습니다: ${tripIdFromPath}`,
        },
      }, 404);
    }

    return jsonResponse({
      trip_id: tripIdFromPath,
      data: trip,
    });
  }

  if (tripIdFromPath && method === "PUT") {
    const body = parseBody(init) as TripData;
    const trip = {
      ...body,
      trip_id: tripIdFromPath,
    } satisfies TripData;

    state.tripDetails[tripIdFromPath] = trip;
    updateTripSummary(trip);
    state.updateTripCalls.push({
      tripId: tripIdFromPath,
      body: trip,
    });

    return jsonResponse({
      trip_id: tripIdFromPath,
      data: trip,
    });
  }

  if (pathname === "/api/validate-trip" && method === "POST") {
    const body = parseBody(init);
    const tripId = body?.trip_id as string;
    const response = state.validations[tripId];

    if (!response) {
      throw new Error(`Unhandled validation request: ${tripId}`);
    }

    return jsonResponse(response.body, response.status ?? 200);
  }

  if (pathname === "/api/analyze-trip" && method === "POST") {
    const body = parseBody(init);
    const tripId = body?.trip_id as string;
    const response = state.analysis;

    state.analysisStatuses[tripId] = response;

    if (response.body.status === "completed" && state.outputs[tripId]) {
      state.outputAvailability[tripId] = true;
    }

    return jsonResponse(response.body, response.status ?? 202);
  }

  const analysisStatusTripId = readTripAnalysisStatusTripId(pathname);

  if (analysisStatusTripId && method === "GET") {
    const response = consumeAnalysisStatusResponse(analysisStatusTripId);

    if (response.body.status === "completed" && state.outputs[analysisStatusTripId]) {
      state.outputAvailability[analysisStatusTripId] = true;
    }

    return jsonResponse(response.body, response.status ?? 200);
  }

  if (pathname === "/api/outputs" && method === "POST") {
    return jsonResponse({
      status: "saved",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
    });
  }

  const outputTripIdFromPath = readOutputTripIdFromPath(pathname);

  if (outputTripIdFromPath && method === "GET") {
    const output = state.outputs[outputTripIdFromPath];

    if (!output || !state.outputAvailability[outputTripIdFromPath]) {
      return jsonResponse(
        {
          status: "failed",
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: `분석 결과 파일을 찾을 수 없습니다: ${outputTripIdFromPath}`,
          },
        },
        404,
      );
    }

    return jsonResponse(output);
  }

  const archiveTripMatch = pathname.match(/^\/api\/trips\/([^/]+)\/archive$/u);

  if (archiveTripMatch && method === "POST") {
    const tripId = archiveTripMatch[1];
    const trip = state.tripDetails[tripId];

    if (!trip) {
      return jsonResponse(
        {
          status: "failed",
          error: {
            code: "TRIP_NOT_FOUND",
            message: `trip 파일을 찾을 수 없습니다: ${tripId}`,
          },
        },
        404,
      );
    }

    const nextHistory = createHistoryRecord({
      history_id: tripId,
      source_trip_id: tripId,
      title: trip.title,
      date: trip.date,
      location: trip.location,
      companion_ids: trip.party.companion_ids,
      attendee_count: trip.party.companion_ids.length,
      notes: trip.notes,
      trip_snapshot: trip,
      output_path: state.outputs[tripId]?.output_path ?? null,
      companion_snapshots: state.companions.filter((item) =>
        trip.party.companion_ids.includes(item.id),
      ),
      vehicle_snapshot: trip.vehicle
        ? {
            id: trip.vehicle.id ?? "archived-vehicle",
            name: trip.vehicle.name ?? "보관 차량",
            notes: trip.vehicle.notes ?? [],
            ...(typeof trip.vehicle.passenger_capacity === "number"
              ? { passenger_capacity: trip.vehicle.passenger_capacity }
              : {}),
            ...(typeof trip.vehicle.load_capacity_kg === "number"
              ? { load_capacity_kg: trip.vehicle.load_capacity_kg }
              : {}),
          }
        : null,
    });

    state.history = [nextHistory, ...state.history];
    state.trips = state.trips.filter((item) => item.trip_id !== tripId);
    delete state.tripDetails[tripId];

    return jsonResponse({ item: nextHistory });
  }

  const assistantMatch = pathname.match(/^\/api\/trips\/([^/]+)\/assistant$/u);

  if (assistantMatch && method === "POST") {
    return jsonResponse({
      trip_id: assistantMatch[1],
      warnings: [],
      assistant_message: "### AI 보조 응답\n- 비 예보 대비 타프를 검토하세요.",
      actions: [],
    });
  }

  throw new Error(`Unhandled request: ${method} ${pathname}`);
}
