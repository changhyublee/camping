import { z } from "zod";

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

export const tripIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "trip_id must be lowercase kebab-case");

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
  id: z.string().min(1),
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

export const companionsSchema = z.object({
  version: z.number().int().positive(),
  companions: z.array(companionSchema),
});

export const durableEquipmentItemSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1).optional(),
  name: z.string().min(1),
  model: z.string().min(1).optional(),
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

export const precheckSchema = z.object({
  version: z.number().int().positive(),
  items: z.array(precheckItemSchema),
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
    companion_ids: z.array(z.string()).default([]),
  }),
  vehicle: z
    .object({
      id: z.string().optional(),
      load_capacity_kg: z.number().positive().optional(),
      passenger_capacity: z.number().int().positive().optional(),
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

export const tripSummarySchema = z.object({
  trip_id: tripIdSchema,
  title: z.string().min(1),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  region: z.string().optional(),
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

export const apiErrorSchema = z.object({
  code: z.enum([
    "INVALID_TRIP_ID_FORMAT",
    "TRIP_NOT_FOUND",
    "TRIP_INVALID",
    "DEPENDENCY_MISSING",
    "OPENAI_REQUEST_FAILED",
    "OUTPUT_SAVE_FAILED",
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

export const analysisBackendSchema = z.enum(["codex-cli", "openai"]);

export const backendHealthSchema = z.object({
  status: z.literal("ok"),
  backend: analysisBackendSchema,
  ready: z.boolean(),
  auth_status: z.enum(["ok", "missing", "unknown"]),
  model: z.string().optional(),
  message: z.string().optional(),
});
