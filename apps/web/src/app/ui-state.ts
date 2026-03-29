import type { EquipmentSection } from "@camping/shared";
import { PAGE_KEYS, type PageKey } from "./navigation";

export const EQUIPMENT_SECTIONS: EquipmentSection[] = [
  "durable",
  "consumables",
  "precheck",
];

export const PLANNING_DETAIL_TABS = ["analysis", "assistant", "learning"] as const;
export const HISTORY_DETAIL_TABS = [
  "overview",
  "records",
  "retrospective",
  "learning",
] as const;
export const EQUIPMENT_DETAIL_TABS = ["summary", "create"] as const;
export const CATEGORY_DETAIL_TABS = ["create", "guidelines", "backup"] as const;
export const DASHBOARD_PAGE_TABS = ["overview", "actions", "links"] as const;
export const COMPANION_PAGE_TABS = ["list", "editor"] as const;
export const VEHICLE_PAGE_TABS = ["list", "editor"] as const;
export const EQUIPMENT_PAGE_TABS = ["list", "details"] as const;
export const CATEGORY_PAGE_TABS = ["list", "details"] as const;
export const HELP_PAGE_TABS = ["files", "guide"] as const;
export const PLANNING_PAGE_TABS = ["list", "editor", "details"] as const;
export const HISTORY_PAGE_TABS = ["list", "details"] as const;
export const LINK_PAGE_TABS = ["list", "editor"] as const;

const UI_STATE_STORAGE_KEY = "camping.ui-state";

export type DashboardPageTab = (typeof DASHBOARD_PAGE_TABS)[number];
export type CompanionPageTab = (typeof COMPANION_PAGE_TABS)[number];
export type VehiclePageTab = (typeof VEHICLE_PAGE_TABS)[number];
export type EquipmentPageTab = (typeof EQUIPMENT_PAGE_TABS)[number];
export type CategoryPageTab = (typeof CATEGORY_PAGE_TABS)[number];
export type HelpPageTab = (typeof HELP_PAGE_TABS)[number];
export type PlanningPageTab = (typeof PLANNING_PAGE_TABS)[number];
export type HistoryPageTab = (typeof HISTORY_PAGE_TABS)[number];
export type LinkPageTab = (typeof LINK_PAGE_TABS)[number];
export type PlanningDetailTab = (typeof PLANNING_DETAIL_TABS)[number];
export type HistoryDetailTab = (typeof HISTORY_DETAIL_TABS)[number];
export type EquipmentDetailTab = (typeof EQUIPMENT_DETAIL_TABS)[number];
export type CategoryDetailTab = (typeof CATEGORY_DETAIL_TABS)[number];

export const DASHBOARD_PAGE_TAB_LABELS: Record<DashboardPageTab, string> = {
  overview: "운영 요약",
  actions: "빠른 실행",
  links: "최근 기록",
};
export const COMPANION_PAGE_TAB_LABELS: Record<CompanionPageTab, string> = {
  editor: "프로필 편집",
  list: "사람 목록",
};
export const VEHICLE_PAGE_TAB_LABELS: Record<VehiclePageTab, string> = {
  editor: "차량 편집",
  list: "차량 목록",
};
export const EQUIPMENT_PAGE_TAB_LABELS: Record<EquipmentPageTab, string> = {
  list: "장비 목록",
  details: "상세 작업",
};
export const CATEGORY_PAGE_TAB_LABELS: Record<CategoryPageTab, string> = {
  list: "카테고리 목록",
  details: "보조 작업",
};
export const HELP_PAGE_TAB_LABELS: Record<HelpPageTab, string> = {
  files: "파일 안내",
  guide: "운영 메모",
};
export const PLANNING_PAGE_TAB_LABELS: Record<PlanningPageTab, string> = {
  editor: "원본 입력",
  list: "계획 목록",
  details: "AI·결과",
};
export const HISTORY_PAGE_TAB_LABELS: Record<HistoryPageTab, string> = {
  details: "상세 보기",
  list: "히스토리 목록",
};
export const LINK_PAGE_TAB_LABELS: Record<LinkPageTab, string> = {
  list: "링크 목록",
  editor: "새 링크",
};
export const PLANNING_DETAIL_TAB_LABELS: Record<PlanningDetailTab, string> = {
  analysis: "분석 결과",
  assistant: "AI 보조",
  learning: "누적 학습",
};
export const HISTORY_DETAIL_TAB_LABELS: Record<HistoryDetailTab, string> = {
  overview: "요약",
  retrospective: "후기 작성",
  learning: "학습",
  records: "기록/결과",
};
export const EQUIPMENT_DETAIL_TAB_LABELS: Record<EquipmentDetailTab, string> = {
  summary: "작업 요약",
  create: "항목 추가",
};
export const CATEGORY_DETAIL_TAB_LABELS: Record<CategoryDetailTab, string> = {
  create: "새 카테고리",
  guidelines: "관리 원칙",
  backup: "로컬 백업",
};

export type PersistedUiState = {
  activePage: PageKey;
  selectedTripId: string | null;
  selectedHistoryId: string | null;
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
};

