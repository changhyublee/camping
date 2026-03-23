import type { z } from "zod";
import type {
  ageGroupSchema,
  analysisBackendSchema,
  analyzeTripRequestSchema,
  analyzeTripResponseSchema,
  apiErrorSchema,
  backendHealthSchema,
  companionIdSchema,
  companionSchema,
  companionInputSchema,
  companionsSchema,
  consumableEquipmentItemSchema,
  consumableEquipmentItemInputSchema,
  consumableEquipmentSchema,
  equipmentCategoriesSchema,
  equipmentCategoryIdSchema,
  equipmentCategoryCreateInputSchema,
  equipmentCategorySchema,
  equipmentCategoryUpdateInputSchema,
  durableEquipmentItemSchema,
  durableEquipmentItemInputSchema,
  durableEquipmentSchema,
  equipmentCatalogSchema,
  equipmentSectionSchema,
  externalLinkCategorySchema,
  externalLinkInputSchema,
  externalLinkSchema,
  externalLinksSchema,
  foodPreferencesSchema,
  getOutputResponseSchema,
  historyRecordSchema,
  planningAssistantActionSchema,
  planningAssistantRequestSchema,
  planningAssistantResponseSchema,
  precheckItemSchema,
  precheckItemInputSchema,
  precheckSchema,
  profileSchema,
  saveOutputRequestSchema,
  saveOutputResponseSchema,
  travelPreferencesSchema,
  tripDraftSchema,
  tripSchema,
  tripSummarySchema,
  validateTripRequestSchema,
  validateTripResponseSchema,
} from "./schemas";

export type AgeGroup = z.infer<typeof ageGroupSchema>;
export type ErrorCode =
  | "INVALID_TRIP_ID_FORMAT"
  | "TRIP_NOT_FOUND"
  | "TRIP_INVALID"
  | "DEPENDENCY_MISSING"
  | "OPENAI_REQUEST_FAILED"
  | "OUTPUT_SAVE_FAILED"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ProfileData = z.infer<typeof profileSchema>;
export type CompanionId = z.infer<typeof companionIdSchema>;
export type Companion = z.infer<typeof companionSchema>;
export type CompanionInput = z.infer<typeof companionInputSchema>;
export type CompanionsData = z.infer<typeof companionsSchema>;
export type DurableEquipmentItem = z.infer<typeof durableEquipmentItemSchema>;
export type DurableEquipmentItemInput = z.infer<
  typeof durableEquipmentItemInputSchema
>;
export type DurableEquipmentData = z.infer<typeof durableEquipmentSchema>;
export type EquipmentCategoryId = z.infer<typeof equipmentCategoryIdSchema>;
export type EquipmentCategory = z.infer<typeof equipmentCategorySchema>;
export type EquipmentCategoryCreateInput = z.infer<
  typeof equipmentCategoryCreateInputSchema
>;
export type EquipmentCategoryUpdateInput = z.infer<
  typeof equipmentCategoryUpdateInputSchema
>;
export type EquipmentCategoriesData = z.infer<typeof equipmentCategoriesSchema>;
export type ConsumableEquipmentItem = z.infer<
  typeof consumableEquipmentItemSchema
>;
export type ConsumableEquipmentItemInput = z.infer<
  typeof consumableEquipmentItemInputSchema
>;
export type ConsumableEquipmentData = z.infer<
  typeof consumableEquipmentSchema
>;
export type PrecheckItem = z.infer<typeof precheckItemSchema>;
export type PrecheckItemInput = z.infer<typeof precheckItemInputSchema>;
export type PrecheckData = z.infer<typeof precheckSchema>;
export type EquipmentCatalog = z.infer<typeof equipmentCatalogSchema>;
export type EquipmentSection = z.infer<typeof equipmentSectionSchema>;
export type TravelPreferencesData = z.infer<typeof travelPreferencesSchema>;
export type FoodPreferencesData = z.infer<typeof foodPreferencesSchema>;
export type TripId = z.infer<typeof tripSchema>["trip_id"];
export type TripData = z.infer<typeof tripSchema>;
export type TripDraft = z.infer<typeof tripDraftSchema>;
export type TripSummary = z.infer<typeof tripSummarySchema>;
export type HistoryRecord = z.infer<typeof historyRecordSchema>;
export type ExternalLinkCategory = z.infer<typeof externalLinkCategorySchema>;
export type ExternalLink = z.infer<typeof externalLinkSchema>;
export type ExternalLinkInput = z.infer<typeof externalLinkInputSchema>;
export type ExternalLinksData = z.infer<typeof externalLinksSchema>;
export type PlanningAssistantAction = z.infer<
  typeof planningAssistantActionSchema
>;
export type PlanningAssistantRequest = z.infer<
  typeof planningAssistantRequestSchema
>;
export type PlanningAssistantResponse = z.infer<
  typeof planningAssistantResponseSchema
>;
export type AnalyzeTripRequest = z.infer<typeof analyzeTripRequestSchema>;
export type AnalyzeTripResponse = z.infer<typeof analyzeTripResponseSchema>;
export type ValidateTripRequest = z.infer<typeof validateTripRequestSchema>;
export type ValidateTripResponse = z.infer<typeof validateTripResponseSchema>;
export type SaveOutputRequest = z.infer<typeof saveOutputRequestSchema>;
export type SaveOutputResponse = z.infer<typeof saveOutputResponseSchema>;
export type GetOutputResponse = z.infer<typeof getOutputResponseSchema>;
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
  links: ExternalLinksData;
  trip: TripData;
  caches: {
    weather: Array<{ name: string; content: unknown }>;
    places: Array<{ name: string; content: unknown }>;
  };
};
