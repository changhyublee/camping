import type { z } from "zod";
import type {
  ageGroupSchema,
  analyzeTripRequestSchema,
  analyzeTripResponseSchema,
  apiErrorSchema,
  companionSchema,
  companionsSchema,
  consumableEquipmentSchema,
  durableEquipmentItemSchema,
  durableEquipmentSchema,
  foodPreferencesSchema,
  precheckSchema,
  profileSchema,
  saveOutputRequestSchema,
  saveOutputResponseSchema,
  travelPreferencesSchema,
  tripSchema,
  tripSummarySchema,
  validateTripRequestSchema,
  validateTripResponseSchema,
  analysisBackendSchema,
  backendHealthSchema,
} from "./schemas";

export type AgeGroup = z.infer<typeof ageGroupSchema>;
export type ErrorCode =
  | "INVALID_TRIP_ID_FORMAT"
  | "TRIP_NOT_FOUND"
  | "TRIP_INVALID"
  | "DEPENDENCY_MISSING"
  | "OPENAI_REQUEST_FAILED"
  | "OUTPUT_SAVE_FAILED"
  | "INTERNAL_ERROR";

export type ProfileData = z.infer<typeof profileSchema>;
export type Companion = z.infer<typeof companionSchema>;
export type CompanionsData = z.infer<typeof companionsSchema>;
export type DurableEquipmentItem = z.infer<typeof durableEquipmentItemSchema>;
export type DurableEquipmentData = z.infer<typeof durableEquipmentSchema>;
export type ConsumableEquipmentData = z.infer<typeof consumableEquipmentSchema>;
export type PrecheckData = z.infer<typeof precheckSchema>;
export type TravelPreferencesData = z.infer<typeof travelPreferencesSchema>;
export type FoodPreferencesData = z.infer<typeof foodPreferencesSchema>;
export type TripId = z.infer<typeof tripSchema>["trip_id"];
export type TripData = z.infer<typeof tripSchema>;
export type TripSummary = z.infer<typeof tripSummarySchema>;
export type AnalyzeTripRequest = z.infer<typeof analyzeTripRequestSchema>;
export type AnalyzeTripResponse = z.infer<typeof analyzeTripResponseSchema>;
export type ValidateTripRequest = z.infer<typeof validateTripRequestSchema>;
export type ValidateTripResponse = z.infer<typeof validateTripResponseSchema>;
export type SaveOutputRequest = z.infer<typeof saveOutputRequestSchema>;
export type SaveOutputResponse = z.infer<typeof saveOutputResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type AnalysisBackend = z.infer<typeof analysisBackendSchema>;
export type BackendHealth = z.infer<typeof backendHealthSchema>;

export type TripBundle = {
  profile: ProfileData;
  companions: CompanionsData;
  durableEquipment: DurableEquipmentData;
  consumables: ConsumableEquipmentData;
  precheck: PrecheckData;
  travelPreferences: TravelPreferencesData;
  foodPreferences: FoodPreferencesData;
  trip: TripData;
  caches: {
    weather: Array<{ name: string; content: unknown }>;
    places: Array<{ name: string; content: unknown }>;
  };
};
