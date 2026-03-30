import { useEffect } from "react";
import type {
  ConsumableEquipmentItemInput,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentCategoriesData,
  PrecheckItemInput,
} from "@camping/shared";
import {
  buildEquipmentCategoryIdMap,
  buildEquipmentItemIdMap,
  buildVisibleEquipmentCategoryIdMap,
  resolveCategorySelection,
  syncCollapsedSectionTrackedIds,
  syncExpandedSectionTrackedIds,
} from "../equipment-view-helpers";
import type { SectionTrackedIds } from "../view-model-types";

export function useEquipmentCategorySyncEffect(input: {
  equipmentCategories: EquipmentCategoriesData;
  setDurableDraft: React.Dispatch<React.SetStateAction<DurableEquipmentItemInput>>;
  setConsumableDraft: React.Dispatch<React.SetStateAction<ConsumableEquipmentItemInput>>;
  setPrecheckDraft: React.Dispatch<React.SetStateAction<PrecheckItemInput>>;
}) {
  useEffect(() => {
    input.setDurableDraft((current) => ({
      ...current,
      category: resolveCategorySelection(current.category, input.equipmentCategories.durable),
    }));
    input.setConsumableDraft((current) => ({
      ...current,
      category: resolveCategorySelection(
        current.category,
        input.equipmentCategories.consumables,
      ),
    }));
    input.setPrecheckDraft((current) => ({
      ...current,
      category: resolveCategorySelection(current.category, input.equipmentCategories.precheck),
    }));
  }, [
    input.equipmentCategories,
    input.setConsumableDraft,
    input.setDurableDraft,
    input.setPrecheckDraft,
  ]);
}

export function useEquipmentVisibilitySyncEffect(input: {
  equipment: EquipmentCatalog | null;
  equipmentCategories: EquipmentCategoriesData;
  previousEquipmentGroupIdsRef: React.MutableRefObject<SectionTrackedIds>;
  previousCategoryEditorIdsRef: React.MutableRefObject<SectionTrackedIds>;
  previousEquipmentItemIdsRef: React.MutableRefObject<SectionTrackedIds>;
  setCollapsedEquipmentCategories: React.Dispatch<React.SetStateAction<SectionTrackedIds>>;
  setCollapsedCategoryEditors: React.Dispatch<React.SetStateAction<SectionTrackedIds>>;
  setExpandedEquipmentItems: React.Dispatch<React.SetStateAction<SectionTrackedIds>>;
}) {
  useEffect(() => {
    const nextEquipmentGroupIds = buildVisibleEquipmentCategoryIdMap(
      input.equipment,
      input.equipmentCategories,
    );
    const previousEquipmentGroupIds = input.previousEquipmentGroupIdsRef.current;

    input.setCollapsedEquipmentCategories((current) =>
      syncCollapsedSectionTrackedIds(
        current,
        nextEquipmentGroupIds,
        previousEquipmentGroupIds,
      ),
    );
    input.previousEquipmentGroupIdsRef.current = nextEquipmentGroupIds;
  }, [
    input.equipment,
    input.equipmentCategories,
    input.previousEquipmentGroupIdsRef,
    input.setCollapsedEquipmentCategories,
  ]);

  useEffect(() => {
    const nextCategoryEditorIds = buildEquipmentCategoryIdMap(input.equipmentCategories);
    const previousCategoryEditorIds = input.previousCategoryEditorIdsRef.current;

    input.setCollapsedCategoryEditors((current) =>
      syncCollapsedSectionTrackedIds(
        current,
        nextCategoryEditorIds,
        previousCategoryEditorIds,
      ),
    );
    input.previousCategoryEditorIdsRef.current = nextCategoryEditorIds;
  }, [
    input.equipmentCategories,
    input.previousCategoryEditorIdsRef,
    input.setCollapsedCategoryEditors,
  ]);

  useEffect(() => {
    const nextItemIds = buildEquipmentItemIdMap(input.equipment);
    const previousItemIds = input.previousEquipmentItemIdsRef.current;

    input.setExpandedEquipmentItems((current) =>
      syncExpandedSectionTrackedIds(current, nextItemIds, previousItemIds),
    );
    input.previousEquipmentItemIdsRef.current = nextItemIds;
  }, [
    input.equipment,
    input.previousEquipmentItemIdsRef,
    input.setExpandedEquipmentItems,
  ]);
}
