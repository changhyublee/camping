import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { App } from "./App";

const fetchMock = vi.fn<typeof fetch>();
const originalEventSource = globalThis.EventSource;

vi.stubGlobal("fetch", fetchMock);

class MockEventSource {
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

type ApiResponse<T> = {
  body: T;
  status?: number;
};

type MetadataStatusSequenceEntry =
  | ApiResponse<RefreshDurableEquipmentMetadataResponse>
  | null;

type FailedValidationResponse = {
  status: "failed";
  warnings: string[];
  error: {
    code: string;
    message: string;
  };
};

type MockState = {
  companions: Companion[];
  vehicles: Vehicle[];
  trips: TripSummary[];
  tripDetails: Record<string, TripData>;
  validations: Record<
    string,
    ApiResponse<ValidateTripResponse | FailedValidationResponse>
  >;
  analysis: ApiResponse<AnalyzeTripResponse>;
  analysisStatuses: Record<
    string,
    ApiResponse<AnalyzeTripResponse> | ApiResponse<AnalyzeTripResponse>[]
  >;
  equipment: EquipmentCatalog;
  equipmentCategories: EquipmentCategoriesData;
  history: HistoryRecord[];
  historyLearning: Record<string, HistoryLearningInsight | null>;
  userLearningProfile: UserLearningProfile | null;
  userLearningStatus: UserLearningJobStatusResponse;
  links: Array<{
    id: string;
    category: "weather" | "place" | "food" | "shopping" | "general";
    name: string;
    url: string;
    notes?: string;
    sort_order: number;
  }>;
  outputs: Record<string, GetOutputResponse>;
  outputAvailability: Record<string, boolean>;
  updateTripCalls: Array<{
    tripId: string;
    body: TripData;
  }>;
  dataBackups: DataBackupSnapshot[];
  metadataStatuses: Record<
    string,
    MetadataStatusSequenceEntry | MetadataStatusSequenceEntry[]
  >;
};

let state: MockState;
beforeEach(() => {
  state = createMockState();
  fetchMock.mockImplementation(mockFetch);
  vi.spyOn(window, "confirm").mockReturnValue(true);
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

function jsonResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body);

  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  } as Response);
}

function emptyResponse(status = 204) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("No JSON body");
    },
    text: async () => "",
  } as unknown as Response);
}

function createDeferredResponse() {
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

function parseBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") {
    return undefined;
  }

  return JSON.parse(init.body) as Record<string, unknown>;
}

