import type {
  Companion,
  ConsumableEquipmentItemInput,
  DurableEquipmentItemInput,
  EquipmentSection,
  EquipmentCategoryCreateInput,
  ExternalLinkInput,
  HistoryRecord,
  PrecheckItemInput,
  RetrospectiveEntryInput,
  TripDraft,
  UserLearningJobStatusResponse,
  VehicleInput,
} from "@camping/shared";
import { EQUIPMENT_SECTIONS } from "./ui-state";
import {
  type CategoryDrafts,
  type CategoryLabelDrafts,
  type CommaSeparatedInputs,
  type CompanionTextInputs,
  type EquipmentCategorySelectionDrafts,
  type HistoryEditorDraft,
  type RetrospectiveDraft,
  type SectionTrackedIds,
} from "./view-model-types";
import {
  joinCommaList,
  joinLineList,
  parseInteger,
  splitLineList,
} from "./common-formatters";

export function toggleExpandedEquipmentSections(
  sections: EquipmentSection[],
  nextSection: EquipmentSection,
) {
  const nextSections = sections.includes(nextSection)
    ? sections.filter((section) => section !== nextSection)
    : [...sections, nextSection];

  return EQUIPMENT_SECTIONS.filter((section) => nextSections.includes(section));
}

export function createEmptyTripDraft(): TripDraft {
  return {
    version: 1,
    title: "",
    party: {
      companion_ids: [],
    },
    conditions: {
      electricity_available: true,
      cooking_allowed: true,
      expected_weather: {
        source: "manual",
      },
    },
    meal_plan: {
      use_ai_recommendation: true,
      requested_dishes: [],
    },
    travel_plan: {
      use_ai_recommendation: true,
      requested_stops: [],
    },
    notes: [],
  };
}

export function createEmptyCompanion(companionId = ""): Companion {
  return {
    id: companionId,
    name: companionId,
    age_group: "adult",
    health_notes: [],
    required_medications: [],
    traits: {
      cold_sensitive: false,
      heat_sensitive: false,
      rain_sensitive: false,
    },
  };
}

export function createCompanionTextInputs(
  companion: Pick<Companion, "health_notes" | "required_medications"> = {
    health_notes: [],
    required_medications: [],
  },
): CompanionTextInputs {
  return {
    healthNotes: joinLineList(companion.health_notes),
    requiredMedications: joinLineList(companion.required_medications),
  };
}

export function buildCompanionInput(
  draft: Companion,
  textInputs: CompanionTextInputs,
): Companion {
  return {
    ...draft,
    health_notes: splitLineList(textInputs.healthNotes),
    required_medications: splitLineList(textInputs.requiredMedications),
  };
}

export function createPlaceholderCompanion(companionId: string): Companion {
  return createEmptyCompanion(companionId);
}

export function createEmptyDurableItem(): DurableEquipmentItemInput {
  return {
    name: "",
    category: "shelter",
    quantity: 1,
    status: "ok",
  };
}

export function createEmptyConsumableItem(): ConsumableEquipmentItemInput {
  return {
    name: "",
    category: "fuel",
    quantity_on_hand: 0,
    unit: "pack",
    low_stock_threshold: undefined,
  };
}

export function createEmptyPrecheckItem(): PrecheckItemInput {
  return {
    name: "",
    category: "battery",
    status: "needs_check",
  };
}

export function createEmptyLink(): ExternalLinkInput {
  return {
    name: "",
    category: "weather",
    url: "https://",
    notes: "",
    sort_order: 0,
  };
}

export function createEmptyVehicle(): VehicleInput {
  return {
    id: "",
    name: "",
    description: "",
    notes: [],
  };
}

export function buildVehicleInput(
  draft: VehicleInput,
  noteInput: string,
): VehicleInput {
  return {
    ...draft,
    notes: splitLineList(noteInput),
  };
}

export function createEmptyEquipmentCategoryDraft(): EquipmentCategoryCreateInput {
  return {
    id: "",
    label: "",
  };
}

export function createEmptyCategoryDrafts(): CategoryDrafts {
  return {
    durable: createEmptyEquipmentCategoryDraft(),
    consumables: createEmptyEquipmentCategoryDraft(),
    precheck: createEmptyEquipmentCategoryDraft(),
  };
}

export function createEmptyCategoryLabelDrafts(): CategoryLabelDrafts {
  return {
    durable: {},
    consumables: {},
    precheck: {},
  };
}

export function createEmptyEquipmentCategorySelectionDrafts(): EquipmentCategorySelectionDrafts {
  return {
    durable: {},
    consumables: {},
    precheck: {},
  };
}

export function createEmptySectionTrackedIds(): SectionTrackedIds {
  return {
    durable: [],
    consumables: [],
    precheck: [],
  };
}

export function createCommaSeparatedInputs(draft?: TripDraft | null): CommaSeparatedInputs {
  return {
    requestedDishes: joinCommaList(draft?.meal_plan?.requested_dishes),
    requestedStops: joinCommaList(draft?.travel_plan?.requested_stops),
  };
}

export function buildTripDraftForSave(draft: TripDraft, noteInput: string): TripDraft {
  return {
    ...draft,
    notes: splitLineList(noteInput),
  };
}

export function createHistoryEditorDraft(history?: HistoryRecord | null): HistoryEditorDraft {
  return {
    title: history?.title ?? "",
    attendeeCount:
      typeof history?.attendee_count === "number"
        ? String(history.attendee_count)
        : history
          ? String(history.companion_ids.length)
          : "",
    notes: joinLineList(history?.notes),
  };
}

export function buildHistoryRecordForSave(
  history: HistoryRecord,
  editorDraft: HistoryEditorDraft,
): HistoryRecord {
  return {
    ...history,
    title: editorDraft.title,
    attendee_count: parseInteger(editorDraft.attendeeCount) ?? 0,
    notes: splitLineList(editorDraft.notes),
  };
}

export function createEmptyRetrospectiveDraft(): RetrospectiveDraft {
  return {
    overallSatisfaction: "",
    usedDurableItemIds: [],
    unusedItems: "",
    missingOrNeededItems: "",
    mealFeedback: "",
    routeFeedback: "",
    siteFeedback: "",
    issues: "",
    nextTimeRequests: "",
    freeformNote: "",
  };
}

export function buildRetrospectiveInput(
  draft: RetrospectiveDraft,
): RetrospectiveEntryInput {
  const overallSatisfaction = parseInteger(draft.overallSatisfaction);

  return {
    overall_satisfaction:
      typeof overallSatisfaction === "number" ? overallSatisfaction : undefined,
    used_durable_item_ids: draft.usedDurableItemIds,
    unused_items: splitLineList(draft.unusedItems),
    missing_or_needed_items: splitLineList(draft.missingOrNeededItems),
    meal_feedback: splitLineList(draft.mealFeedback),
    route_feedback: splitLineList(draft.routeFeedback),
    site_feedback: splitLineList(draft.siteFeedback),
    issues: splitLineList(draft.issues),
    next_time_requests: splitLineList(draft.nextTimeRequests),
    freeform_note: draft.freeformNote.trim() || undefined,
  };
}

export function createIdleUserLearningStatus(): UserLearningJobStatusResponse {
  return {
    status: "idle",
    trigger_history_id: null,
    source_history_ids: [],
    source_entry_count: 0,
    requested_at: null,
    started_at: null,
    finished_at: null,
  };
}
