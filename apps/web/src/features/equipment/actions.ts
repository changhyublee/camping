import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type {
  ConsumableEquipmentItemInput,
  DurableEquipmentItem,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentCategoriesData,
  EquipmentSection,
  PrecheckItemInput,
} from "@camping/shared";
import {
  EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
  EQUIPMENT_SECTION_LABELS,
} from "@camping/shared";
import { apiClient } from "../../api/client";
import { confirmDeletion } from "../../app/browser-helpers";
import { appendSyncWarnings, getErrorMessage } from "../../app/common-formatters";
import {
  buildVisibleEquipmentCategoryIdMap,
  ensureSectionIdTracked,
  findEquipmentItem,
  omitDraftLabel,
  removeSectionTrackedId,
  resolveCategorySelection,
  setEquipmentCategorySelectionDraft,
  sortEquipmentCategories,
  toDurableEquipmentInput,
  toggleSectionTrackedId,
} from "../../app/equipment-view-helpers";
import {
  createEmptyConsumableItem,
  createEmptyDurableItem,
  createEmptyEquipmentCategoryDraft,
  createEmptyPrecheckItem,
  toggleExpandedEquipmentSections,
} from "../../app/view-model-drafts";
import type {
  CategoryDrafts,
  CategoryLabelDrafts,
  EquipmentCategorySelectionDrafts,
  OperationState,
  SectionTrackedIds,
} from "../../app/view-model-types";

type BuildEquipmentActionsInput = {
  categoryDrafts: CategoryDrafts;
  categoryLabelDrafts: CategoryLabelDrafts;
  collapsedEquipmentCategories: SectionTrackedIds;
  consumableDraft: ConsumableEquipmentItemInput;
  durableDraft: DurableEquipmentItemInput;
  equipment: EquipmentCatalog | null;
  equipmentCategories: EquipmentCategoriesData;
  equipmentCategorySelectionDrafts: EquipmentCategorySelectionDrafts;
  maybeAutoRefreshDurableMetadata: (
    item: DurableEquipmentItem,
  ) => Promise<{ started: boolean; warning: string | null }>;
  precheckDraft: PrecheckItemInput;
  previousEquipmentGroupIdsRef: MutableRefObject<SectionTrackedIds>;
  refreshDurableMetadata: (
    itemId: string,
    options: { manual: boolean },
  ) => Promise<{ warning: string | null }>;
  refreshEquipmentState: (options?: {
    syncMetadataStatuses?: boolean;
  }) => Promise<string[]>;
  setCategoryDrafts: Dispatch<SetStateAction<CategoryDrafts>>;
  setCategoryLabelDrafts: Dispatch<SetStateAction<CategoryLabelDrafts>>;
  setCollapsedCategoryEditors: Dispatch<SetStateAction<SectionTrackedIds>>;
  setCollapsedEquipmentCategories: Dispatch<SetStateAction<SectionTrackedIds>>;
  setConsumableDraft: Dispatch<SetStateAction<ConsumableEquipmentItemInput>>;
  setDurableDraft: Dispatch<SetStateAction<DurableEquipmentItemInput>>;
  setEquipmentCategories: Dispatch<SetStateAction<EquipmentCategoriesData>>;
  setEquipmentCategorySelectionDrafts: Dispatch<
    SetStateAction<EquipmentCategorySelectionDrafts>
  >;
  setEquipmentSection: Dispatch<SetStateAction<EquipmentSection>>;
  setExpandedCategorySections: Dispatch<SetStateAction<EquipmentSection[]>>;
  setExpandedEquipmentItems: Dispatch<SetStateAction<SectionTrackedIds>>;
  setOperationState: Dispatch<SetStateAction<OperationState | null>>;
  setPrecheckDraft: Dispatch<SetStateAction<PrecheckItemInput>>;
};

