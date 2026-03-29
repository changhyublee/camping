import type {
  EquipmentCatalog,
  EquipmentCategoriesData,
  EquipmentCategory,
  EquipmentSection,
} from "@camping/shared";
import { EQUIPMENT_SECTIONS } from "./ui-state";
import type {
  EquipmentCategorySelectionDrafts,
  SectionTrackedIds,
} from "./view-model-types";
import { createEmptySectionTrackedIds } from "./view-model-drafts";

export function resolveCategorySelection(
  currentValue: string,
  categories: EquipmentCategory[],
): string {
  if (categories.some((item) => item.id === currentValue)) {
    return currentValue;
  }

  return categories[0]?.id ?? currentValue;
}

export function buildEquipmentCategoryOptions(
  categories: EquipmentCategory[],
  currentValue?: string,
) {
  return mergeEquipmentCategories(categories, currentValue ? [currentValue] : []);
}

export function buildEquipmentCategoryGroups<T extends { category: string }>(
  items: T[],
  categories: EquipmentCategory[],
) {
  const itemsByCategory = new Map<string, T[]>();

  for (const item of items) {
    const groupedItems = itemsByCategory.get(item.category) ?? [];
    groupedItems.push(item);
    itemsByCategory.set(item.category, groupedItems);
  }

  return mergeEquipmentCategories(categories, items.map((item) => item.category))
    .filter((category) => itemsByCategory.has(category.id))
    .map((category) => ({
      categoryId: category.id,
      categoryLabel: category.label,
      items: itemsByCategory.get(category.id) ?? [],
    }));
}

export function buildEquipmentCategoryIdMap(
  categories: EquipmentCategoriesData,
): SectionTrackedIds {
  return {
    durable: categories.durable.map((item) => item.id),
    consumables: categories.consumables.map((item) => item.id),
    precheck: categories.precheck.map((item) => item.id),
  };
}

export function buildVisibleEquipmentCategoryIdMap(
  catalog: EquipmentCatalog | null,
  categories: EquipmentCategoriesData,
): SectionTrackedIds {
  if (!catalog) {
    return createEmptySectionTrackedIds();
  }

  return {
    durable: buildEquipmentCategoryGroups(catalog.durable.items, categories.durable).map(
      (group) => group.categoryId,
    ),
    consumables: buildEquipmentCategoryGroups(
      catalog.consumables.items,
      categories.consumables,
    ).map((group) => group.categoryId),
    precheck: buildEquipmentCategoryGroups(catalog.precheck.items, categories.precheck).map(
      (group) => group.categoryId,
    ),
  };
}

export function buildEquipmentItemIdMap(catalog: EquipmentCatalog | null): SectionTrackedIds {
  if (!catalog) {
    return createEmptySectionTrackedIds();
  }

  return {
    durable: catalog.durable.items.map((item) => item.id),
    consumables: catalog.consumables.items.map((item) => item.id),
    precheck: catalog.precheck.items.map((item) => item.id),
  };
}

export function mergeEquipmentCategories(
  categories: EquipmentCategory[],
  extraValues: string[] = [],
) {
  const merged = [...categories];

  for (const value of extraValues) {
    if (!value || merged.some((item) => item.id === value)) {
      continue;
    }

    merged.push({
      id: value,
      label: value,
      sort_order: Math.max(0, ...merged.map((item) => item.sort_order)) + 1,
    });
  }

  return merged.sort(sortEquipmentCategories);
}

export function sortEquipmentCategories(left: EquipmentCategory, right: EquipmentCategory) {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.label.localeCompare(right.label, "ko");
}

export function toggleSectionTrackedId(
  state: SectionTrackedIds,
  section: EquipmentSection,
  value: string,
) {
  const nextValues = state[section].includes(value)
    ? state[section].filter((item) => item !== value)
    : [...state[section], value];

  return {
    ...state,
    [section]: nextValues,
  };
}

export function syncCollapsedSectionTrackedIds(
  state: SectionTrackedIds,
  nextIds: SectionTrackedIds,
  previousIds: SectionTrackedIds,
) {
  let hasChanges = false;
  const nextState = createEmptySectionTrackedIds();

  for (const section of EQUIPMENT_SECTIONS) {
    const previousIdSet = new Set(previousIds[section]);
    const collapsedIdSet = new Set(state[section]);
    const sectionState = nextIds[section].filter(
      (itemId) => !previousIdSet.has(itemId) || collapsedIdSet.has(itemId),
    );

    nextState[section] = sectionState;
    if (
      sectionState.length !== state[section].length ||
      sectionState.some((itemId, index) => itemId !== state[section][index])
    ) {
      hasChanges = true;
    }
  }

  return hasChanges ? nextState : state;
}

export function syncExpandedSectionTrackedIds(
  state: SectionTrackedIds,
  nextIds: SectionTrackedIds,
  previousIds: SectionTrackedIds,
) {
  let hasChanges = false;
  const nextState = createEmptySectionTrackedIds();

  for (const section of EQUIPMENT_SECTIONS) {
    const previousIdSet = new Set(previousIds[section]);
    const expandedIdSet = new Set(state[section]);
    const sectionState = nextIds[section].filter(
      (itemId) => previousIdSet.has(itemId) && expandedIdSet.has(itemId),
    );

    nextState[section] = sectionState;
    if (
      sectionState.length !== state[section].length ||
      sectionState.some((itemId, index) => itemId !== state[section][index])
    ) {
      hasChanges = true;
    }
  }

  return hasChanges ? nextState : state;
}

export function removeSectionTrackedId(
  state: SectionTrackedIds,
  section: EquipmentSection,
  value: string,
) {
  if (!state[section].includes(value)) {
    return state;
  }

  return {
    ...state,
    [section]: state[section].filter((item) => item !== value),
  };
}

export function ensureSectionIdTracked(
  state: SectionTrackedIds,
  section: EquipmentSection,
  value: string,
) {
  if (state[section].includes(value)) {
    return state;
  }

  return {
    ...state,
    [section]: [...state[section], value],
  };
}

export function setEquipmentCategorySelectionDraft(
  drafts: EquipmentCategorySelectionDrafts,
  section: EquipmentSection,
  itemId: string,
  categoryId: string | null,
) {
  if (!categoryId) {
    if (!(itemId in drafts[section])) {
      return drafts;
    }

    const nextSectionDrafts = { ...drafts[section] };
    delete nextSectionDrafts[itemId];

    return {
      ...drafts,
      [section]: nextSectionDrafts,
    };
  }

  if (drafts[section][itemId] === categoryId) {
    return drafts;
  }

  return {
    ...drafts,
    [section]: {
      ...drafts[section],
      [itemId]: categoryId,
    },
  };
}

export function omitDraftLabel(drafts: Record<string, string>, categoryId: string) {
  const nextDrafts = { ...drafts };
  delete nextDrafts[categoryId];
  return nextDrafts;
}

export function findEquipmentItem(
  equipment: EquipmentCatalog | null,
  section: EquipmentSection,
  itemId: string,
) {
  if (!equipment) {
    return null;
  }

  if (section === "durable") {
    return equipment.durable.items.find((item) => item.id === itemId) ?? null;
  }

  if (section === "consumables") {
    return equipment.consumables.items.find((item) => item.id === itemId) ?? null;
  }

  return equipment.precheck.items.find((item) => item.id === itemId) ?? null;
}
