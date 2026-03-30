import { useRef, useState } from "react";
import type {
  ConsumableEquipmentItemInput,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentCategoriesData,
  EquipmentSection,
  PrecheckItemInput,
} from "@camping/shared";
import { cloneEquipmentCategories } from "@camping/shared";
import type { PersistedUiState } from "../ui-state";
import type {
  CategoryDrafts,
  CategoryLabelDrafts,
  DurableMetadataJobStatusMap,
  EquipmentCategorySelectionDrafts,
  SectionTrackedIds,
} from "../view-model-types";
import {
  createEmptyCategoryDrafts,
  createEmptyCategoryLabelDrafts,
  createEmptyConsumableItem,
  createEmptyDurableItem,
  createEmptyEquipmentCategorySelectionDrafts,
  createEmptyPrecheckItem,
  createEmptySectionTrackedIds,
} from "../view-model-drafts";

export function useEquipmentState(persistedUiState: PersistedUiState | null) {
  const [equipment, setEquipment] = useState<EquipmentCatalog | null>(null);
  const [equipmentCategories, setEquipmentCategories] = useState<EquipmentCategoriesData>(
    cloneEquipmentCategories(),
  );
  const [equipmentSection, setEquipmentSection] = useState<EquipmentSection>(
    persistedUiState?.equipmentSection ?? "durable",
  );
  const [equipmentPageTab, setEquipmentPageTab] = useState(
    persistedUiState?.equipmentPageTab ?? "list",
  );
  const [categoryPageTab, setCategoryPageTab] = useState(
    persistedUiState?.categoryPageTab ?? "list",
  );
  const [equipmentDetailTab, setEquipmentDetailTab] = useState(
    persistedUiState?.equipmentDetailTab ?? "summary",
  );
  const [categoryDetailTab, setCategoryDetailTab] = useState(
    persistedUiState?.categoryDetailTab ?? "create",
  );
  const [collapsedEquipmentCategories, setCollapsedEquipmentCategories] =
    useState<SectionTrackedIds>(createEmptySectionTrackedIds());
  const [expandedEquipmentItems, setExpandedEquipmentItems] = useState<SectionTrackedIds>(
    createEmptySectionTrackedIds(),
  );
  const [collapsedCategoryEditors, setCollapsedCategoryEditors] =
    useState<SectionTrackedIds>(createEmptySectionTrackedIds());
  const [expandedCategorySections, setExpandedCategorySections] = useState<
    EquipmentSection[]
  >([]);
  const [durableMetadataJobStatuses, setDurableMetadataJobStatuses] =
    useState<DurableMetadataJobStatusMap>({});
  const [categoryDrafts, setCategoryDrafts] =
    useState<CategoryDrafts>(createEmptyCategoryDrafts());
  const [categoryLabelDrafts, setCategoryLabelDrafts] =
    useState<CategoryLabelDrafts>(createEmptyCategoryLabelDrafts());
  const [equipmentCategorySelectionDrafts, setEquipmentCategorySelectionDrafts] =
    useState<EquipmentCategorySelectionDrafts>(
      createEmptyEquipmentCategorySelectionDrafts(),
    );
  const [durableDraft, setDurableDraft] = useState<DurableEquipmentItemInput>(
    createEmptyDurableItem(),
  );
  const [consumableDraft, setConsumableDraft] =
    useState<ConsumableEquipmentItemInput>(createEmptyConsumableItem());
  const [precheckDraft, setPrecheckDraft] = useState<PrecheckItemInput>(
    createEmptyPrecheckItem(),
  );
  const durableSearchFingerprintRef = useRef<Record<string, string>>({});
  const durableMetadataJobStatusesRef = useRef<DurableMetadataJobStatusMap>({});
  const previousEquipmentGroupIdsRef = useRef<SectionTrackedIds>(
    createEmptySectionTrackedIds(),
  );
  const previousCategoryEditorIdsRef = useRef<SectionTrackedIds>(
    createEmptySectionTrackedIds(),
  );
  const previousEquipmentItemIdsRef = useRef<SectionTrackedIds>(
    createEmptySectionTrackedIds(),
  );

  return {
    equipment,
    setEquipment,
    equipmentCategories,
    setEquipmentCategories,
    equipmentSection,
    setEquipmentSection,
    equipmentPageTab,
    setEquipmentPageTab,
    categoryPageTab,
    setCategoryPageTab,
    equipmentDetailTab,
    setEquipmentDetailTab,
    categoryDetailTab,
    setCategoryDetailTab,
    collapsedEquipmentCategories,
    setCollapsedEquipmentCategories,
    expandedEquipmentItems,
    setExpandedEquipmentItems,
    collapsedCategoryEditors,
    setCollapsedCategoryEditors,
    expandedCategorySections,
    setExpandedCategorySections,
    durableMetadataJobStatuses,
    setDurableMetadataJobStatuses,
    categoryDrafts,
    setCategoryDrafts,
    categoryLabelDrafts,
    setCategoryLabelDrafts,
    equipmentCategorySelectionDrafts,
    setEquipmentCategorySelectionDrafts,
    durableDraft,
    setDurableDraft,
    consumableDraft,
    setConsumableDraft,
    precheckDraft,
    setPrecheckDraft,
    durableSearchFingerprintRef,
    durableMetadataJobStatusesRef,
    previousEquipmentGroupIdsRef,
    previousCategoryEditorIdsRef,
    previousEquipmentItemIdsRef,
  };
}