function summarizeTrip(trip: TripData): TripSummary {
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

function createAnalysisResponse(
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

function createUserLearningStatus(
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

function createHistoryRecord(
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

function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
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

describe("App", () => {
  it("navigates to planning and renders analysis markdown", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    expect(await screen.findByText("4월 가평 가족 캠핑")).toBeInTheDocument();
    expect(await screen.findByText("AI 보조는 저장 후 질문할 때 사용")).toBeInTheDocument();
    expect(await screen.findByText("섹션별 분석")).toBeInTheDocument();
    expect(
      screen.getByText(
        "필요한 섹션만 먼저 수집하고, 누적된 결과를 하나의 Markdown 플랜으로 계속 합성합니다.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "예: 빠진 준비물이 있는지 먼저 점검해줘. 비 예보와 아이 동행 기준으로 알려줘",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "1. 요약",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "전체 분석 실행" }),
    );

    expect(await screen.findByText("테스트 결과")).toBeInTheDocument();
    expect(
      screen.getAllByText(".camping-data/outputs/2026-04-18-gapyeong-plan.md").length,
    ).toBeGreaterThan(0);
  });

  it("opens the planning analysis markdown in a wide layer and closes it with Escape", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));

    expect(await screen.findByText("테스트 결과")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "넓게 보기" }));

    const dialog = await screen.findByRole("dialog", {
      name: "4월 가평 가족 캠핑 분석 결과",
    });
    expect(
      within(dialog).getByText(
        "본문 폭을 넓혀 이번 캠핑의 최종 Markdown 정리본을 다시 읽는 전용 보기입니다.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(".camping-data/outputs/2026-04-18-gapyeong-plan.md"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "결과 레이어 닫기" }),
    ).toHaveFocus();

    await userEvent.tab();

    expect(
      within(dialog).getByRole("button", { name: "결과 레이어 닫기" }),
    ).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "4월 가평 가족 캠핑 분석 결과" }),
      ).toBeNull();
    });
  });

  it("keeps the planning page after remount and restores saved analysis output", async () => {
    state.outputs["2026-04-18-gapyeong"] = {
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# 저장된 분석 결과\n\n- 자동 복원",
    };
    state.outputAvailability["2026-04-18-gapyeong"] = true;

    const firstRender = render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    expect(await screen.findByText("자동 복원")).toBeInTheDocument();

    firstRender.unmount();

    render(<App />);

    expect(await screen.findByRole("button", { name: "전체 분석 실행" })).toBeInTheDocument();
    expect(await screen.findByText("자동 복원")).toBeInTheDocument();
  });

  it("restores the analyzing button state after remount when background analysis is still running", async () => {
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        activePage: "planning",
        selectedTripId: "2026-04-18-gapyeong",
        selectedHistoryId: null,
        equipmentSection: "durable",
      }),
    );
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: (() => {
        const response = createAnalysisResponse("2026-04-18-gapyeong", {
          status: "running",
          requested_at: "2026-03-24T10:00:00.000Z",
          started_at: "2026-03-24T10:00:01.000Z",
        });

        return {
          ...response,
          categories: response.categories.map((category, index) =>
            index === 0
              ? {
                  ...category,
                  status: "running",
                  requested_at: "2026-03-24T10:00:00.000Z",
                  started_at: "2026-03-24T10:00:01.000Z",
                }
              : category,
          ),
        };
      })(),
    };

    render(<App />);

    const button = await screen.findByRole("button", { name: "분석 중..." });
    expect(button).toBeDisabled();

    const sectionCollectButton = await screen.findByRole("button", { name: "선택 수집" });
    expect(sectionCollectButton).toBeEnabled();

    await userEvent.click(sectionCollectButton);

    const analyzeCalls = fetchMock.mock.calls.filter(([input]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      return new URL(rawUrl, "http://localhost").pathname === "/api/analyze-trip";
    });
    expect(analyzeCalls.length).toBeGreaterThan(0);
  });

  it("updates planning status and output immediately from SSE analysis events", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    MockEventSource.latest().open();

    const runningResponse = createAnalysisResponse("2026-04-18-gapyeong", {
      status: "running",
      requested_at: "2026-03-24T10:00:00.000Z",
      started_at: "2026-03-24T10:00:01.000Z",
      categories: createAnalysisResponse("2026-04-18-gapyeong").categories.map(
        (category, index) =>
          index === 0
            ? {
                ...category,
                status: "running",
                requested_at: "2026-03-24T10:00:00.000Z",
                started_at: "2026-03-24T10:00:01.000Z",
              }
            : category,
      ),
    });

    MockEventSource.latest().emit("analysis-status", {
      type: "analysis-status",
      status: runningResponse,
    });

    expect(await screen.findByRole("button", { name: "분석 중..." })).toBeDisabled();

    state.outputs["2026-04-18-gapyeong"] = {
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# SSE 최신 결과\n\n- 실시간으로 갱신됨",
    };
    state.outputAvailability["2026-04-18-gapyeong"] = true;

    MockEventSource.latest().emit("analysis-status", {
      type: "analysis-status",
      status: {
        ...runningResponse,
        status: "completed",
        finished_at: "2026-03-24T10:05:00.000Z",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        completed_category_count: 1,
        categories: runningResponse.categories.map((category, index) =>
          index === 0
            ? {
                ...category,
                status: "completed",
                has_result: true,
                finished_at: "2026-03-24T10:05:00.000Z",
                collected_at: "2026-03-24T10:05:00.000Z",
              }
            : category,
        ),
      },
    });

    expect(await screen.findByText("실시간으로 갱신됨")).toBeInTheDocument();
    expect(await screen.findByText("분석 완료")).toBeInTheDocument();
  });

  it("refreshes history learning and user profile from SSE user-learning events", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    state.history = [
      createHistoryRecord({
        retrospectives: [
          {
            entry_id: "retro-1",
            created_at: "2026-03-29T12:00:00.000Z",
            overall_satisfaction: 4,
            used_durable_item_ids: ["family-tent-4p"],
            unused_items: [],
            missing_or_needed_items: ["아이 여벌 옷"],
            meal_feedback: [],
            route_feedback: [],
            site_feedback: [],
            issues: ["야간 보온 준비 부족"],
            next_time_requests: ["보온 장비 보강"],
            freeform_note: "아이와 함께라 저녁 이후에는 보온이 중요했다.",
          },
        ],
      }),
    ];
    state.userLearningStatus = createUserLearningStatus({
      status: "queued",
      trigger_history_id: "2026-03-08-yangpyeong",
      requested_at: "2026-03-29T12:00:00.000Z",
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 히스토리" }));
    MockEventSource.latest().open();

    state.historyLearning["2026-03-08-yangpyeong"] = {
      history_id: "2026-03-08-yangpyeong",
      updated_at: "2026-03-29T12:05:00.000Z",
      source_entry_count: 1,
      summary: "보온과 차광을 함께 점검해야 하는 패턴이 보였다.",
      behavior_patterns: ["아이 장비를 여유 있게 챙김"],
      equipment_hints: ["타프와 방풍 장비를 먼저 확인"],
      meal_hints: [],
      route_hints: [],
      campsite_hints: [],
      avoidances: [],
      issues: ["야간 보온 준비 부족"],
      next_time_requests: ["아이 여벌 옷 추가"],
      next_trip_focus: ["보온과 차광 장비 우선 확인"],
    };
    state.userLearningProfile = {
      updated_at: "2026-03-29T12:05:00.000Z",
      source_history_ids: ["2026-03-08-yangpyeong"],
      source_entry_count: 1,
      summary: "아이 동반 기준으로 보온, 차광, 이동 여유를 중시하는 패턴이 누적됐다.",
      behavior_patterns: ["아이 장비를 여유 있게 챙김"],
      equipment_hints: ["보온 장비와 타프를 먼저 점검"],
      meal_hints: [],
      route_hints: [],
      campsite_hints: [],
      avoidances: ["강풍 노출 사이트 회피"],
      next_trip_focus: ["보온과 차광 장비 우선 확인"],
    };

    MockEventSource.latest().emit("user-learning-status", {
      type: "user-learning-status",
      status: createUserLearningStatus({
        status: "completed",
        trigger_history_id: "2026-03-08-yangpyeong",
        source_history_ids: ["2026-03-08-yangpyeong"],
        source_entry_count: 1,
        requested_at: "2026-03-29T12:00:00.000Z",
        started_at: "2026-03-29T12:00:01.000Z",
        finished_at: "2026-03-29T12:05:00.000Z",
      }),
    });

    expect(
      await screen.findByText("보온과 차광을 함께 점검해야 하는 패턴이 보였다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "아이 동반 기준으로 보온, 차광, 이동 여유를 중시하는 패턴이 누적됐다.",
      ),
    ).toBeInTheDocument();
  });

  it("does not block planning details while saved output is still loading", async () => {
    const deferredOutput = createDeferredResponse();

    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/outputs/2026-04-18-gapyeong" && method === "GET") {
        return deferredOutput.promise;
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    expect(await screen.findByDisplayValue("4월 가평 가족 캠핑")).toBeInTheDocument();

    deferredOutput.resolve({
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# 지연된 저장 결과\n\n- 나중에 도착",
    });

    expect(await screen.findByText("나중에 도착")).toBeInTheDocument();
  });

  it("does not show saved output when the trip detail request fails", async () => {
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        activePage: "planning",
        selectedTripId: "2026-04-18-gapyeong",
        selectedHistoryId: null,
        equipmentSection: "durable",
      }),
    );

    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/trips/2026-04-18-gapyeong" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_NOT_FOUND",
              message: "trip 파일을 찾을 수 없습니다: 2026-04-18-gapyeong",
            },
          },
          404,
        );
      }

      if (pathname === "/api/outputs/2026-04-18-gapyeong" && method === "GET") {
        return jsonResponse({
          trip_id: "2026-04-18-gapyeong",
          output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
          markdown: "# 남아 있는 결과\n\n- stale output",
        });
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 실패")).toBeInTheDocument();
    expect(
      screen.getByText("trip 파일을 찾을 수 없습니다: 2026-04-18-gapyeong"),
    ).toBeInTheDocument();
    expect(screen.queryByText("stale output")).toBeNull();
  });

  it("shows analysis API errors in the planning page", async () => {
    state.validations["2026-04-18-gapyeong"] = {
      body: {
        status: "ok",
        warnings: ["예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."],
      },
    };
    state.analysis = {
      status: 502,
      body: createAnalysisResponse("2026-04-18-gapyeong", {
        status: "failed",
        finished_at: "2026-03-24T10:05:00.000Z",
        error: {
          code: "OPENAI_REQUEST_FAILED",
          message: "OpenAI 분석 요청에 실패했습니다.",
        },
      }),
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    expect(
      await screen.findByText("예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));

    await waitFor(() => {
      expect(screen.getByText("분석 실패")).toBeInTheDocument();
      expect(
        screen.getByText("OpenAI 분석 요청에 실패했습니다."),
      ).toBeInTheDocument();
    });
  });

  it("keeps the previous markdown visible when background analysis fails", async () => {
    state.outputAvailability["2026-04-18-gapyeong"] = true;
    state.outputs["2026-04-18-gapyeong"] = {
      trip_id: "2026-04-18-gapyeong",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      markdown: "# 이전 분석 결과\n\n- 그대로 유지",
    };
    state.analysis = {
      body: createAnalysisResponse("2026-04-18-gapyeong", {
        status: "failed",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: "2026-03-24T10:00:05.000Z",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        error: {
          code: "OUTPUT_SAVE_FAILED",
          message: "분석 결과를 저장하지 못했습니다: 2026-04-18-gapyeong",
        },
      }),
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    expect(await screen.findByText("그대로 유지")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));

    expect(
      (
        await screen.findAllByText(
          "분석 결과를 저장하지 못했습니다: 2026-04-18-gapyeong",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("그대로 유지")).toBeInTheDocument();
  });

  it("always requests analysis with automatic output saving", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));

    const analyzeCall = fetchMock.mock.calls.find(([input]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      return new URL(rawUrl, "http://localhost").pathname === "/api/analyze-trip";
    });

    expect(analyzeCall).toBeDefined();
    expect(parseBody(analyzeCall?.[1])).toEqual(
      expect.objectContaining({
        trip_id: "2026-04-18-gapyeong",
        save_output: true,
      }),
    );
    expect(screen.queryByLabelText("분석 후 결과 저장")).toBeNull();
    expect(screen.queryByRole("button", { name: "결과 저장" })).toBeNull();
  });

  it("ignores stale analysis responses after switching to another trip", async () => {
    const deferredAnalysis = createDeferredResponse();

    state.trips.push({
      trip_id: "2026-04-20-yangyang",
      title: "양양 테스트 캠핑",
      start_date: "2026-04-20",
      region: "yangyang",
      companion_count: 1,
    });
    state.tripDetails["2026-04-20-yangyang"] = {
      version: 1,
      trip_id: "2026-04-20-yangyang",
      title: "양양 테스트 캠핑",
      date: {
        start: "2026-04-20",
        end: "2026-04-21",
      },
      location: {
        region: "yangyang",
      },
      party: {
        companion_ids: ["self"],
      },
      notes: [],
    };
    state.validations["2026-04-20-yangyang"] = {
      body: {
        status: "ok",
        warnings: [],
      },
    };

    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/analyze-trip" && method === "POST") {
        return deferredAnalysis.promise;
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(await screen.findByRole("button", { name: "전체 분석 실행" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /양양 테스트 캠핑/u }),
    );

    expect(await screen.findByDisplayValue("양양 테스트 캠핑")).toBeInTheDocument();

    deferredAnalysis.resolve({
      ...createAnalysisResponse("2026-04-18-gapyeong", {
        status: "completed",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: "2026-03-24T10:00:10.000Z",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      }),
    });

    await waitFor(() => {
      expect(screen.queryByText("이전 계획 결과")).toBeNull();
    });
    expect(screen.getByDisplayValue("양양 테스트 캠핑")).toBeInTheDocument();
  });

  it("keeps the app usable when companion loading fails on startup", async () => {
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/companions" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "companions.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 경고")).toBeInTheDocument();
    expect(
      screen.getByText("일부 데이터를 기본값 또는 빈 상태로 불러왔습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "동행자 목록을 불러오지 못했습니다. companions.yaml 형식이 올바르지 않습니다.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("운영 현황")).toBeInTheDocument();
    expect(screen.queryByText("초기 로딩 실패")).not.toBeInTheDocument();
  });

  it("shows startup warnings together when companion and category loading both fail", async () => {
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/companions" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "companions.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      if (pathname === "/api/equipment/categories" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "equipment/categories.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 경고")).toBeInTheDocument();
    expect(
      screen.getByText(
        "일부 데이터를 기본값 또는 빈 상태로 불러왔습니다.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "동행자 목록을 불러오지 못했습니다. companions.yaml 형식이 올바르지 않습니다.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "장비 카테고리를 불러오지 못했습니다. 기본 카테고리로 계속 진행합니다. equipment/categories.yaml 형식이 올바르지 않습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps startup warnings as inline banners instead of auto-dismissing toasts", async () => {
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/companions" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "companions.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 경고")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).toBeNull();

    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(6000);

    expect(screen.getByText("초기 로딩 경고")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).toBeNull();
  });

  it("renders action results as floating toasts", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.type(screen.getByPlaceholderText("예: tarp"), "storage-rack");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).not.toBeNull();
  });

  it("creates a manual data backup from the management page", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));
    await userEvent.click(screen.getByRole("button", { name: "지금 백업 생성" }));

    expect(await screen.findByText("로컬 데이터 백업 완료")).toBeInTheDocument();
    expect(
      screen.getByText(/\/workspace\/\.camping-backups\/2026-03-23T15-00-00\.000Z-1/u),
    ).toBeInTheDocument();

    const backupCall = fetchMock.mock.calls.find(([input, init]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;

      return (
        pathname === "/api/data-backups" &&
        (init?.method?.toUpperCase() ?? "GET") === "POST"
      );
    });

    expect(backupCall).toBeDefined();
  });

  it("cancels all AI jobs from the sidebar and refreshes the selected planning state", async () => {
    const runningAnalysis = createAnalysisResponse("2026-04-18-gapyeong", {
      status: "running",
      requested_at: "2026-03-24T10:00:00.000Z",
      started_at: "2026-03-24T10:00:01.000Z",
      output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
    });
    runningAnalysis.categories = runningAnalysis.categories.map((category) =>
      category.category === "equipment"
        ? {
            ...category,
            status: "running",
            requested_at: "2026-03-24T10:00:00.000Z",
            started_at: "2026-03-24T10:00:01.000Z",
          }
        : category,
    );
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: runningAnalysis,
    };
    state.metadataStatuses["family-tent"] = {
      body: {
        item_id: "family-tent",
        status: "running",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: null,
      },
    };
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        activePage: "planning",
        selectedTripId: "2026-04-18-gapyeong",
        selectedHistoryId: null,
        equipmentSection: "durable",
      }),
    );

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "모든 AI 요청 중단" }));

    expect(await screen.findByText("모든 AI 요청 중단 완료")).toBeInTheDocument();
    expect(await screen.findByText("분석 중단")).toBeInTheDocument();
    expect(
      screen.getAllByText("사용자 요청으로 모든 AI 분석을 중단했습니다.").length,
    ).toBeGreaterThan(0);

    const cancelCall = fetchMock.mock.calls.find(([input, init]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;

      return (
        pathname === "/api/ai-jobs/cancel-all" &&
        (init?.method?.toUpperCase() ?? "GET") === "POST"
      );
    });

    expect(cancelCall).toBeDefined();
  });

  it("keeps startup warning visible after a later floating toast appears", async () => {
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/companions" && method === "GET") {
        return jsonResponse(
          {
            status: "failed",
            error: {
              code: "TRIP_INVALID",
              message: "companions.yaml 형식이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      return mockFetch(input, init);
    });

    render(<App />);

    expect(await screen.findByText("초기 로딩 경고")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "카테고리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.type(screen.getByPlaceholderText("예: tarp"), "storage-rack");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    expect(screen.getByText("초기 로딩 경고")).toBeInTheDocument();
    expect(document.querySelector(".floating-status-layer")).not.toBeNull();
  });

  it("keeps an invalid trip editable and saves it to the selected trip id", async () => {
    state.trips.push({
      trip_id: "2026-04-20-broken-trip",
      title: "문제 계획",
      start_date: "2026-04-20",
      region: "yangyang",
      companion_count: 1,
    });
    state.tripDetails["2026-04-20-broken-trip"] = {
      version: 1,
      trip_id: "2026-04-20-broken-trip",
      title: "문제 계획",
      date: {
        start: "2026-04-20",
        end: "2026-04-21",
      },
      location: {
        region: "yangyang",
      },
      party: {
        companion_ids: ["ghost"],
      },
      notes: [],
    };
    state.validations["2026-04-20-broken-trip"] = {
      status: 400,
      body: {
        status: "failed",
        warnings: [],
        error: {
          code: "TRIP_INVALID",
          message: "등록되지 않은 동행자 ID가 있습니다: ghost",
        },
      },
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(await screen.findByRole("button", { name: /문제 계획/u }));

    expect(await screen.findByDisplayValue("문제 계획")).toBeInTheDocument();
    expect(
      await screen.findByText("등록되지 않은 동행자 ID가 있습니다: ghost"),
    ).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue("문제 계획");

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "문제 계획 수정");
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.updateTripCalls).toHaveLength(1);
    });

    expect(state.updateTripCalls[0]).toEqual(
      expect.objectContaining({
        tripId: "2026-04-20-broken-trip",
        body: expect.objectContaining({
          title: "문제 계획 수정",
        }),
      }),
    );
  });

  it("selects companions from the managed list and saves their ids", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.type(screen.getByPlaceholderText("새 캠핑 계획"), "선택 테스트 계획");

    await userEvent.click(screen.getByRole("checkbox", { name: /^본인/u }));
    await userEvent.click(screen.getByRole("checkbox", { name: /^첫째/u }));

    expect(
      screen.queryByText("동행자를 선택하면 요약 정보가 여기 표시됩니다."),
    ).toBeNull();
    expect(screen.getByText("self")).toBeInTheDocument();
    expect(screen.getByText("child-1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.tripDetails["2026-05-01-new-trip"]).toBeDefined();
    });

    expect(state.tripDetails["2026-05-01-new-trip"]).toEqual(
      expect.objectContaining({
        party: {
          companion_ids: ["self", "child-1"],
        },
      }),
    );
  });

  it("selects a managed vehicle and saves its snapshot with the trip", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.type(screen.getByPlaceholderText("새 캠핑 계획"), "차량 선택 테스트");

    await userEvent.selectOptions(
      screen.getByRole("combobox"),
      "family-suv",
    );
    expect(screen.getByText("탑승 5명")).toBeInTheDocument();
    expect(screen.getByText("적재 400kg")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.tripDetails["2026-05-01-new-trip"]).toBeDefined();
    });

    expect(state.tripDetails["2026-05-01-new-trip"]).toEqual(
      expect.objectContaining({
        vehicle: expect.objectContaining({
          id: "family-suv",
          name: "패밀리 SUV",
          passenger_capacity: 5,
          load_capacity_kg: 400,
        }),
      }),
    );
  });

  it("preserves spaces in trip notes while editing", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));

    const notesInput = screen.getByPlaceholderText(
      "사이트 특이사항, 출발 전 꼭 챙길 것, 당일 일정 메모, 아직 장비/링크로 옮기지 않은 임시 메모를 줄 단위로 적어두세요.",
    );

    await userEvent.clear(notesInput);
    await userEvent.type(notesInput, "텐트 옆 공간 ");

    expect(notesInput).toHaveValue("텐트 옆 공간 ");
  });

  it("removes a deleted companion from the current trip selection", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "사람 관리" }));
    await userEvent.click(screen.getByRole("button", { name: /본인 성인/u }));
    await userEvent.click(screen.getByRole("button", { name: "사람 삭제" }));

    expect(await screen.findByText("동행자 삭제 완료")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    await waitFor(() => {
      expect(state.updateTripCalls).toHaveLength(1);
    });

    expect(state.updateTripCalls[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          party: {
            companion_ids: ["child-1"],
          },
        }),
      }),
    );
  });

  it("shows which trip field failed validation when creating a trip", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 계획" }));
    await userEvent.click(screen.getByRole("button", { name: "새 계획 작성" }));
    await userEvent.click(screen.getByRole("button", { name: "계획 저장" }));

    expect(await screen.findByText("캠핑 계획 저장 실패")).toBeInTheDocument();
    expect(
      screen.getByText(
        "trip 생성 요청 형식이 올바르지 않습니다. title: 값을 입력해야 합니다.",
      ),
    ).toBeInTheDocument();
  });

  it("shows low stock threshold controls for consumables and derives stock status", async () => {
    state.equipment.consumables.items = [
      {
        id: "butane-gas",
        name: "부탄가스",
        category: "fuel",
        quantity_on_hand: 1,
        unit: "ea",
        low_stock_threshold: 2,
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("tab", { name: "소모품" }));
    await userEvent.click(screen.getByRole("button", { name: "연료 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "부탄가스 상세 펼치기" }),
    );

    expect(await screen.findAllByText("부족 기준")).toHaveLength(2);
    expect(screen.queryByRole("combobox", { name: "상태" })).toBeNull();
    expect(screen.getByText("부족")).toBeInTheDocument();
  });

  it("renders equipment sections as tabs and switches the tabpanel", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));

    const durableTab = screen.getByRole("tab", { name: "반복 장비" });
    const consumableTab = screen.getByRole("tab", { name: "소모품" });

    expect(screen.getByRole("tablist", { name: "장비 섹션" })).toBeInTheDocument();
    expect(durableTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "반복 장비" })).toBeInTheDocument();

    await userEvent.click(consumableTab);

    expect(consumableTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "소모품" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "소모품 목록" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "소모품 추가" })).toBeInTheDocument();
  });

  it("moves between equipment tabs with keyboard navigation", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));

    const durableTab = screen.getByRole("tab", { name: "반복 장비" });

    durableTab.focus();
    expect(durableTab).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "소모품" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "출발 전 점검" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "반복 장비" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: "반복 장비" })).toBeInTheDocument();
  });

  it("groups equipment by category and opens item details only when the item name row is clicked", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleeping",
        quantity: 1,
        status: "ok",
      },
      {
        id: "family-tent",
        name: "패밀리 텐트",
        category: "shelter",
        quantity: 1,
        status: "needs_repair",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));

    expect(
      screen.getByRole("button", { name: "침구 카테고리 펼치기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "침낭 상세 펼치기" })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("침낭")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "침낭 상세 펼치기" }));
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue("침낭");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "다운 침낭");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl = typeof input === "string" ? input : input.toString();
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        return (
          pathname === "/api/equipment/durable/items/sleeping-bag-3season-adult" &&
          init?.method === "PUT"
        );
      }),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "다운 침낭 상세 접기" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 접기" }));
    expect(screen.queryByRole("button", { name: /다운 침낭 상세/u })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    expect(
      await screen.findByRole("button", { name: "다운 침낭 상세 접기" }),
    ).toBeInTheDocument();
  });

  it("moves an item into the new category only after saving when the target category is collapsed", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleeping",
        quantity: 1,
        status: "ok",
      },
      {
        id: "family-tent",
        name: "패밀리 텐트",
        category: "shelter",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "침낭 상세 펼치기" }));

    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    const sleepingBagCard = screen
      .getByRole("button", { name: "침낭 상세 접기" })
      .closest("article");
    expect(sleepingBagCard).not.toBeNull();

    await userEvent.selectOptions(
      within(sleepingBagCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "shelter",
    );

    expect(
      within(sleepingBagCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("shelter");
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl = typeof input === "string" ? input : input.toString();
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        const body =
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as { category?: string })
            : null;
        return (
          pathname === "/api/equipment/durable/items/sleeping-bag-3season-adult" &&
          init?.method === "PUT" &&
          body?.category === "shelter"
        );
      }),
    ).toBe(true);
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 접기" }),
    ).toBeInTheDocument();
  });

  it("creates the target category group only after saving when the category changes", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleeping",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "침낭 상세 펼치기" }));

    const sleepingBagCard = screen
      .getByRole("button", { name: "침낭 상세 접기" })
      .closest("article");
    expect(sleepingBagCard).not.toBeNull();

    await userEvent.selectOptions(
      within(sleepingBagCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "shelter",
    );

    expect(
      within(sleepingBagCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("shelter");
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 접기" }),
    ).toBeInTheDocument();
  });

  it("shows durable metadata in the detail panel and allows manual recollection", async () => {
    state.equipment.durable.items = [
      {
        id: "family-tent",
        name: "패밀리 텐트",
        model: "리빙쉘 4P",
        purchase_link: "https://example.com/product",
        category: "shelter",
        quantity: 1,
        status: "ok",
      },
    ];
    const queuedStatus: ApiResponse<RefreshDurableEquipmentMetadataResponse> = {
      status: 202,
      body: {
        item_id: "family-tent",
        status: "queued",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: null,
        finished_at: null,
      },
    };
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";
      const currentStatus = state.metadataStatuses["family-tent"];

      if (
        (pathname === "/api/equipment/durable/metadata-statuses" ||
          pathname === "/api/equipment") &&
        method === "GET"
      ) {
        if (Array.isArray(currentStatus) && currentStatus[0] === null) {
          state.equipment.durable.items[0] = {
            ...state.equipment.durable.items[0],
            metadata: {
              lookup_status: "found",
              searched_at: "2026-03-23T12:00:00.000Z",
              query: `${state.equipment.durable.items[0].name} ${state.equipment.durable.items[0].model ?? ""}`.trim(),
              summary: "포장 크기와 설치 시간을 확인했습니다.",
              product: {
                brand: "테스트 브랜드",
                official_name: state.equipment.durable.items[0].name,
                model: state.equipment.durable.items[0].model,
              },
              packing: {
                width_cm: 68,
                depth_cm: 34,
                height_cm: 30,
                weight_kg: 14.5,
              },
              planning: {
                setup_time_minutes: 20,
                recommended_people: 2,
                capacity_people: 4,
                season_notes: ["봄, 여름, 가을 중심으로 적합"],
                weather_notes: ["우천 시 플라이를 먼저 확인"],
              },
              sources: [
                {
                  title: "테스트 상품 페이지",
                  url:
                    state.equipment.durable.items[0].purchase_link ??
                    "https://example.com/product",
                  domain: "example.com",
                },
              ],
            },
          };
        }
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "패밀리 텐트 상세 펼치기" }));
    const familyTentCard = screen
      .getByRole("button", { name: "패밀리 텐트 상세 접기" })
      .closest("article");
    expect(familyTentCard).not.toBeNull();

    const modelInput = screen.getByDisplayValue("리빙쉘 4P");

    expect(modelInput).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.com/product")).toBeInTheDocument();
    expect(screen.getByText("장비 메타데이터")).toBeInTheDocument();
    expect(screen.getByText("미수집")).toBeInTheDocument();

    await userEvent.clear(modelInput);
    await userEvent.type(modelInput, "리빙쉘 5P");
    await userEvent.selectOptions(
      within(familyTentCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "sleeping",
    );

    state.metadataStatuses["family-tent"] = [queuedStatus, null];
    fireEvent.click(screen.getByRole("button", { name: "메타데이터 재수집" }));

    expect(await screen.findByText("장비 메타데이터 수집 시작")).toBeInTheDocument();
    expect(await screen.findByText("수집 완료")).toBeInTheDocument();
    expect(screen.getByText("68 x 34 x 30 cm")).toBeInTheDocument();
    expect(screen.getByText(/검색 질의: 패밀리 텐트 리빙쉘 5P/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "테스트 상품 페이지" })).toHaveAttribute(
      "href",
      "https://example.com/product",
    );
    const updateCallIndex = fetchMock.mock.calls.findIndex(([input, init]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;

      return pathname === "/api/equipment/durable/items/family-tent" && init?.method === "PUT";
    });
    const refreshCallIndex = fetchMock.mock.calls.findIndex(([input, init]) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;

      return (
        pathname === "/api/equipment/durable/items/family-tent/metadata/refresh" &&
        init?.method === "POST"
      );
    });

    expect(updateCallIndex).toBeGreaterThanOrEqual(0);
    expect(refreshCallIndex).toBeGreaterThan(updateCallIndex);
    expect(
      parseBody(fetchMock.mock.calls[updateCallIndex]?.[1])?.model,
    ).toBe("리빙쉘 5P");
    expect(
      parseBody(fetchMock.mock.calls[updateCallIndex]?.[1])?.category,
    ).toBe("sleeping");
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl = typeof input === "string" ? input : input.toString();
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        return (
          pathname === "/api/equipment/durable/items/family-tent/metadata/refresh" &&
          init?.method === "POST"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const rawUrl = typeof input === "string" ? input : input.toString();
        const pathname = new URL(rawUrl, "http://localhost").pathname;
        return pathname === "/api/equipment/durable/metadata-statuses" && !init?.method;
      }),
    ).toBe(true);
  });

  it("updates durable metadata cards immediately from SSE completion events", async () => {
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    state.equipment.durable.items = [
      {
        id: "family-tent",
        name: "패밀리 텐트",
        model: "리빙쉘 4P",
        purchase_link: "https://example.com/product",
        category: "shelter",
        quantity: 1,
        status: "ok",
      },
    ];
    state.metadataStatuses["family-tent"] = {
      body: {
        item_id: "family-tent",
        status: "queued",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: null,
        finished_at: null,
      },
    };

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    MockEventSource.latest().open();
    await userEvent.click(screen.getByRole("button", { name: "쉘터/텐트 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "패밀리 텐트 상세 펼치기" }));

    expect(
      await screen.findByRole("button", { name: "메타데이터 수집 중..." }),
    ).toBeDisabled();

    state.equipment.durable.items[0] = {
      ...state.equipment.durable.items[0],
      metadata: {
        lookup_status: "found",
        searched_at: "2026-03-24T10:05:00.000Z",
        query: "패밀리 텐트 리빙쉘 4P",
        summary: "포장 크기와 설치 시간을 확인했습니다.",
        product: {
          brand: "테스트 브랜드",
          official_name: "패밀리 텐트",
          model: "리빙쉘 4P",
        },
        packing: {
          width_cm: 68,
          depth_cm: 34,
          height_cm: 30,
          weight_kg: 14.5,
        },
        planning: {
          setup_time_minutes: 20,
          recommended_people: 2,
          capacity_people: 4,
          season_notes: ["봄, 여름, 가을 중심으로 적합"],
          weather_notes: ["우천 시 플라이를 먼저 확인"],
        },
        sources: [
          {
            title: "테스트 상품 페이지",
            url: "https://example.com/product",
            domain: "example.com",
          },
        ],
      },
    };

    MockEventSource.latest().emit("durable-metadata-completed", {
      type: "durable-metadata-completed",
      item_id: "family-tent",
      completed_at: "2026-03-24T10:05:00.000Z",
    });

    expect(await screen.findByText("수집 완료")).toBeInTheDocument();
    expect(await screen.findByText("포장 크기와 설치 시간을 확인했습니다.")).toBeInTheDocument();
    expect(await screen.findByText("68 x 34 x 30 cm")).toBeInTheDocument();
  });

  it("moves a consumable into the new category only after saving", async () => {
    state.equipment.consumables.items = [
      {
        id: "butane-gas",
        name: "부탄가스",
        category: "fuel",
        quantity_on_hand: 2,
        unit: "ea",
      },
      {
        id: "fire-starter",
        name: "착화제",
        category: "ignition",
        quantity_on_hand: 1,
        unit: "pack",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("tab", { name: "소모품" }));
    await userEvent.click(screen.getByRole("button", { name: "연료 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "부탄가스 상세 펼치기" }));

    expect(await screen.findByDisplayValue("부탄가스")).toBeInTheDocument();

    const butaneGasCard = screen
      .getByRole("button", { name: "부탄가스 상세 접기" })
      .closest("article");
    expect(butaneGasCard).not.toBeNull();

    await userEvent.selectOptions(
      within(butaneGasCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "ignition",
    );

    expect(
      within(butaneGasCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("ignition");
    expect(await screen.findByDisplayValue("부탄가스")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "점화 카테고리 펼치기" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("부탄가스")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "점화 카테고리 접기" }),
    ).toBeInTheDocument();
  });

  it("moves a precheck item into the new category only after saving", async () => {
    state.equipment.precheck.items = [
      {
        id: "lantern-battery",
        name: "랜턴 배터리",
        category: "battery",
        status: "ok",
      },
      {
        id: "tire-pressure",
        name: "타이어 공기압",
        category: "vehicle",
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("tab", { name: "출발 전 점검" }));
    await userEvent.click(screen.getByRole("button", { name: "배터리 카테고리 펼치기" }));
    await userEvent.click(screen.getByRole("button", { name: "랜턴 배터리 상세 펼치기" }));

    expect(await screen.findByDisplayValue("랜턴 배터리")).toBeInTheDocument();

    const lanternBatteryCard = screen
      .getByRole("button", { name: "랜턴 배터리 상세 접기" })
      .closest("article");
    expect(lanternBatteryCard).not.toBeNull();

    await userEvent.selectOptions(
      within(lanternBatteryCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
      "vehicle",
    );

    expect(
      within(lanternBatteryCard as HTMLElement).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("vehicle");
    expect(await screen.findByDisplayValue("랜턴 배터리")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "차량 카테고리 펼치기" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("장비 저장 완료")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("랜턴 배터리")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "차량 카테고리 접기" })).toBeInTheDocument();
  });

  it("renders equipment categories as selects and can add a managed category", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    expect(screen.getAllByRole("combobox", { name: "카테고리" }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "카테고리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.type(screen.getByPlaceholderText("예: tarp"), "tarp");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 완료")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "수납 카테고리 설정 펼치기" }),
    ).toBeInTheDocument();
  });

  it("toggles category sections open and closed from the category management menu", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));

    expect(
      screen.queryByRole("button", { name: "쉘터/텐트 카테고리 설정 펼치기" }),
    ).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "반복 장비 섹션 펼치기" }),
    );

    expect(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 설정 펼치기" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "반복 장비 섹션 접기" }),
    );

    expect(
      screen.queryByRole("button", { name: "쉘터/텐트 카테고리 설정 펼치기" }),
    ).toBeNull();
  });

  it("requires a category code when creating a category", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 수납"), "수납");
    await userEvent.click(screen.getByRole("button", { name: "카테고리 추가" }));

    expect(await screen.findByText("장비 카테고리 추가 실패")).toBeInTheDocument();
    expect(
      screen.getByText(EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE),
    ).toBeInTheDocument();
  });

  it("keeps saved category labels in equipment selects until category save succeeds", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "카테고리 설정" }));
    await userEvent.click(
      screen.getByRole("button", { name: "반복 장비 섹션 펼치기" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "쉘터/텐트 카테고리 설정 펼치기" }),
    );

    const shelterCard = screen.getByText("shelter").closest("article");
    expect(shelterCard).not.toBeNull();

    const labelInput = within(shelterCard as HTMLElement).getByDisplayValue("쉘터/텐트");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "임시 라벨");

    expect(labelInput).toHaveValue("임시 라벨");

    await userEvent.click(screen.getByRole("button", { name: "장비 관리" }));

    expect(screen.getAllByRole("option", { name: "쉘터/텐트" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("option", { name: "임시 라벨" })).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "카테고리 설정" }));
    const durableSectionExpandButton = screen.queryByRole("button", {
      name: "반복 장비 섹션 펼치기",
    });
    if (durableSectionExpandButton) {
      await userEvent.click(durableSectionExpandButton);
    }
    const updatedShelterExpandButton = screen.queryByRole("button", {
      name: "임시 라벨 카테고리 설정 펼치기",
    });
    if (updatedShelterExpandButton) {
      await userEvent.click(updatedShelterExpandButton);
    }

    const updatedShelterCard = screen.getByText("shelter").closest("article");
    expect(updatedShelterCard).not.toBeNull();

    const updatedInput = within(updatedShelterCard as HTMLElement).getByDisplayValue(
      "임시 라벨",
    );
    await userEvent.clear(updatedInput);
    await userEvent.click(
      within(updatedShelterCard as HTMLElement).getByRole("button", { name: "저장" }),
    );

    expect(await screen.findByText("장비 카테고리 저장 실패")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "장비 관리" }));
    expect(screen.getAllByRole("option", { name: "쉘터/텐트" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("option", { name: "임시 라벨" })).toHaveLength(0);
  });

  it("deletes equipment successfully when the API returns 204", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleep",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "sleep 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "침낭 상세 펼치기" }),
    );

    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.getByText("장비 삭제 완료")).toBeInTheDocument();
    });
    expect(window.confirm).toHaveBeenCalledWith(
      "장비 항목을 삭제할까요?\ndurable / sleeping-bag-3season-adult",
    );
    expect(screen.queryByDisplayValue("침낭")).not.toBeInTheDocument();
  });

  it("shows a sync warning instead of a failure when category refresh fails after delete", async () => {
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleeping",
        quantity: 1,
        status: "ok",
      },
    ];

    let categoryGetCount = 0;
    fetchMock.mockImplementation((input, init) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/equipment/categories" && method === "GET") {
        categoryGetCount += 1;

        if (categoryGetCount >= 2) {
          return jsonResponse(
            {
              status: "failed",
              error: {
                code: "TRIP_INVALID",
                message: "equipment/categories.yaml 형식이 올바르지 않습니다.",
              },
            },
            400,
          );
        }
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "침구 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "침낭 상세 펼치기" }),
    );
    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByText("장비 삭제 완료")).toBeInTheDocument();
    expect(
      screen.getByText(
        "sleeping-bag-3season-adult / 장비 카테고리 동기화 실패: equipment/categories.yaml 형식이 올바르지 않습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("장비 삭제 실패")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("침낭")).not.toBeInTheDocument();
  });

  it("does not delete equipment when the confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    state.equipment.durable.items = [
      {
        id: "sleeping-bag-3season-adult",
        name: "침낭",
        category: "sleep",
        quantity: 1,
        status: "ok",
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "장비 관리" }));
    await userEvent.click(screen.getByRole("button", { name: "sleep 카테고리 펼치기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "침낭 상세 펼치기" }),
    );

    expect(await screen.findByDisplayValue("침낭")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "장비 항목을 삭제할까요?\ndurable / sleeping-bag-3season-adult",
    );
    expect(screen.queryByText("장비 삭제 완료")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("침낭")).toBeInTheDocument();
  });

  it("appends retrospective entries from history detail and shows queued learning state", async () => {
    state.history = [createHistoryRecord()];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 히스토리" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "자유 후기" }),
      "강풍 때문에 방풍 장비가 더 필요했다.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "후기 저장 후 학습 업데이트" }),
    );

    expect(await screen.findByText("후기 저장 완료")).toBeInTheDocument();
    expect(screen.getByText("학습 업데이트 중")).toBeInTheDocument();
    expect(state.history[0].retrospectives).toHaveLength(1);
    expect(state.userLearningStatus.status).toBe("queued");
  });

  it("opens archived output markdown from history detail", async () => {
    state.history = [
      {
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
        companion_snapshots: [
          state.companions[0],
          state.companions[1],
        ],
        attendee_count: 2,
        vehicle_snapshot: state.vehicles[0],
        notes: ["비 예보가 있어 타프를 추가함"],
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
      },
    ];
    state.outputs["2026-03-08-yangpyeong"] = {
      trip_id: "2026-03-08-yangpyeong",
      output_path: ".camping-data/outputs/2026-03-08-yangpyeong-plan.md",
      markdown: "# 양평 히스토리 결과\n\n- 타프와 난방 장비 확인",
    };
    state.outputAvailability["2026-03-08-yangpyeong"] = true;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 히스토리" }));

    expect(
      await screen.findByText(".camping-data/outputs/2026-03-08-yangpyeong-plan.md"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "결과 열기" }));

    expect(await screen.findByText("양평 히스토리 결과")).toBeInTheDocument();
    expect(screen.getByText("타프와 난방 장비 확인")).toBeInTheDocument();
  });

  it("opens archived output markdown in a wide layer from history detail", async () => {
    state.history = [
      {
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
        notes: ["비 예보가 있어 타프를 추가함"],
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
      },
    ];
    state.outputs["2026-03-08-yangpyeong"] = {
      trip_id: "2026-03-08-yangpyeong",
      output_path: ".camping-data/outputs/2026-03-08-yangpyeong-plan.md",
      markdown: "# 양평 히스토리 결과\n\n- 타프와 난방 장비 확인",
    };
    state.outputAvailability["2026-03-08-yangpyeong"] = true;

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 히스토리" }));
    await userEvent.click(await screen.findByRole("button", { name: "결과 열기" }));

    expect(await screen.findByText("양평 히스토리 결과")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "넓게 보기" }));

    const dialog = await screen.findByRole("dialog", {
      name: "3월 양평 주말 캠핑 저장 결과",
    });
    expect(
      within(dialog).getByText(
        "아카이브 당시 저장된 Markdown 결과를 넓은 폭으로 다시 확인하는 보기입니다.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(".camping-data/outputs/2026-03-08-yangpyeong-plan.md"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "결과 레이어 닫기" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "3월 양평 주말 캠핑 저장 결과" }),
      ).toBeNull();
    });
  });

  it("ignores stale history output responses after selection changes", async () => {
    state.history = [
      {
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
        companion_snapshots: [
          state.companions[0],
          state.companions[1],
        ],
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
      },
      {
        version: 1,
        history_id: "2026-04-12-sokcho",
        source_trip_id: "2026-04-12-sokcho",
        title: "4월 속초 주말 캠핑",
        date: {
          start: "2026-04-12",
          end: "2026-04-13",
        },
        location: {
          region: "sokcho",
        },
        companion_ids: ["self"],
        companion_snapshots: [state.companions[0]],
        attendee_count: 1,
        vehicle_snapshot: state.vehicles[0],
        notes: [],
        retrospectives: [],
        archived_at: "2026-04-15T09:00:00.000Z",
        output_path: ".camping-data/outputs/2026-04-12-sokcho-plan.md",
        trip_snapshot: {
          version: 1,
          trip_id: "2026-04-12-sokcho",
          title: "4월 속초 주말 캠핑",
          date: {
            start: "2026-04-12",
            end: "2026-04-13",
          },
          location: {
            region: "sokcho",
          },
          party: {
            companion_ids: ["self"],
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
      },
    ];
    state.outputs["2026-03-08-yangpyeong"] = {
      trip_id: "2026-03-08-yangpyeong",
      output_path: ".camping-data/outputs/2026-03-08-yangpyeong-plan.md",
      markdown: "# 늦게 도착한 양평 결과\n\n- stale 응답",
    };
    state.outputAvailability["2026-03-08-yangpyeong"] = true;
    state.outputs["2026-04-12-sokcho"] = {
      trip_id: "2026-04-12-sokcho",
      output_path: ".camping-data/outputs/2026-04-12-sokcho-plan.md",
      markdown: "# 속초 결과\n\n- 현재 선택 결과",
    };
    state.outputAvailability["2026-04-12-sokcho"] = true;

    let resolveDelayedOutput:
      | ((response: Response) => void)
      | undefined;

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const pathname = new URL(rawUrl, "http://localhost").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/outputs/2026-03-08-yangpyeong" && method === "GET") {
        return new Promise<Response>((resolve) => {
          resolveDelayedOutput = resolve;
        });
      }

      return mockFetch(input, init);
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "캠핑 히스토리" }));
    await userEvent.click(screen.getByRole("button", { name: "결과 열기" }));
    await userEvent.click(
      screen.getByRole("button", { name: /4월 속초 주말 캠핑/u }),
    );

    resolveDelayedOutput?.({
      ok: true,
      status: 200,
      json: async () => state.outputs["2026-03-08-yangpyeong"],
    } as Response);

    await waitFor(() => {
      expect(screen.getByDisplayValue("4월 속초 주말 캠핑")).toBeInTheDocument();
    });
    expect(screen.queryByText("늦게 도착한 양평 결과")).not.toBeInTheDocument();
  });

  it("renders external links grouped by category", async () => {
    state.links = [
      {
        id: "weather-kma",
        category: "weather",
        name: "기상청",
        url: "https://weather.go.kr",
        notes: "예보 확인",
        sort_order: 1,
      },
      {
        id: "food-map",
        category: "food",
        name: "맛집 지도",
        url: "https://example.com/food",
        notes: "근처 맛집",
        sort_order: 2,
      },
    ];

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "외부 링크" }));

    expect(await screen.findByRole("heading", { name: "날씨" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "맛집" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("기상청")).toBeInTheDocument();
    expect(screen.getByDisplayValue("맛집 지도")).toBeInTheDocument();
  });
});