export function buildEquipmentActions(input: BuildEquipmentActionsInput) {
  async function handleCreateEquipmentItem(section: EquipmentSection) {
    try {
      const additionalWarnings: string[] = [];
      let metadataCollectionStarted = false;

      if (section === "durable") {
        const response = await apiClient.createEquipmentItem(section, input.durableDraft);
        const metadataRefreshResult = await input.maybeAutoRefreshDurableMetadata(
          response.item as DurableEquipmentItem,
        );
        metadataCollectionStarted = metadataRefreshResult.started;
        if (metadataRefreshResult.warning) {
          additionalWarnings.push(metadataRefreshResult.warning);
        }
        input.setDurableDraft((current) => ({
          ...createEmptyDurableItem(),
          category: resolveCategorySelection(
            current.category,
            input.equipmentCategories.durable,
          ),
        }));
      }

      if (section === "consumables") {
        await apiClient.createEquipmentItem(section, input.consumableDraft);
        input.setConsumableDraft((current) => ({
          ...createEmptyConsumableItem(),
          category: resolveCategorySelection(
            current.category,
            input.equipmentCategories.consumables,
          ),
        }));
      }

      if (section === "precheck") {
        await apiClient.createEquipmentItem(section, input.precheckDraft);
        input.setPrecheckDraft((current) => ({
          ...createEmptyPrecheckItem(),
          category: resolveCategorySelection(
            current.category,
            input.equipmentCategories.precheck,
          ),
        }));
      }

      const syncWarnings = [
        ...(await input.refreshEquipmentState()),
        ...additionalWarnings,
      ];
      input.setOperationState({
        title: "장비 항목 추가 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(
          `${section} 섹션에 새 항목을 추가했습니다.${metadataCollectionStarted ? " 메타데이터 수집은 백그라운드에서 계속됩니다." : ""}`,
          syncWarnings,
        ),
      });
    } catch (error) {
      input.setOperationState({
        title: "장비 항목 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveEquipmentItem(section: EquipmentSection, itemId: string) {
    if (!input.equipment) {
      return;
    }

    try {
      const additionalWarnings: string[] = [];
      let metadataCollectionStarted = false;
      const pendingCategoryId =
        input.equipmentCategorySelectionDrafts[section][itemId] ?? null;

      if (section === "durable") {
        const item = input.equipment.durable.items.find((candidate) => candidate.id === itemId);
        if (item) {
          const itemToSave =
            pendingCategoryId && pendingCategoryId !== item.category
              ? { ...item, category: pendingCategoryId }
              : item;
          await apiClient.updateEquipmentItem(
            section,
            itemId,
            toDurableEquipmentInput(itemToSave),
          );
          const metadataRefreshResult = await input.maybeAutoRefreshDurableMetadata(
            itemToSave,
          );
          metadataCollectionStarted = metadataRefreshResult.started;
          if (metadataRefreshResult.warning) {
            additionalWarnings.push(metadataRefreshResult.warning);
          }
        }
      }

      if (section === "consumables") {
        const item = input.equipment.consumables.items.find(
          (candidate) => candidate.id === itemId,
        );
        if (item) {
          const itemToSave =
            pendingCategoryId && pendingCategoryId !== item.category
              ? { ...item, category: pendingCategoryId }
              : item;
          await apiClient.updateEquipmentItem(section, itemId, itemToSave);
        }
      }

      if (section === "precheck") {
        const item = input.equipment.precheck.items.find(
          (candidate) => candidate.id === itemId,
        );
        if (item) {
          const itemToSave =
            pendingCategoryId && pendingCategoryId !== item.category
              ? { ...item, category: pendingCategoryId }
              : item;
          await apiClient.updateEquipmentItem(section, itemId, itemToSave);
        }
      }

      if (pendingCategoryId) {
        input.setEquipmentCategorySelectionDrafts((current) =>
          setEquipmentCategorySelectionDraft(current, section, itemId, null),
        );
        input.setCollapsedEquipmentCategories((current) =>
          removeSectionTrackedId(current, section, pendingCategoryId),
        );
        input.previousEquipmentGroupIdsRef.current = ensureSectionIdTracked(
          buildVisibleEquipmentCategoryIdMap(input.equipment, input.equipmentCategories),
          section,
          pendingCategoryId,
        );
      }

      const syncWarnings = [
        ...(await input.refreshEquipmentState()),
        ...additionalWarnings,
      ];
      input.setOperationState({
        title: "장비 저장 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(
          `${itemId}${metadataCollectionStarted ? " 메타데이터 수집은 백그라운드에서 계속됩니다." : ""}`,
          syncWarnings,
        ),
      });
    } catch (error) {
      input.setOperationState({
        title: "장비 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteEquipmentItem(section: EquipmentSection, itemId: string) {
    if (!confirmDeletion(`장비 항목을 삭제할까요?\n${section} / ${itemId}`)) {
      return;
    }

    try {
      await apiClient.deleteEquipmentItem(section, itemId);
      input.setEquipmentCategorySelectionDrafts((current) =>
        setEquipmentCategorySelectionDraft(current, section, itemId, null),
      );
      const syncWarnings = await input.refreshEquipmentState();
      input.setOperationState({
        title: "장비 삭제 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(itemId, syncWarnings),
      });
    } catch (error) {
      input.setOperationState({
        title: "장비 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleRefreshDurableMetadata(itemId: string) {
    const currentItem = input.equipment?.durable.items.find((item) => item.id === itemId);
    const pendingCategoryId =
      input.equipmentCategorySelectionDrafts.durable[itemId] ?? null;

    try {
      if (currentItem) {
        const itemToSave =
          pendingCategoryId && pendingCategoryId !== currentItem.category
            ? { ...currentItem, category: pendingCategoryId }
            : currentItem;
        await apiClient.updateEquipmentItem("durable", itemId, itemToSave);

        if (pendingCategoryId) {
          input.setEquipmentCategorySelectionDrafts((current) =>
            setEquipmentCategorySelectionDraft(current, "durable", itemId, null),
          );
          input.setCollapsedEquipmentCategories((current) =>
            removeSectionTrackedId(current, "durable", pendingCategoryId),
          );
          input.previousEquipmentGroupIdsRef.current = ensureSectionIdTracked(
            buildVisibleEquipmentCategoryIdMap(input.equipment, input.equipmentCategories),
            "durable",
            pendingCategoryId,
          );
        }
      }

      await input.refreshDurableMetadata(itemId, { manual: true });
      const syncWarnings = await input.refreshEquipmentState();
      input.setOperationState({
        title: "장비 메타데이터 수집 시작",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(
          `${itemId} 메타데이터를 백그라운드에서 다시 수집합니다.`,
          syncWarnings,
        ),
      });
    } catch (error) {
      input.setOperationState({
        title: "장비 메타데이터 재수집 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  function handleToggleEquipmentCategory(section: EquipmentSection, categoryId: string) {
    input.setCollapsedEquipmentCategories((current) =>
      toggleSectionTrackedId(current, section, categoryId),
    );
  }

  function handleToggleCategoryEditor(section: EquipmentSection, categoryId: string) {
    input.setCollapsedCategoryEditors((current) =>
      toggleSectionTrackedId(current, section, categoryId),
    );
  }

  function handleToggleCategorySection(section: EquipmentSection) {
    input.setEquipmentSection(section);
    input.setExpandedCategorySections((current) =>
      toggleExpandedEquipmentSections(current, section),
    );
  }

  function handleToggleEquipmentItem(section: EquipmentSection, itemId: string) {
    input.setExpandedEquipmentItems((current) =>
      toggleSectionTrackedId(current, section, itemId),
    );
  }

  function handleChangeEquipmentItemCategory(
    section: EquipmentSection,
    itemId: string,
    categoryId: string,
  ) {
    const item = findEquipmentItem(input.equipment, section, itemId);

    if (!item) {
      return;
    }

    input.setEquipmentCategorySelectionDrafts((current) =>
      setEquipmentCategorySelectionDraft(
        current,
        section,
        itemId,
        categoryId === item.category ? null : categoryId,
      ),
    );
  }

  async function handleCreateEquipmentCategory(section: EquipmentSection) {
    const draft = input.categoryDrafts[section];
    const label = draft.label.trim();
    const manualCode = draft.id?.trim();

    if (!label) {
      input.setOperationState({
        title: "장비 카테고리 추가 실패",
        tone: "error",
        description: "카테고리 표시 이름을 입력해 주세요.",
      });
      return;
    }

    if (!manualCode) {
      input.setOperationState({
        title: "장비 카테고리 추가 실패",
        tone: "error",
        description: EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
      });
      return;
    }

    try {
      const response = await apiClient.createEquipmentCategory(section, {
        ...draft,
        id: manualCode,
        label,
      });
      input.setEquipmentSection(section);
      input.setExpandedCategorySections((current) =>
        current.includes(section)
          ? current
          : toggleExpandedEquipmentSections(current, section),
      );
      input.setEquipmentCategories((current) => ({
        ...current,
        [section]: [...current[section], response.item].sort(sortEquipmentCategories),
      }));
      input.setCategoryDrafts((current) => ({
        ...current,
        [section]: createEmptyEquipmentCategoryDraft(),
      }));
      input.setOperationState({
        title: "장비 카테고리 추가 완료",
        tone: "success",
        description: `${EQUIPMENT_SECTION_LABELS[section]} / ${response.item.label}`,
      });
    } catch (error) {
      input.setOperationState({
        title: "장비 카테고리 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveEquipmentCategory(section: EquipmentSection, categoryId: string) {
    const category = input.equipmentCategories[section].find((item) => item.id === categoryId);

    if (!category) {
      return;
    }

    try {
      const nextLabel = (input.categoryLabelDrafts[section][categoryId] ?? category.label).trim();
      const response = await apiClient.updateEquipmentCategory(section, categoryId, {
        ...category,
        label: nextLabel,
      });
      input.setEquipmentCategories((current) => ({
        ...current,
        [section]: current[section]
          .map((item) => (item.id === categoryId ? response.item : item))
          .sort(sortEquipmentCategories),
      }));
      input.setCategoryLabelDrafts((current) => ({
        ...current,
        [section]: omitDraftLabel(current[section], categoryId),
      }));
      input.setOperationState({
        title: "장비 카테고리 저장 완료",
        tone: "success",
        description: `${EQUIPMENT_SECTION_LABELS[section]} / ${response.item.label}`,
      });
    } catch (error) {
      input.setOperationState({
        title: "장비 카테고리 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteEquipmentCategory(section: EquipmentSection, categoryId: string) {
    if (
      !confirmDeletion(
        `장비 카테고리를 삭제할까요?\n${EQUIPMENT_SECTION_LABELS[section]} / ${categoryId}`,
      )
    ) {
      return;
    }

    try {
      await apiClient.deleteEquipmentCategory(section, categoryId);
      input.setEquipmentCategories((current) => ({
        ...current,
        [section]: current[section].filter((item) => item.id !== categoryId),
      }));
      input.setCategoryLabelDrafts((current) => ({
        ...current,
        [section]: omitDraftLabel(current[section], categoryId),
      }));
      input.setOperationState({
        title: "장비 카테고리 삭제 완료",
        tone: "success",
        description: `${EQUIPMENT_SECTION_LABELS[section]} / ${categoryId}`,
      });
    } catch (error) {
      input.setOperationState({
        title: "장비 카테고리 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  return {
    handleChangeEquipmentItemCategory,
    handleCreateEquipmentCategory,
    handleCreateEquipmentItem,
    handleDeleteEquipmentCategory,
    handleDeleteEquipmentItem,
    handleRefreshDurableMetadata,
    handleSaveEquipmentCategory,
    handleSaveEquipmentItem,
    handleToggleCategoryEditor,
    handleToggleCategorySection,
    handleToggleEquipmentCategory,
    handleToggleEquipmentItem,
  };
}
