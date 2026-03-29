import type {
  DurableMetadataJobStatusResponse,
  EquipmentCategoryCreateInput,
  EquipmentSection,
} from "@camping/shared";

export type OperationState = {
  title: string;
  tone: "success" | "warning" | "error";
  description: string;
  items?: string[];
};

export type CommaSeparatedInputs = {
  requestedDishes: string;
  requestedStops: string;
};

export type CompanionTextInputs = {
  healthNotes: string;
  requiredMedications: string;
};

export type HistoryEditorDraft = {
  title: string;
  attendeeCount: string;
  notes: string;
};

export type RetrospectiveDraft = {
  overallSatisfaction: string;
  usedDurableItemIds: string[];
  unusedItems: string;
  missingOrNeededItems: string;
  mealFeedback: string;
  routeFeedback: string;
  siteFeedback: string;
  issues: string;
  nextTimeRequests: string;
  freeformNote: string;
};

export type CategoryDrafts = Record<EquipmentSection, EquipmentCategoryCreateInput>;
export type CategoryLabelDrafts = Record<EquipmentSection, Record<string, string>>;
export type EquipmentCategorySelectionDrafts = Record<
  EquipmentSection,
  Record<string, string>
>;
export type SectionTrackedIds = Record<EquipmentSection, string[]>;
export type DurableMetadataJobStatusMap = Record<string, DurableMetadataJobStatusResponse>;
export type AiJobRealtimeMode = "inactive" | "sse" | "fallback";
