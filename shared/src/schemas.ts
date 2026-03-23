import { z } from "zod";

export const baseIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be lowercase kebab-case");

export const equipmentCategoryIdSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    "카테고리 코드는 영문 소문자, 숫자, -, _ 만 사용할 수 있습니다.",
  );

export const ageGroupSchema = z.enum([
  "adult",
  "preschooler",
  "elementary",
  "middle_school",
  "high_school",
  "senior",
]);

export const generalStatusSchema = z.enum([
  "ok",
  "low",
  "empty",
  "needs_check",
  "needs_repair",
]);

export const tripIdSchema = baseIdSchema;
export const historyIdSchema = baseIdSchema;
export const externalLinkIdSchema = baseIdSchema;
export const companionIdSchema = baseIdSchema;
export const vehicleIdSchema = baseIdSchema;
export const equipmentSectionSchema = z.enum([
  "durable",
  "consumables",
  "precheck",
]);

export const equipmentCategorySchema = z.object({
  id: equipmentCategoryIdSchema,
  label: z.string().min(1),
  sort_order: z.number().int().nonnegative().default(0),
});

export const equipmentCategoryCreateInputSchema = equipmentCategorySchema.extend({
  sort_order: z.number().int().nonnegative().optional(),
});

export const equipmentCategoryUpdateInputSchema = equipmentCategorySchema.extend({
  id: equipmentCategoryIdSchema.optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const equipmentCategoriesSchema = z.object({
  version: z.number().int().positive(),
  durable: z.array(equipmentCategorySchema).default([]),
  consumables: z.array(equipmentCategorySchema).default([]),
  precheck: z.array(equipmentCategorySchema).default([]),
});
export const externalLinkCategorySchema = z.enum([
  "weather",
  "place",
  "food",
  "shopping",
  "general",
]);

export const profileSchema = z.object({
  version: z.number().int().positive(),
  owner: z.object({
    name: z.string().min(1),
  }),
  home_region: z.string().min(1).optional(),
  default_vehicle_id: z.string().min(1).optional(),
  default_party_size: z.number().int().positive().optional(),
  units: z
    .object({
      temperature: z.string().min(1).optional(),
      distance: z.string().min(1).optional(),
      weight: z.string().min(1).optional(),
    })
    .optional(),
});

export const companionSchema = z.object({
  id: companionIdSchema,
  name: z.string().min(1),
  age_group: ageGroupSchema,
  birth_year: z.number().int().optional(),
  health_notes: z.array(z.string()).default([]),
  required_medications: z.array(z.string()).default([]),
  traits: z
    .object({
      cold_sensitive: z.boolean().optional(),
      heat_sensitive: z.boolean().optional(),
      rain_sensitive: z.boolean().optional(),
    })
    .default({}),
});

export const companionInputSchema = companionSchema;

export const companionsSchema = z.object({
  version: z.number().int().positive(),
  companions: z.array(companionSchema),
});

export const vehicleSchema = z.object({
  id: vehicleIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  passenger_capacity: z.number().int().positive().optional(),
  load_capacity_kg: z.number().positive().optional(),
  notes: z.array(z.string()).default([]),
});

export const vehicleInputSchema = vehicleSchema;

export const vehiclesSchema = z.object({
  version: z.number().int().positive(),
  vehicles: z.array(vehicleSchema),
});

export const equipmentMetadataLookupStatusSchema = z.enum([
  "found",
  "not_found",
  "failed",
]);

export const durableEquipmentMetadataSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
});

export const durableEquipmentMetadataSchema = z.object({
  lookup_status: equipmentMetadataLookupStatusSchema,
  searched_at: z.string().min(1),
  query: z.string().min(1),
  summary: z.string().min(1).optional(),
  product: z
    .object({
      brand: z.string().min(1).optional(),
      official_name: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
    })
    .optional(),
  packing: z
    .object({
      width_cm: z.number().positive().optional(),
      depth_cm: z.number().positive().optional(),
      height_cm: z.number().positive().optional(),
      weight_kg: z.number().positive().optional(),
    })
    .optional(),
  planning: z
    .object({
      setup_time_minutes: z.number().int().positive().optional(),
      recommended_people: z.number().int().positive().optional(),
      capacity_people: z.number().int().positive().optional(),
      season_notes: z.array(z.string()).default([]),
      weather_notes: z.array(z.string()).default([]),
    })
    .optional(),
  sources: z.array(durableEquipmentMetadataSourceSchema).default([]),
});

export const durableEquipmentItemBaseSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1).optional(),
  name: z.string().min(1),
  model: z.string().min(1).optional(),
  purchase_link: z.string().url().optional(),
  category: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  capacity: z
    .object({
      people: z.number().int().positive().optional(),
    })
    .optional(),
  season_support: z
    .object({
      spring: z.boolean().optional(),
      summer: z.boolean().optional(),
      autumn: z.boolean().optional(),
      winter: z.boolean().optional(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
  status: generalStatusSchema,
  notes: z.string().optional(),
});

export const durableEquipmentItemSchema = durableEquipmentItemBaseSchema.extend({
  metadata: durableEquipmentMetadataSchema.optional(),
});

export const durableEquipmentItemInputSchema = durableEquipmentItemBaseSchema.extend({
  id: z.string().min(1).optional(),
});

export const durableEquipmentSchema = z.object({
  version: z.number().int().positive(),
  items: z.array(durableEquipmentItemSchema),
});

export const consumableEquipmentItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  quantity_on_hand: z.number().nonnegative(),
  unit: z.string().min(1),
  low_stock_threshold: z.number().nonnegative().optional(),
  status: generalStatusSchema,
});

export const consumableEquipmentItemInputSchema =
  consumableEquipmentItemSchema.extend({
    id: z.string().min(1).optional(),
  });

export const consumableEquipmentSchema = z.object({
  version: z.number().int().positive(),
  items: z.array(consumableEquipmentItemSchema),
});

export const precheckItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  status: generalStatusSchema,
  last_checked_at: z.string().optional(),
  notes: z.string().optional(),
});

export const precheckItemInputSchema = precheckItemSchema.extend({
  id: z.string().min(1).optional(),
});

export const precheckSchema = z.object({
  version: z.number().int().positive(),
  items: z.array(precheckItemSchema),
});

export const equipmentCatalogSchema = z.object({
  durable: durableEquipmentSchema,
  consumables: consumableEquipmentSchema,
  precheck: precheckSchema,
});

export const travelPreferencesSchema = z.object({
  version: z.number().int().positive(),
  travel_style: z.object({
    preferred_stop_count: z.number().int().nonnegative().optional(),
    max_extra_drive_minutes: z.number().int().nonnegative().optional(),
    avoid_heavy_traffic: z.boolean().optional(),
  }),
  interests: z.array(z.string()).default([]),
  constraints: z
    .object({
      pet_friendly_required: z.boolean().optional(),
      child_friendly_preferred: z.boolean().optional(),
      indoor_backup_needed: z.boolean().optional(),
    })
    .default({}),
});

export const foodPreferencesSchema = z.object({
  version: z.number().int().positive(),
  favorite_styles: z.array(z.string()).default([]),
  disliked_ingredients: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  meal_preferences: z
    .object({
      breakfast: z.string().optional(),
      lunch: z.string().optional(),
      dinner: z.string().optional(),
    })
    .default({}),
  cooking_preferences: z
    .object({
      preferred_difficulty: z.string().optional(),
      preferred_time_minutes: z.number().int().positive().optional(),
      prefer_hot_food_in_cold_weather: z.boolean().optional(),
    })
    .default({}),
});