function createMockState(): MockState {
  const trip: TripData = {
    version: 1,
    trip_id: "2026-04-18-gapyeong",
    title: "4월 가평 가족 캠핑",
    date: {
      start: "2026-04-18",
      end: "2026-04-19",
    },
    location: {
      campsite_name: "자라섬 캠핑장",
      region: "gapyeong",
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
    conditions: {
      electricity_available: true,
      cooking_allowed: true,
      expected_weather: {
        source: "manual",
        summary: "맑음",
      },
    },
    meal_plan: {
      use_ai_recommendation: true,
      requested_dishes: ["bbq"],
    },
    travel_plan: {
      use_ai_recommendation: true,
      requested_stops: [],
    },
    notes: [],
  };

  return {
    companions: [
      {
        id: "self",
        name: "본인",
        age_group: "adult",
        birth_year: 1990,
        health_notes: [],
        required_medications: [],
        traits: {
          cold_sensitive: false,
          heat_sensitive: false,
          rain_sensitive: false,
        },
      },
      {
        id: "child-1",
        name: "첫째",
        age_group: "preschooler",
        birth_year: 2021,
        health_notes: [],
        required_medications: [],
        traits: {
          cold_sensitive: true,
          heat_sensitive: false,
          rain_sensitive: true,
        },
      },
    ],
    vehicles: [
      {
        id: "family-suv",
        name: "패밀리 SUV",
        description: "가족 캠핑용 기본 차량",
        passenger_capacity: 5,
        load_capacity_kg: 400,
        notes: [],
      },
    ],
    trips: [summarizeTrip(trip)],
    tripDetails: {
      [trip.trip_id]: trip,
    },
    validations: {
      [trip.trip_id]: {
        body: {
          status: "ok",
          warnings: [],
        },
      },
    },
    analysis: {
      body: createAnalysisResponse("2026-04-18-gapyeong", {
        status: "completed",
        requested_at: "2026-03-24T10:00:00.000Z",
        started_at: "2026-03-24T10:00:01.000Z",
        finished_at: "2026-03-24T10:00:10.000Z",
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
      }),
    },
    analysisStatuses: {
      [trip.trip_id]: {
        body: createAnalysisResponse(trip.trip_id),
      },
    },
    equipment: {
      durable: {
        version: 1,
        items: [],
      },
      consumables: {
        version: 1,
        items: [],
      },
      precheck: {
        version: 1,
        items: [],
      },
    },
    equipmentCategories: {
      version: 1,
      durable: [
        { id: "shelter", label: "쉘터/텐트", sort_order: 1 },
        { id: "sleeping", label: "침구", sort_order: 2 },
      ],
      consumables: [
        { id: "fuel", label: "연료", sort_order: 1 },
        { id: "ignition", label: "점화", sort_order: 2 },
      ],
      precheck: [
        { id: "battery", label: "배터리", sort_order: 1 },
        { id: "vehicle", label: "차량", sort_order: 2 },
      ],
    },
    history: [],
    historyLearning: {},
    userLearningProfile: null,
    userLearningStatus: createUserLearningStatus(),
    links: [],
    outputs: {
      [trip.trip_id]: {
        trip_id: trip.trip_id,
        output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        markdown: "# 4월 가평 가족 캠핑 분석 결과\n\n## 1. 요약\n\n- 테스트 결과",
      },
    },
    outputAvailability: {},
    updateTripCalls: [],
    dataBackups: [],
    metadataStatuses: {},
  };
}
