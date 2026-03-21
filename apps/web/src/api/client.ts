import type {
  AnalyzeTripRequest,
  AnalyzeTripResponse,
  SaveOutputRequest,
  SaveOutputResponse,
  TripData,
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
  async getTrip(tripId: string): Promise<{ trip_id: string; data: TripData }> {
    return request(`/api/trips/${tripId}`);
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
};
