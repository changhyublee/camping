import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { EquipmentSection } from "@camping/shared";
import { EQUIPMENT_SECTIONS } from "./ui-state";
import type {
  CategoryDetailTab,
  CategoryPageTab,
  CompanionPageTab,
  DashboardPageTab,
  EquipmentDetailTab,
  EquipmentPageTab,
  HelpPageTab,
  HistoryDetailTab,
  HistoryPageTab,
  LinkPageTab,
  PlanningDetailTab,
  PlanningPageTab,
  VehiclePageTab,
} from "./ui-state";

export function navButtonClass(active: boolean) {
  return `nav-button${active ? " nav-button--active" : ""}`;
}

export function detailTabClass(active: boolean) {
  return `segment-button${active ? " segment-button--active" : ""}`;
}

export function equipmentTabClass(active: boolean) {
  return `equipment-tab${active ? " equipment-tab--active" : ""}`;
}

export function getDetailTabId(prefix: string, tab: string) {
  return `${prefix}-tab-${tab}`;
}

export function getDetailPanelId(prefix: string, tab: string) {
  return `${prefix}-panel-${tab}`;
}

export function getEquipmentSectionTabId(section: EquipmentSection) {
  return `equipment-tab-${section}`;
}

export function getEquipmentSectionPanelId(section: EquipmentSection) {
  return `equipment-panel-${section}`;
}

export function buildActiveTabTargets(input: {
  equipmentSection: EquipmentSection;
  dashboardPageTab: DashboardPageTab;
  companionPageTab: CompanionPageTab;
  vehiclePageTab: VehiclePageTab;
  equipmentPageTab: EquipmentPageTab;
  categoryPageTab: CategoryPageTab;
  helpPageTab: HelpPageTab;
  planningPageTab: PlanningPageTab;
  historyPageTab: HistoryPageTab;
  linkPageTab: LinkPageTab;
  planningDetailTab: PlanningDetailTab;
  historyDetailTab: HistoryDetailTab;
  equipmentDetailTab: EquipmentDetailTab;
  categoryDetailTab: CategoryDetailTab;
}) {
  return {
    activeEquipmentTabId: getEquipmentSectionTabId(input.equipmentSection),
    activeEquipmentPanelId: getEquipmentSectionPanelId(input.equipmentSection),
    activeDashboardPageTabId: getDetailTabId("dashboard-page", input.dashboardPageTab),
    activeDashboardPagePanelId: getDetailPanelId(
      "dashboard-page",
      input.dashboardPageTab,
    ),
    activeCompanionPageTabId: getDetailTabId("companion-page", input.companionPageTab),
    activeCompanionPagePanelId: getDetailPanelId(
      "companion-page",
      input.companionPageTab,
    ),
    activeVehiclePageTabId: getDetailTabId("vehicle-page", input.vehiclePageTab),
    activeVehiclePagePanelId: getDetailPanelId("vehicle-page", input.vehiclePageTab),
    activeEquipmentPageTabId: getDetailTabId("equipment-page", input.equipmentPageTab),
    activeEquipmentPagePanelId: getDetailPanelId(
      "equipment-page",
      input.equipmentPageTab,
    ),
    activeCategoryPageTabId: getDetailTabId("category-page", input.categoryPageTab),
    activeCategoryPagePanelId: getDetailPanelId(
      "category-page",
      input.categoryPageTab,
    ),
    activeHelpPageTabId: getDetailTabId("help-page", input.helpPageTab),
    activeHelpPagePanelId: getDetailPanelId("help-page", input.helpPageTab),
    activePlanningPageTabId: getDetailTabId("planning-page", input.planningPageTab),
    activePlanningPagePanelId: getDetailPanelId(
      "planning-page",
      input.planningPageTab,
    ),
    activeHistoryPageTabId: getDetailTabId("history-page", input.historyPageTab),
    activeHistoryPagePanelId: getDetailPanelId(
      "history-page",
      input.historyPageTab,
    ),
    activeLinkPageTabId: getDetailTabId("link-page", input.linkPageTab),
    activeLinkPagePanelId: getDetailPanelId("link-page", input.linkPageTab),
    activePlanningDetailTabId: getDetailTabId(
      "planning-detail",
      input.planningDetailTab,
    ),
    activePlanningDetailPanelId: getDetailPanelId(
      "planning-detail",
      input.planningDetailTab,
    ),
    activeHistoryDetailTabId: getDetailTabId("history-detail", input.historyDetailTab),
    activeHistoryDetailPanelId: getDetailPanelId(
      "history-detail",
      input.historyDetailTab,
    ),
    activeEquipmentDetailTabId: getDetailTabId(
      "equipment-detail",
      input.equipmentDetailTab,
    ),
    activeEquipmentDetailPanelId: getDetailPanelId(
      "equipment-detail",
      input.equipmentDetailTab,
    ),
    activeCategoryDetailTabId: getDetailTabId(
      "category-detail",
      input.categoryDetailTab,
    ),
    activeCategoryDetailPanelId: getDetailPanelId(
      "category-detail",
      input.categoryDetailTab,
    ),
  };
}

export function getAdjacentEquipmentSection(
  section: EquipmentSection,
  offset: number,
): EquipmentSection {
  const currentIndex = EQUIPMENT_SECTIONS.indexOf(section);

  if (currentIndex === -1) {
    return section;
  }

  const nextIndex =
    (currentIndex + offset + EQUIPMENT_SECTIONS.length) % EQUIPMENT_SECTIONS.length;

  return EQUIPMENT_SECTIONS[nextIndex];
}

function getAdjacentDetailTab<T extends string>(
  tabs: readonly T[],
  currentTab: T,
  offset: number,
): T {
  const currentIndex = tabs.indexOf(currentTab);

  if (currentIndex === -1) {
    return currentTab;
  }

  const nextIndex = (currentIndex + offset + tabs.length) % tabs.length;

  return tabs[nextIndex];
}

export function handleDetailTabKeyDown<T extends string>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  tabs: readonly T[],
  currentTab: T,
  onChange: (tab: T) => void,
  prefix: string,
) {
  let nextTab: T | null = null;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextTab = getAdjacentDetailTab(tabs, currentTab, 1);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextTab = getAdjacentDetailTab(tabs, currentTab, -1);
  } else if (event.key === "Home") {
    nextTab = tabs[0];
  } else if (event.key === "End") {
    nextTab = tabs[tabs.length - 1];
  }

  if (!nextTab || nextTab === currentTab) {
    return;
  }

  event.preventDefault();
  onChange(nextTab);
  document.getElementById(getDetailTabId(prefix, nextTab))?.focus();
}
