import type {
  AnalyzeTripRequest,
  AnalyzeTripResponse,
  ConsumableEquipmentItemInput,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentSection,
  ExternalLink,
  ExternalLinkInput,
  HistoryRecord,
  PlanningAssistantResponse,
  PrecheckItemInput,
  SaveOutputRequest,
  SaveOutputResponse,
  TripData,
  TripDraft,
  TripSummary,
  ValidateTripResponse,
} from "@camping/shared";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

type EquipmentItemInput =
  | DurableEquipmentItemInput
  | ConsumableEquipmentItemInput
  | PrecheckItemInput;

export class ApiClientError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  const data = (await response.json()) as T & ApiErrorPayload;

  if (!response.ok) {
    throw new ApiClientError(
      data.error?.message ?? "API 요청에 실패했습니다.",
      data.error?.code,
    );
  }

  return data;
}

export const apiClient = {
  async getTrips(): Promise<{ items: TripSummary[] }> {
    return request("/api/trips");
  },
  async createTrip(input: TripDraft): Promise<{ trip_id: string; data: TripData }> {
    return request("/api/trips", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async getTrip(tripId: string): Promise<{ trip_id: string; data: TripData }> {
    return request(`/api/trips/${tripId}`);
  },
  async updateTrip(
    tripId: string,
    input: TripDraft,
  ): Promise<{ trip_id: string; data: TripData }> {
    return request(`/api/trips/${tripId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async deleteTrip(tripId: string): Promise<{ status: "deleted" }> {
    return request(`/api/trips/${tripId}`, {
      method: "DELETE",
    });
  },
  async archiveTrip(tripId: string): Promise<{ item: HistoryRecord }> {
    return request(`/api/trips/${tripId}/archive`, {
      method: "POST",
    });
  },
  async assistTrip(
    tripId: string,
    message: string,
  ): Promise<PlanningAssistantResponse> {
    return request(`/api/trips/${tripId}/assistant`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  },
  async validateTrip(tripId: string): Promise<ValidateTripResponse> {
    return request("/api/validate-trip", {
      method: "POST",
      body: JSON.stringify({ trip_id: tripId }),
    });
  },
  async analyzeTrip(input: AnalyzeTripRequest): Promise<AnalyzeTripResponse> {
    return request("/api/analyze-trip", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async saveOutput(input: SaveOutputRequest): Promise<SaveOutputResponse> {
    return request("/api/outputs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async getEquipment(): Promise<EquipmentCatalog> {
    return request("/api/equipment");
  },
  async createEquipmentItem(
    section: EquipmentSection,
    input: EquipmentItemInput,
  ): Promise<{ item: EquipmentItemInput }> {
    return request(`/api/equipment/${section}/items`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async updateEquipmentItem(
    section: EquipmentSection,
    itemId: string,
    input: EquipmentItemInput,
  ): Promise<{ item: EquipmentItemInput }> {
    return request(`/api/equipment/${section}/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async deleteEquipmentItem(
    section: EquipmentSection,
    itemId: string,
  ): Promise<{ status: "deleted" }> {
    return request(`/api/equipment/${section}/items/${itemId}`, {
      method: "DELETE",
    });
  },
  async getHistory(): Promise<{ items: HistoryRecord[] }> {
    return request("/api/history");
  },
  async updateHistory(
    historyId: string,
    input: HistoryRecord,
  ): Promise<{ item: HistoryRecord }> {
    return request(`/api/history/${historyId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async deleteHistory(historyId: string): Promise<{ status: "deleted" }> {
    return request(`/api/history/${historyId}`, {
      method: "DELETE",
    });
  },
  async getLinks(): Promise<{ items: ExternalLink[] }> {
    return request("/api/links");
  },
  async createLink(input: ExternalLinkInput): Promise<{ item: ExternalLink }> {
    return request("/api/links", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async updateLink(
    linkId: string,
    input: ExternalLinkInput,
  ): Promise<{ item: ExternalLink }> {
    return request(`/api/links/${linkId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  async deleteLink(linkId: string): Promise<{ status: "deleted" }> {
    return request(`/api/links/${linkId}`, {
      method: "DELETE",
    });
  },
};