export function readPersistedUiState(): PersistedUiState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(UI_STATE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    if (!hasKnownUiStateKey(parsed)) {
      return null;
    }

    return {
      activePage: isPageKey(parsed.activePage) ? parsed.activePage : "dashboard",
      selectedTripId:
        typeof parsed.selectedTripId === "string" ? parsed.selectedTripId : null,
      selectedHistoryId:
        typeof parsed.selectedHistoryId === "string" ? parsed.selectedHistoryId : null,
      equipmentSection: isEquipmentSection(parsed.equipmentSection)
        ? parsed.equipmentSection
        : "durable",
      dashboardPageTab: isDashboardPageTab(parsed.dashboardPageTab)
        ? parsed.dashboardPageTab
        : "overview",
      companionPageTab: isCompanionPageTab(parsed.companionPageTab)
        ? parsed.companionPageTab
        : "list",
      vehiclePageTab: isVehiclePageTab(parsed.vehiclePageTab)
        ? parsed.vehiclePageTab
        : "list",
      equipmentPageTab: isEquipmentPageTab(parsed.equipmentPageTab)
        ? parsed.equipmentPageTab
        : "list",
      categoryPageTab: isCategoryPageTab(parsed.categoryPageTab)
        ? parsed.categoryPageTab
        : "list",
      helpPageTab: isHelpPageTab(parsed.helpPageTab) ? parsed.helpPageTab : "files",
      planningPageTab: isPlanningPageTab(parsed.planningPageTab)
        ? parsed.planningPageTab
        : "list",
      historyPageTab: isHistoryPageTab(parsed.historyPageTab)
        ? parsed.historyPageTab
        : "list",
      linkPageTab: isLinkPageTab(parsed.linkPageTab) ? parsed.linkPageTab : "list",
      planningDetailTab: isPlanningDetailTab(parsed.planningDetailTab)
        ? parsed.planningDetailTab
        : "analysis",
      historyDetailTab: isHistoryDetailTab(parsed.historyDetailTab)
        ? parsed.historyDetailTab
        : "overview",
      equipmentDetailTab: isEquipmentDetailTab(parsed.equipmentDetailTab)
        ? parsed.equipmentDetailTab
        : "summary",
      categoryDetailTab: isCategoryDetailTab(parsed.categoryDetailTab)
        ? parsed.categoryDetailTab
        : "create",
    };
  } catch {
    return null;
  }
}

export function writePersistedUiState(state: PersistedUiState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write failures so the app remains usable.
  }
}

function isEquipmentSection(value: unknown): value is EquipmentSection {
  return value === "durable" || value === "consumables" || value === "precheck";
}

function isPageKey(value: unknown): value is PageKey {
  return typeof value === "string" && PAGE_KEYS.includes(value as PageKey);
}

function hasKnownUiStateKey(value: Partial<PersistedUiState>) {
  return (
    "activePage" in value ||
    "selectedTripId" in value ||
    "selectedHistoryId" in value ||
    "equipmentSection" in value ||
    "dashboardPageTab" in value ||
    "companionPageTab" in value ||
    "vehiclePageTab" in value ||
    "equipmentPageTab" in value ||
    "categoryPageTab" in value ||
    "helpPageTab" in value ||
    "planningPageTab" in value ||
    "historyPageTab" in value ||
    "linkPageTab" in value ||
    "planningDetailTab" in value ||
    "historyDetailTab" in value ||
    "equipmentDetailTab" in value ||
    "categoryDetailTab" in value
  );
}

function isDashboardPageTab(value: unknown): value is DashboardPageTab {
  return typeof value === "string" && DASHBOARD_PAGE_TABS.includes(value as DashboardPageTab);
}

function isCompanionPageTab(value: unknown): value is CompanionPageTab {
  return typeof value === "string" && COMPANION_PAGE_TABS.includes(value as CompanionPageTab);
}

function isVehiclePageTab(value: unknown): value is VehiclePageTab {
  return typeof value === "string" && VEHICLE_PAGE_TABS.includes(value as VehiclePageTab);
}

function isEquipmentPageTab(value: unknown): value is EquipmentPageTab {
  return typeof value === "string" && EQUIPMENT_PAGE_TABS.includes(value as EquipmentPageTab);
}

function isCategoryPageTab(value: unknown): value is CategoryPageTab {
  return typeof value === "string" && CATEGORY_PAGE_TABS.includes(value as CategoryPageTab);
}

function isHelpPageTab(value: unknown): value is HelpPageTab {
  return typeof value === "string" && HELP_PAGE_TABS.includes(value as HelpPageTab);
}

function isPlanningPageTab(value: unknown): value is PlanningPageTab {
  return typeof value === "string" && PLANNING_PAGE_TABS.includes(value as PlanningPageTab);
}

function isHistoryPageTab(value: unknown): value is HistoryPageTab {
  return typeof value === "string" && HISTORY_PAGE_TABS.includes(value as HistoryPageTab);
}

function isLinkPageTab(value: unknown): value is LinkPageTab {
  return typeof value === "string" && LINK_PAGE_TABS.includes(value as LinkPageTab);
}

function isPlanningDetailTab(value: unknown): value is PlanningDetailTab {
  return typeof value === "string" && PLANNING_DETAIL_TABS.includes(value as PlanningDetailTab);
}

function isHistoryDetailTab(value: unknown): value is HistoryDetailTab {
  return typeof value === "string" && HISTORY_DETAIL_TABS.includes(value as HistoryDetailTab);
}

function isEquipmentDetailTab(value: unknown): value is EquipmentDetailTab {
  return typeof value === "string" && EQUIPMENT_DETAIL_TABS.includes(value as EquipmentDetailTab);
}

function isCategoryDetailTab(value: unknown): value is CategoryDetailTab {
  return typeof value === "string" && CATEGORY_DETAIL_TABS.includes(value as CategoryDetailTab);
}