export const tripSchema = z.object({
  version: z.number().int().positive(),
  trip_id: tripIdSchema,
  title: z.string().min(1),
  date: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  location: z
    .object({
      campsite_name: z.string().optional(),
      region: z.string().optional(),
      coordinates: z
        .object({
          lat: z.number(),
          lng: z.number(),
        })
        .optional(),
    })
    .optional(),
  departure: z
    .object({
      region: z.string().optional(),
    })
    .optional(),
  party: z.object({
    companion_ids: z.array(companionIdSchema).default([]),
  }),
  vehicle: z
    .object({
      id: vehicleIdSchema.optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      load_capacity_kg: z.number().positive().optional(),
      passenger_capacity: z.number().int().positive().optional(),
      notes: z.array(z.string()).default([]).optional(),
    })
    .optional(),
  conditions: z
    .object({
      electricity_available: z.boolean().optional(),
      cooking_allowed: z.boolean().optional(),
      expected_weather: z
        .object({
          source: z.string().optional(),
          summary: z.string().optional(),
          min_temp_c: z.number().optional(),
          max_temp_c: z.number().optional(),
          precipitation: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  meal_plan: z
    .object({
      use_ai_recommendation: z.boolean().optional(),
      requested_dishes: z.array(z.string()).default([]),
    })
    .optional(),
  travel_plan: z
    .object({
      use_ai_recommendation: z.boolean().optional(),
      requested_stops: z.array(z.string()).default([]),
    })
    .optional(),
  notes: z.array(z.string()).default([]).optional(),
});

export const tripDraftSchema = tripSchema.extend({
  trip_id: tripIdSchema.optional(),
});

export const tripSummarySchema = z.object({
  trip_id: tripIdSchema,
  title: z.string().min(1),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  region: z.string().optional(),
  companion_count: z.number().int().nonnegative().optional(),
});

export const historyRecordSchema = z.object({
  version: z.number().int().positive(),
  history_id: historyIdSchema,
  source_trip_id: tripIdSchema,
  title: z.string().min(1),
  date: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  location: z
    .object({
      campsite_name: z.string().optional(),
      region: z.string().optional(),
    })
    .optional(),
  companion_ids: z.array(companionIdSchema).default([]),
  companion_snapshots: z.array(companionSchema).default([]),
  attendee_count: z.number().int().nonnegative().optional(),
  vehicle_snapshot: vehicleSchema.nullable().optional(),
  notes: z.array(z.string()).default([]),
  archived_at: z.string().min(1),
  output_path: z.string().nullable().optional(),
  trip_snapshot: tripSchema,
});

export const historyUpdateSchema = historyRecordSchema;

export const externalLinkSchema = z.object({
  id: externalLinkIdSchema,
  category: externalLinkCategorySchema,
  name: z.string().min(1),
  url: z.string().url(),
  notes: z.string().optional(),
  sort_order: z.number().int().nonnegative().default(0),
});

export const externalLinkInputSchema = externalLinkSchema.extend({
  id: externalLinkIdSchema.optional(),
});

export const externalLinksSchema = z.object({
  version: z.number().int().positive(),
  items: z.array(externalLinkSchema).default([]),
});

export const planningAssistantActionSchema = z.object({
  id: z.string().min(1),
  section: equipmentSectionSchema,
  action: z.enum(["increase_quantity", "add_item", "mark_needs_check"]),
  title: z.string().min(1),
  reason: z.string().min(1),
  item_id: z.string().min(1).optional(),
  quantity_delta: z.number().int().positive().optional(),
  durable_item: durableEquipmentItemSchema.optional(),
  consumable_item: consumableEquipmentItemSchema.optional(),
  precheck_item: precheckItemSchema.optional(),
});

export const analyzeTripRequestSchema = z.object({
  trip_id: tripIdSchema,
  override_instructions: z.string().optional(),
  save_output: z.boolean().optional(),
});

export const saveOutputRequestSchema = z.object({
  trip_id: tripIdSchema,
  markdown: z.string().min(1),
});

export const validateTripRequestSchema = z.object({
  trip_id: tripIdSchema,
});

export const planningAssistantRequestSchema = z.object({
  message: z.string().min(1),
});

export const planningAssistantResponseSchema = z.object({
  trip_id: tripIdSchema,
  warnings: z.array(z.string()).default([]),
  assistant_message: z.string().min(1),
  actions: z.array(planningAssistantActionSchema).default([]),
});

export const refreshDurableEquipmentMetadataResponseSchema = z.object({
  item: durableEquipmentItemSchema,
});

export const dataBackupReasonSchema = z.enum([
  "manual",
  "startup",
  "seed-replace",
]);

export const dataBackupSnapshotSchema = z.object({
  created_at: z.string().datetime(),
  reason: dataBackupReasonSchema,
  source_path: z.string().min(1),
  backup_path: z.string().min(1),
  data_path: z.string().min(1),
});

export const apiErrorSchema = z.object({
  code: z.enum([
    "INVALID_TRIP_ID_FORMAT",
    "TRIP_NOT_FOUND",
    "TRIP_INVALID",
    "DEPENDENCY_MISSING",
    "OPENAI_REQUEST_FAILED",
    "OUTPUT_SAVE_FAILED",
    "BACKUP_FAILED",
    "RESOURCE_NOT_FOUND",
    "CONFLICT",
    "INTERNAL_ERROR",
  ]),
  message: z.string(),
});

export const analyzeTripResponseSchema = z.object({
  trip_id: tripIdSchema,
  status: z.enum(["completed", "failed"]),
  warnings: z.array(z.string()).default([]),
  markdown: z.string().optional(),
  output_path: z.string().nullable().optional(),
  error: apiErrorSchema.optional(),
});

export const validateTripResponseSchema = z.object({
  status: z.enum(["ok", "failed"]),
  warnings: z.array(z.string()).default([]),
  error: apiErrorSchema.optional(),
});

export const saveOutputResponseSchema = z.object({
  status: z.literal("saved"),
  output_path: z.string(),
});

export const getOutputResponseSchema = z.object({
  trip_id: tripIdSchema,
  output_path: z.string(),
  markdown: z.string(),
});

export const listDataBackupsResponseSchema = z.object({
  items: z.array(dataBackupSnapshotSchema).default([]),
});

export const createDataBackupResponseSchema = z.object({
  item: dataBackupSnapshotSchema,
});

export const analysisBackendSchema = z.enum(["codex-cli", "openai"]);

export const backendHealthSchema = z.object({
  status: z.literal("ok"),
  backend: analysisBackendSchema,
  ready: z.boolean(),
  auth_status: z.enum(["ok", "missing", "unknown"]),
  model: z.string().optional(),
  message: z.string().optional(),
});
