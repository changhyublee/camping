import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement,
  ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import type {
  AiJobEvent,
  AnalyzeTripResponse,
  Companion,
  ConsumableEquipmentItem,
  ConsumableEquipmentItemInput,
  DurableMetadataJobStatus,
  DurableMetadataJobStatusResponse,
  DurableEquipmentMetadata,
  DurableEquipmentItem,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentCategoriesData,
  EquipmentCategory,
  EquipmentCategoryCreateInput,
  EquipmentSection,
  ExternalLink,
  ExternalLinkCategory,
  ExternalLinkInput,
  GetOutputResponse,
  HistoryLearningInsight,
  HistoryRecord,
  PlanningAssistantAction,
  PlanningAssistantResponse,
  PrecheckItem,
  PrecheckItemInput,
  RetrospectiveEntryInput,
  TripDraft,
  TripAnalysisCategory,
  TripAnalysisCategoryStatusResponse,
  TripSummary,
  UserLearningJobStatusResponse,
  UserLearningProfile,
  Vehicle,
  VehicleInput,
} from "@camping/shared";
import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  AGE_GROUP_LABELS,
  CONSUMABLE_STATUS_LABELS,
  DURABLE_METADATA_STATUS_LABELS,
  DURABLE_STATUS_LABELS,
  EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
  EQUIPMENT_SECTION_LABELS,
  EXTERNAL_LINK_CATEGORY_LABELS,
  PRECHECK_STATUS_LABELS,
  TRIP_ANALYSIS_CATEGORY_METADATA,
  TRIP_ANALYSIS_STATUS_LABELS,
  USER_LEARNING_STATUS_LABELS,
  getConsumableStatus,
} from "@camping/shared";
import { cloneEquipmentCategories } from "@camping/shared";
import { apiClient, ApiClientError, type AiJobEventSubscription } from "./api/client";
import { StatusBanner } from "./components/StatusBanner";

type PageKey =
  | "dashboard"
  | "planning"
  | "history"
  | "companions"
  | "vehicles"
  | "equipment"
  | "links"
  | "categories"
  | "help";

const PAGE_KEYS: PageKey[] = [
  "dashboard",
  "planning",
  "history",
  "companions",
  "vehicles",
  "equipment",
  "links",
  "categories",
  "help",
];
const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: "대시보드",
  planning: "캠핑 계획",
  history: "캠핑 히스토리",
  companions: "사람 관리",
  vehicles: "차량 관리",
  equipment: "장비 관리",
  links: "외부 링크",
  categories: "카테고리 설정",
  help: "보조 설명",
};
const NAVIGATION_GROUPS: Array<{
  title: string;
  description: string;
  items: PageKey[];
}> = [
  {
    title: "운영 허브",
    description: "현재 상태 확인과 계획 실행",
    items: ["dashboard", "planning", "history"],
  },
  {
    title: "준비 데이터",
    description: "사람, 차량, 장비와 참고 정보를 정리",
    items: ["companions", "vehicles", "equipment", "links"],
  },
  {
    title: "관리 설정",
    description: "기준 데이터와 보조 설명 관리",
    items: ["categories", "help"],
  },
];
const EQUIPMENT_SECTIONS: EquipmentSection[] = [
  "durable",
  "consumables",
  "precheck",
];
const PLANNING_DETAIL_TABS = ["analysis", "assistant", "learning"] as const;
const HISTORY_DETAIL_TABS = [
  "overview",
  "retrospective",
  "learning",
  "records",
] as const;
const EQUIPMENT_DETAIL_TABS = ["summary", "create"] as const;
const CATEGORY_DETAIL_TABS = ["create", "guidelines", "backup"] as const;
const DASHBOARD_PAGE_TABS = ["overview", "actions", "links"] as const;
const COMPANION_PAGE_TABS = ["editor", "list"] as const;
const VEHICLE_PAGE_TABS = ["editor", "list"] as const;
const EQUIPMENT_PAGE_TABS = ["list", "details"] as const;
const CATEGORY_PAGE_TABS = ["list", "details"] as const;
const HELP_PAGE_TABS = ["files", "guide"] as const;
const PLANNING_PAGE_TABS = ["editor", "list", "details"] as const;
const HISTORY_PAGE_TABS = ["details", "list"] as const;
const LINK_PAGE_TABS = ["list", "editor"] as const;
const UI_STATE_STORAGE_KEY = "camping.ui-state";

type DashboardPageTab = (typeof DASHBOARD_PAGE_TABS)[number];
type CompanionPageTab = (typeof COMPANION_PAGE_TABS)[number];
type VehiclePageTab = (typeof VEHICLE_PAGE_TABS)[number];
type EquipmentPageTab = (typeof EQUIPMENT_PAGE_TABS)[number];
type CategoryPageTab = (typeof CATEGORY_PAGE_TABS)[number];
type HelpPageTab = (typeof HELP_PAGE_TABS)[number];
type PlanningPageTab = (typeof PLANNING_PAGE_TABS)[number];
type HistoryPageTab = (typeof HISTORY_PAGE_TABS)[number];
type LinkPageTab = (typeof LINK_PAGE_TABS)[number];
type PlanningDetailTab = (typeof PLANNING_DETAIL_TABS)[number];
type HistoryDetailTab = (typeof HISTORY_DETAIL_TABS)[number];
type EquipmentDetailTab = (typeof EQUIPMENT_DETAIL_TABS)[number];
type CategoryDetailTab = (typeof CATEGORY_DETAIL_TABS)[number];

const DASHBOARD_PAGE_TAB_LABELS: Record<DashboardPageTab, string> = {
  overview: "운영 요약",
  actions: "빠른 실행",
  links: "최근 기록",
};
const COMPANION_PAGE_TAB_LABELS: Record<CompanionPageTab, string> = {
  editor: "프로필 편집",
  list: "사람 목록",
};
const VEHICLE_PAGE_TAB_LABELS: Record<VehiclePageTab, string> = {
  editor: "차량 편집",
  list: "차량 목록",
};
const EQUIPMENT_PAGE_TAB_LABELS: Record<EquipmentPageTab, string> = {
  list: "장비 목록",
  details: "상세 작업",
};
const CATEGORY_PAGE_TAB_LABELS: Record<CategoryPageTab, string> = {
  list: "카테고리 목록",
  details: "보조 작업",
};
const HELP_PAGE_TAB_LABELS: Record<HelpPageTab, string> = {
  files: "파일 안내",
  guide: "운영 메모",
};
const PLANNING_PAGE_TAB_LABELS: Record<PlanningPageTab, string> = {
  editor: "원본 입력",
  list: "계획 목록",
  details: "AI·결과",
};
const HISTORY_PAGE_TAB_LABELS: Record<HistoryPageTab, string> = {
  details: "상세 보기",
  list: "히스토리 목록",
};
const LINK_PAGE_TAB_LABELS: Record<LinkPageTab, string> = {
  list: "링크 목록",
  editor: "새 링크",
};
const PLANNING_DETAIL_TAB_LABELS: Record<PlanningDetailTab, string> = {
  analysis: "분석 결과",
  assistant: "AI 보조",
  learning: "누적 학습",
};
const HISTORY_DETAIL_TAB_LABELS: Record<HistoryDetailTab, string> = {
  overview: "요약",
  retrospective: "후기 작성",
  learning: "학습",
  records: "기록/결과",
};
const EQUIPMENT_DETAIL_TAB_LABELS: Record<EquipmentDetailTab, string> = {
  summary: "작업 요약",
  create: "항목 추가",
};
const CATEGORY_DETAIL_TAB_LABELS: Record<CategoryDetailTab, string> = {
  create: "새 카테고리",
  guidelines: "관리 원칙",
  backup: "로컬 백업",
};

type OperationState = {
  title: string;
  tone: "success" | "warning" | "error";
  description: string;
  items?: string[];
};

type CommaSeparatedInputs = {
  requestedDishes: string;
  requestedStops: string;
};

type RetrospectiveDraft = {
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

type PersistedUiState = {
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

type MarkdownLayerState = {
  eyebrow: string;
  title: string;
  description: string;
  outputPath: string | null;
  markdown: string;
};

type CategoryDrafts = Record<EquipmentSection, EquipmentCategoryCreateInput>;
type CategoryLabelDrafts = Record<EquipmentSection, Record<string, string>>;
type EquipmentCategorySelectionDrafts = Record<
  EquipmentSection,
  Record<string, string>
>;
type SectionTrackedIds = Record<EquipmentSection, string[]>;
type DurableMetadataJobStatusMap = Record<string, DurableMetadataJobStatusResponse>;
type AiJobRealtimeMode = "sse" | "fallback";

export function App() {
  const [persistedUiState] = useState(() => readPersistedUiState());
  const [activePage, setActivePage] = useState<PageKey>(
    persistedUiState?.activePage ?? "dashboard",
  );
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [companionDraft, setCompanionDraft] =
    useState<Companion>(createEmptyCompanion());
  const [editingCompanionId, setEditingCompanionId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleInput>(createEmptyVehicle());
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(
    persistedUiState?.selectedTripId ?? null,
  );
  const [tripDraft, setTripDraft] = useState<TripDraft | null>(null);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [analysisOutput, setAnalysisOutput] =
    useState<GetOutputResponse | null>(null);
  const [analysisStatus, setAnalysisStatus] =
    useState<AnalyzeTripResponse | null>(null);
  const [selectedAnalysisCategories, setSelectedAnalysisCategories] = useState<
    TripAnalysisCategory[]
  >([...ALL_TRIP_ANALYSIS_CATEGORIES]);
  const [assistantResponse, setAssistantResponse] =
    useState<PlanningAssistantResponse | null>(null);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [equipment, setEquipment] = useState<EquipmentCatalog | null>(null);
  const [equipmentCategories, setEquipmentCategories] =
    useState<EquipmentCategoriesData>(cloneEquipmentCategories());
  const [equipmentSection, setEquipmentSection] =
    useState<EquipmentSection>(persistedUiState?.equipmentSection ?? "durable");
  const [dashboardPageTab, setDashboardPageTab] =
    useState<DashboardPageTab>(persistedUiState?.dashboardPageTab ?? "overview");
  const [companionPageTab, setCompanionPageTab] =
    useState<CompanionPageTab>(persistedUiState?.companionPageTab ?? "editor");
  const [vehiclePageTab, setVehiclePageTab] =
    useState<VehiclePageTab>(persistedUiState?.vehiclePageTab ?? "editor");
  const [equipmentPageTab, setEquipmentPageTab] =
    useState<EquipmentPageTab>(persistedUiState?.equipmentPageTab ?? "list");
  const [categoryPageTab, setCategoryPageTab] =
    useState<CategoryPageTab>(persistedUiState?.categoryPageTab ?? "list");
  const [helpPageTab, setHelpPageTab] =
    useState<HelpPageTab>(persistedUiState?.helpPageTab ?? "files");
  const [planningPageTab, setPlanningPageTab] =
    useState<PlanningPageTab>(persistedUiState?.planningPageTab ?? "editor");
  const [historyPageTab, setHistoryPageTab] =
    useState<HistoryPageTab>(persistedUiState?.historyPageTab ?? "details");
  const [linkPageTab, setLinkPageTab] =
    useState<LinkPageTab>(persistedUiState?.linkPageTab ?? "list");
  const [planningDetailTab, setPlanningDetailTab] =
    useState<PlanningDetailTab>(persistedUiState?.planningDetailTab ?? "analysis");
  const [historyDetailTab, setHistoryDetailTab] =
    useState<HistoryDetailTab>(persistedUiState?.historyDetailTab ?? "overview");
  const [equipmentDetailTab, setEquipmentDetailTab] =
    useState<EquipmentDetailTab>(persistedUiState?.equipmentDetailTab ?? "summary");
  const [categoryDetailTab, setCategoryDetailTab] =
    useState<CategoryDetailTab>(persistedUiState?.categoryDetailTab ?? "create");
  const [collapsedEquipmentCategories, setCollapsedEquipmentCategories] =
    useState<SectionTrackedIds>(createEmptySectionTrackedIds());
  const [expandedEquipmentItems, setExpandedEquipmentItems] =
    useState<SectionTrackedIds>(createEmptySectionTrackedIds());
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
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
    persistedUiState?.selectedHistoryId ?? null,
  );
  const [retrospectiveDraft, setRetrospectiveDraft] =
    useState<RetrospectiveDraft>(createEmptyRetrospectiveDraft());
  const [savingRetrospective, setSavingRetrospective] = useState(false);
  const [historyLearningInsight, setHistoryLearningInsight] =
    useState<HistoryLearningInsight | null>(null);
  const [historyLearningLoading, setHistoryLearningLoading] = useState(false);
  const [historyLearningError, setHistoryLearningError] = useState<string | null>(null);
  const [userLearningProfile, setUserLearningProfile] =
    useState<UserLearningProfile | null>(null);
  const [userLearningStatus, setUserLearningStatus] =
    useState<UserLearningJobStatusResponse>(createIdleUserLearningStatus());
  const [historyOutput, setHistoryOutput] = useState<GetOutputResponse | null>(null);
  const [historyOutputLoading, setHistoryOutputLoading] = useState(false);
  const [historyOutputError, setHistoryOutputError] = useState<string | null>(null);
  const [markdownLayer, setMarkdownLayer] = useState<MarkdownLayerState | null>(null);
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [linkDraft, setLinkDraft] = useState<ExternalLinkInput>(createEmptyLink());
  const [durableDraft, setDurableDraft] =
    useState<DurableEquipmentItemInput>(createEmptyDurableItem());
  const [consumableDraft, setConsumableDraft] =
    useState<ConsumableEquipmentItemInput>(createEmptyConsumableItem());
  const [precheckDraft, setPrecheckDraft] =
    useState<PrecheckItemInput>(createEmptyPrecheckItem());
  const [appLoading, setAppLoading] = useState(true);
  const [creatingDataBackup, setCreatingDataBackup] = useState(false);
  const [stoppingAllAiJobs, setStoppingAllAiJobs] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [bannerState, setBannerState] = useState<OperationState | null>(null);
  const [operationState, setOperationState] = useState<OperationState | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiJobRealtimeMode, setAiJobRealtimeMode] = useState<AiJobRealtimeMode>(
    () => (typeof EventSource === "undefined" ? "fallback" : "sse"),
  );
  const [commaInputs, setCommaInputs] = useState<CommaSeparatedInputs>(
    createCommaSeparatedInputs(),
  );
  const selectedTripIdRef = useRef<string | null>(persistedUiState?.selectedTripId ?? null);
  const selectedHistoryIdRef = useRef<string | null>(null);
  const historyLearningRequestIdRef = useRef(0);
  const historyOutputRequestIdRef = useRef(0);
  const planningLoadRequestIdRef = useRef(0);
  const durableSearchFingerprintRef = useRef<Record<string, string>>({});
  const durableMetadataJobStatusesRef = useRef<DurableMetadataJobStatusMap>({});
  const analysisStatusRef = useRef<AnalyzeTripResponse | null>(null);
  const userLearningStatusRef = useRef<UserLearningJobStatusResponse>(
    createIdleUserLearningStatus(),
  );
  const isCreatingTripRef = useRef(false);
  const aiJobEventSubscriptionRef = useRef<AiJobEventSubscription | null>(null);
  const aiJobEventReconnectTimeoutRef = useRef<number | null>(null);
  const aiJobEventReconnectAttemptsRef = useRef(0);
  const aiJobEventHasConnectedRef = useRef(false);
  const previousEquipmentGroupIdsRef =
    useRef<SectionTrackedIds>(createEmptySectionTrackedIds());
  const previousCategoryEditorIdsRef =
    useRef<SectionTrackedIds>(createEmptySectionTrackedIds());
  const previousEquipmentItemIdsRef =
    useRef<SectionTrackedIds>(createEmptySectionTrackedIds());
  const isAnalysisPending = isPendingAnalysisStatus(analysisStatus?.status);

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    writePersistedUiState({
      activePage,
      selectedTripId,
      selectedHistoryId,
      equipmentSection,
      dashboardPageTab,
      companionPageTab,
      vehiclePageTab,
      equipmentPageTab,
      categoryPageTab,
      helpPageTab,
      planningPageTab,
      historyPageTab,
      linkPageTab,
      planningDetailTab,
      historyDetailTab,
      equipmentDetailTab,
      categoryDetailTab,
    });
  }, [
    activePage,
    categoryPageTab,
    categoryDetailTab,
    companionPageTab,
    dashboardPageTab,
    equipmentPageTab,
    equipmentDetailTab,
    equipmentSection,
    helpPageTab,
    historyDetailTab,
    historyPageTab,
    linkPageTab,
    planningPageTab,
    planningDetailTab,
    selectedHistoryId,
    selectedTripId,
    vehiclePageTab,
  ]);

  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
  }, [selectedTripId]);

  useEffect(() => {
    isCreatingTripRef.current = isCreatingTrip;
  }, [isCreatingTrip]);

  useEffect(() => {
    if (!operationState) {
      return;
    }

    const duration =
      operationState.tone === "success"
        ? 3400
        : operationState.tone === "warning"
          ? 4800
          : 5600;
    const timeoutId = window.setTimeout(() => {
      setOperationState((current) =>
        current === operationState ? null : current,
      );
    }, duration);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [operationState]);

  useEffect(() => {
    analysisStatusRef.current = analysisStatus;
  }, [analysisStatus]);

  useEffect(() => {
    userLearningStatusRef.current = userLearningStatus;
  }, [userLearningStatus]);

  useEffect(() => {
    if (isCreatingTrip || !selectedTripId) {
      if (!isCreatingTrip) {
        setTripDraft(null);
        setValidationWarnings([]);
        setCommaInputs(createCommaSeparatedInputs());
        setAnalysisOutput(null);
        setAnalysisStatus(null);
        analysisStatusRef.current = null;
        planningLoadRequestIdRef.current += 1;
      }
      return;
    }

    let active = true;
    const requestId = planningLoadRequestIdRef.current + 1;

    planningLoadRequestIdRef.current = requestId;
    setDetailLoading(true);
    setLoadError(null);
    setTripDraft(null);
    setValidationWarnings([]);
    setCommaInputs(createCommaSeparatedInputs());
    setAnalysisOutput(null);
    setAnalysisStatus(null);
    analysisStatusRef.current = null;
    setAssistantResponse(null);

    void Promise.allSettled([
      apiClient.getTrip(selectedTripId),
      apiClient.validateTrip(selectedTripId),
    ])
      .then(([tripResult, validationResult]) => {
        if (!active) return;

        if (tripResult.status === "rejected") {
          setTripDraft(null);
          setValidationWarnings([]);
          setAnalysisOutput(null);
          setAnalysisStatus(null);
          analysisStatusRef.current = null;
          setLoadError(getErrorMessage(tripResult.reason));
          return;
        }

        setTripDraft(tripResult.value.data);
        setCommaInputs(createCommaSeparatedInputs(tripResult.value.data));
        setLoadError(null);

        if (validationResult.status === "fulfilled") {
          setValidationWarnings(validationResult.value.warnings);
        } else {
          setValidationWarnings(toValidationWarnings(validationResult.reason));
        }

        if (planningLoadRequestIdRef.current !== requestId) {
          return;
        }

        void loadPlanningOutput(selectedTripId, requestId).catch(() => {
          if (!active || planningLoadRequestIdRef.current !== requestId) {
            return;
          }
        });

        void syncTripAnalysisStatus(selectedTripId, requestId).catch(() => {
          if (!active || planningLoadRequestIdRef.current !== requestId) {
            return;
          }

          applyAnalysisStatus({
            ...createIdleAnalysisStatus(selectedTripId),
          });
        });
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedTripId, isCreatingTrip]);

  const selectedHistory = useMemo(
    () => history.find((item) => item.history_id === selectedHistoryId) ?? null,
    [history, selectedHistoryId],
  );
  const analysisCategoryStatuses = useMemo(
    () => analysisStatus?.categories ?? createIdleAnalysisCategoryStatuses(),
    [analysisStatus],
  );
  const completedAnalysisCategoryCount = useMemo(
    () => analysisCategoryStatuses.filter((category) => category.has_result).length,
    [analysisCategoryStatuses],
  );

  const linkGroups = useMemo(
    () =>
      Object.entries(EXTERNAL_LINK_CATEGORY_LABELS)
        .map(([category, label]) => ({
          category: category as ExternalLinkCategory,
          label,
          items: links.filter((item) => item.category === category).sort(sortLinks),
        }))
        .filter((group) => group.items.length > 0),
    [links],
  );

  const currentEquipmentCategories = useMemo(
    () => equipmentCategories[equipmentSection],
    [equipmentCategories, equipmentSection],
  );
  const currentEquipmentSectionLabel = EQUIPMENT_SECTION_LABELS[equipmentSection];
  const expandedCategorySectionCount = expandedCategorySections.length;
  const refreshingDurableMetadataIds = useMemo(
    () =>
      Object.values(durableMetadataJobStatuses)
        .filter((status) => isPendingDurableMetadataJobStatus(status.status))
        .map((status) => status.item_id),
    [durableMetadataJobStatuses],
  );
  const hasPendingDurableMetadataJobs = refreshingDurableMetadataIds.length > 0;
  const activeEquipmentTabId = getEquipmentSectionTabId(equipmentSection);
  const activeEquipmentPanelId = getEquipmentSectionPanelId(equipmentSection);
  const activeDashboardPageTabId = getDetailTabId("dashboard-page", dashboardPageTab);
  const activeDashboardPagePanelId = getDetailPanelId("dashboard-page", dashboardPageTab);
  const activeCompanionPageTabId = getDetailTabId("companion-page", companionPageTab);
  const activeCompanionPagePanelId = getDetailPanelId("companion-page", companionPageTab);
  const activeVehiclePageTabId = getDetailTabId("vehicle-page", vehiclePageTab);
  const activeVehiclePagePanelId = getDetailPanelId("vehicle-page", vehiclePageTab);
  const activeEquipmentPageTabId = getDetailTabId("equipment-page", equipmentPageTab);
  const activeEquipmentPagePanelId = getDetailPanelId("equipment-page", equipmentPageTab);
  const activeCategoryPageTabId = getDetailTabId("category-page", categoryPageTab);
  const activeCategoryPagePanelId = getDetailPanelId("category-page", categoryPageTab);
  const activeHelpPageTabId = getDetailTabId("help-page", helpPageTab);
  const activeHelpPagePanelId = getDetailPanelId("help-page", helpPageTab);
  const activePlanningPageTabId = getDetailTabId("planning-page", planningPageTab);
  const activePlanningPagePanelId = getDetailPanelId("planning-page", planningPageTab);
  const activeHistoryPageTabId = getDetailTabId("history-page", historyPageTab);
  const activeHistoryPagePanelId = getDetailPanelId("history-page", historyPageTab);
  const activeLinkPageTabId = getDetailTabId("link-page", linkPageTab);
  const activeLinkPagePanelId = getDetailPanelId("link-page", linkPageTab);
  const activePlanningDetailTabId = getDetailTabId("planning-detail", planningDetailTab);
  const activePlanningDetailPanelId = getDetailPanelId(
    "planning-detail",
    planningDetailTab,
  );
  const activeHistoryDetailTabId = getDetailTabId("history-detail", historyDetailTab);
  const activeHistoryDetailPanelId = getDetailPanelId(
    "history-detail",
    historyDetailTab,
  );
  const activeEquipmentDetailTabId = getDetailTabId(
    "equipment-detail",
    equipmentDetailTab,
  );
  const activeEquipmentDetailPanelId = getDetailPanelId(
    "equipment-detail",
    equipmentDetailTab,
  );
  const activeCategoryDetailTabId = getDetailTabId(
    "category-detail",
    categoryDetailTab,
  );
  const activeCategoryDetailPanelId = getDetailPanelId(
    "category-detail",
    categoryDetailTab,
  );
  const selectedTripCompanions = useMemo(
    () => resolveSelectedCompanions(tripDraft?.party?.companion_ids ?? [], companions),
    [companions, tripDraft?.party?.companion_ids],
  );
  const selectedTripVehicle = useMemo(
    () => resolveSelectedVehicle(tripDraft?.vehicle, vehicles),
    [tripDraft?.vehicle, vehicles],
  );

  const missingCompanionIds = useMemo(
    () =>
      getMissingCompanionIds(
        tripDraft?.party?.companion_ids ?? [],
        companions.map((item) => item.id),
      ),
    [companions, tripDraft?.party?.companion_ids],
  );
  const selectedHistoryCompanionSnapshots = useMemo(
    () =>
      selectedHistory
        ? resolveHistoryCompanionSnapshots(selectedHistory, companions)
        : [],
    [companions, selectedHistory],
  );
  const selectedHistoryVehicle = useMemo(
    () => resolveHistoryVehicleSnapshot(selectedHistory, vehicles),
    [selectedHistory, vehicles],
  );

  useEffect(() => {
    if (!selectedHistoryId || !selectedHistory || selectedHistory.retrospectives.length === 0) {
      setHistoryLearningInsight(null);
      setHistoryLearningError(null);
      setHistoryLearningLoading(false);
      return;
    }

    const requestId = historyLearningRequestIdRef.current + 1;
    historyLearningRequestIdRef.current = requestId;
    setHistoryLearningLoading(true);
    setHistoryLearningError(null);

    void apiClient
      .getHistoryLearning(selectedHistoryId)
      .then((response) => {
        if (
          selectedHistoryIdRef.current !== selectedHistoryId ||
          historyLearningRequestIdRef.current !== requestId
        ) {
          return;
        }

        setHistoryLearningInsight(response.item);
      })
      .catch((error) => {
        if (
          selectedHistoryIdRef.current !== selectedHistoryId ||
          historyLearningRequestIdRef.current !== requestId
        ) {
          return;
        }

        setHistoryLearningInsight(null);
        setHistoryLearningError(getErrorMessage(error));
      })
      .finally(() => {
        if (
          selectedHistoryIdRef.current !== selectedHistoryId ||
          historyLearningRequestIdRef.current !== requestId
        ) {
          return;
        }

        setHistoryLearningLoading(false);
      });
  }, [selectedHistory, selectedHistoryId]);

  useEffect(() => {
    selectedHistoryIdRef.current = selectedHistoryId;
    historyLearningRequestIdRef.current += 1;
    setRetrospectiveDraft(createEmptyRetrospectiveDraft());
    setHistoryLearningInsight(null);
    setHistoryLearningError(null);
    setHistoryLearningLoading(false);
    setHistoryOutput(null);
    setHistoryOutputError(null);
    setHistoryOutputLoading(false);
  }, [selectedHistoryId]);

  useEffect(() => {
    setSelectedAnalysisCategories([...ALL_TRIP_ANALYSIS_CATEGORIES]);
  }, [isCreatingTrip, selectedTripId]);

  useEffect(() => {
    setMarkdownLayer(null);
  }, [activePage, isCreatingTrip, selectedHistoryId, selectedTripId]);

  useEffect(() => {
    if (!markdownLayer) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMarkdownLayer(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [markdownLayer]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setAiJobRealtimeMode("fallback");
      return;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      aiJobEventSubscriptionRef.current?.close();
      const subscription = apiClient.subscribeAiJobEvents({
        onEvent: (event) => {
          void handleAiJobEvent(event);
        },
        onOpen: () => {
          if (disposed) {
            return;
          }

          aiJobEventReconnectAttemptsRef.current = 0;
          setAiJobRealtimeMode("sse");

          if (aiJobEventHasConnectedRef.current) {
            void syncAiJobStateAfterRealtimeReconnect();
            return;
          }

          aiJobEventHasConnectedRef.current = true;
        },
        onError: () => {
          if (disposed) {
            return;
          }

          aiJobEventSubscriptionRef.current?.close();
          aiJobEventSubscriptionRef.current = null;
          setAiJobRealtimeMode("fallback");
          const reconnectDelay = getAiJobRealtimeReconnectDelay(
            aiJobEventReconnectAttemptsRef.current,
          );
          aiJobEventReconnectAttemptsRef.current += 1;

          if (aiJobEventReconnectTimeoutRef.current !== null) {
            window.clearTimeout(aiJobEventReconnectTimeoutRef.current);
          }

          aiJobEventReconnectTimeoutRef.current = window.setTimeout(() => {
            aiJobEventReconnectTimeoutRef.current = null;
            connect();
          }, reconnectDelay);
        },
      });

      if (!subscription) {
        setAiJobRealtimeMode("fallback");
        return;
      }

      aiJobEventSubscriptionRef.current = subscription;
    };

    connect();

    return () => {
      disposed = true;
      aiJobEventSubscriptionRef.current?.close();
      aiJobEventSubscriptionRef.current = null;

      if (aiJobEventReconnectTimeoutRef.current !== null) {
        window.clearTimeout(aiJobEventReconnectTimeoutRef.current);
        aiJobEventReconnectTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      aiJobRealtimeMode !== "fallback" ||
      isCreatingTrip ||
      !selectedTripId ||
      !isAnalysisPending
    ) {
      return;
    }

    const tripId = selectedTripId;
    const requestId = planningLoadRequestIdRef.current;
    const timeoutId = window.setTimeout(() => {
      void syncTripAnalysisStatus(tripId, requestId, {
        notifyTransition: true,
        syncOutputOnComplete: true,
      }).catch((error) => {
        if (planningLoadRequestIdRef.current !== requestId) {
          return;
        }

        setOperationState({
          title: "분석 상태 확인 실패",
          tone: "warning",
          description: getErrorMessage(error),
        });
      });
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [aiJobRealtimeMode, isAnalysisPending, isCreatingTrip, selectedTripId]);

  useEffect(() => {
    if (
      aiJobRealtimeMode !== "fallback" ||
      activePage !== "equipment" ||
      !hasPendingDurableMetadataJobs
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void syncDurableMetadataJobStatuses({
        notifyTransitions: true,
        refreshEquipmentOnCompletion: true,
      }).catch((error) => {
        setOperationState({
          title: "메타데이터 상태 확인 실패",
          tone: "warning",
          description: getErrorMessage(error),
        });
      });
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePage, aiJobRealtimeMode, hasPendingDurableMetadataJobs]);

  useEffect(() => {
    if (
      aiJobRealtimeMode !== "fallback" ||
      !isPendingUserLearningStatus(userLearningStatus.status)
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void syncUserLearningState({
        notifyTransition: true,
        syncSelectedHistoryLearning: true,
      }).catch((error) => {
        setOperationState({
          title: "개인화 학습 상태 확인 실패",
          tone: "warning",
          description: getErrorMessage(error),
        });
      });
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [aiJobRealtimeMode, userLearningStatus.status]);

  useEffect(() => {
    setDurableDraft((current) => ({
      ...current,
      category: resolveCategorySelection(
        current.category,
        equipmentCategories.durable,
      ),
    }));
    setConsumableDraft((current) => ({
      ...current,
      category: resolveCategorySelection(
        current.category,
        equipmentCategories.consumables,
      ),
    }));
    setPrecheckDraft((current) => ({
      ...current,
      category: resolveCategorySelection(
        current.category,
        equipmentCategories.precheck,
      ),
    }));
  }, [equipmentCategories]);

  useEffect(() => {
    const nextEquipmentGroupIds = buildVisibleEquipmentCategoryIdMap(
      equipment,
      equipmentCategories,
    );
    const previousEquipmentGroupIds = previousEquipmentGroupIdsRef.current;

    setCollapsedEquipmentCategories((current) =>
      syncCollapsedSectionTrackedIds(
        current,
        nextEquipmentGroupIds,
        previousEquipmentGroupIds,
      ),
    );
    previousEquipmentGroupIdsRef.current = nextEquipmentGroupIds;
  }, [equipment, equipmentCategories]);

  useEffect(() => {
    const nextCategoryEditorIds = buildEquipmentCategoryIdMap(equipmentCategories);
    const previousCategoryEditorIds = previousCategoryEditorIdsRef.current;

    setCollapsedCategoryEditors((current) =>
      syncCollapsedSectionTrackedIds(
        current,
        nextCategoryEditorIds,
        previousCategoryEditorIds,
      ),
    );
    previousCategoryEditorIdsRef.current = nextCategoryEditorIds;
  }, [equipmentCategories]);

  useEffect(() => {
    const nextItemIds = buildEquipmentItemIdMap(equipment);
    const previousItemIds = previousEquipmentItemIdsRef.current;

    setExpandedEquipmentItems((current) =>
      syncExpandedSectionTrackedIds(current, nextItemIds, previousItemIds),
    );
    previousEquipmentItemIdsRef.current = nextItemIds;
  }, [equipment]);

  function handleEquipmentTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    section: EquipmentSection,
  ) {
    let nextSection: EquipmentSection | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextSection = getAdjacentEquipmentSection(section, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextSection = getAdjacentEquipmentSection(section, -1);
    } else if (event.key === "Home") {
      nextSection = EQUIPMENT_SECTIONS[0];
    } else if (event.key === "End") {
      nextSection = EQUIPMENT_SECTIONS[EQUIPMENT_SECTIONS.length - 1];
    }

    if (!nextSection || nextSection === section) {
      return;
    }

    event.preventDefault();
    setEquipmentSection(nextSection);
    document.getElementById(getEquipmentSectionTabId(nextSection))?.focus();
  }

  const dashboardMetrics = useMemo(() => {
    const lowStockCount =
      (equipment?.consumables.items.filter(
        (item) => getConsumableStatus(item) !== "ok",
      ).length ?? 0) +
      (equipment?.precheck.items.filter((item) => item.status !== "ok").length ?? 0);

    return {
      trips: trips.length,
      history: history.length,
      companions: companions.length,
      vehicles: vehicles.length,
      alerts: lowStockCount,
      links: links.length,
    };
  }, [companions.length, equipment, history.length, links.length, trips.length, vehicles.length]);

  const equipmentMetrics = useMemo(
    () => ({
      durable: equipment?.durable.items.length ?? 0,
      consumables: equipment?.consumables.items.length ?? 0,
      precheck: equipment?.precheck.items.length ?? 0,
      categories:
        equipmentCategories.durable.length +
        equipmentCategories.consumables.length +
        equipmentCategories.precheck.length,
      alerts: dashboardMetrics.alerts,
    }),
    [dashboardMetrics.alerts, equipment, equipmentCategories],
  );

  const dashboardAlerts = useMemo(
    () => buildDashboardAlerts(equipment),
    [equipment],
  );

  const selectedTripSummary = useMemo(
    () =>
      (selectedTripId
        ? trips.find((item) => item.trip_id === selectedTripId)
        : null) ?? null,
    [selectedTripId, trips],
  );
  const currentAnalysisOutputPath =
    analysisOutput?.output_path ?? analysisStatus?.output_path ?? null;

  const currentTripLabel =
    (isCreatingTrip
      ? tripDraft?.title.trim() || "새 캠핑 계획"
      : selectedTripSummary?.title) ??
    formatCompactTripId(selectedTripId) ??
    "없음";
  const currentHistoryLabel =
    selectedHistory?.title ??
    formatCompactTripId(selectedHistoryId) ??
    "없음";
  const isUserLearningPending = isPendingUserLearningStatus(userLearningStatus.status);
  const currentUserLearningStatusLabel =
    USER_LEARNING_STATUS_LABELS[userLearningStatus.status] ?? userLearningStatus.status;
  const selectedHistoryRetrospectives = useMemo(
    () =>
      selectedHistory
        ? [...selectedHistory.retrospectives].sort((left, right) =>
            right.created_at.localeCompare(left.created_at),
          )
        : [],
    [selectedHistory],
  );

  async function loadInitialData() {
    setAppLoading(true);
    setLoadError(null);

    try {
      const [
        companionResponse,
        vehicleResponse,
        tripResponse,
        equipmentResponse,
        equipmentCategoryResponse,
        metadataStatusResponse,
        historyResponse,
        userLearningResponse,
        linkResponse,
      ] = await Promise.allSettled([
        apiClient.getCompanions(),
        apiClient.getVehicles(),
        apiClient.getTrips(),
        apiClient.getEquipment(),
        apiClient.getEquipmentCategories(),
        apiClient.getDurableMetadataJobStatuses(),
        apiClient.getHistory(),
        apiClient.getUserLearning(),
        apiClient.getLinks(),
      ]);
      const startupWarnings: string[] = [];

      if (tripResponse.status === "rejected") {
        throw tripResponse.reason;
      }

      if (equipmentResponse.status === "rejected") {
        throw equipmentResponse.reason;
      }

      if (historyResponse.status === "rejected") {
        throw historyResponse.reason;
      }

      if (linkResponse.status === "rejected") {
        throw linkResponse.reason;
      }

      setTrips(tripResponse.value.items);
      setEquipment(equipmentResponse.value);
      durableSearchFingerprintRef.current = buildDurableFingerprintMap(
        equipmentResponse.value,
      );
      applyDurableMetadataJobStatuses(
        metadataStatusResponse.status === "fulfilled"
          ? metadataStatusResponse.value.items
          : [],
      );
      setEquipmentCategories(
        equipmentCategoryResponse.status === "fulfilled"
          ? equipmentCategoryResponse.value
          : cloneEquipmentCategories(),
      );
      setCategoryLabelDrafts(createEmptyCategoryLabelDrafts());
      setHistory(historyResponse.value.items);
      if (userLearningResponse.status === "fulfilled") {
        setUserLearningProfile(userLearningResponse.value.profile);
        setUserLearningStatus(userLearningResponse.value.status);
        userLearningStatusRef.current = userLearningResponse.value.status;
      } else {
        setUserLearningProfile(null);
        setUserLearningStatus(createIdleUserLearningStatus());
        userLearningStatusRef.current = createIdleUserLearningStatus();
        startupWarnings.push(
          `누적 사용자 학습을 불러오지 못했습니다. ${getErrorMessage(
            userLearningResponse.reason,
          )}`,
        );
      }
      setLinks(linkResponse.value.items);
      setSelectedTripId(
        (current) =>
          current && tripResponse.value.items.some((item) => item.trip_id === current)
            ? current
            : tripResponse.value.items?.[0]?.trip_id ?? null,
      );
      setSelectedHistoryId(
        (current) =>
          current &&
          historyResponse.value.items.some((item) => item.history_id === current)
            ? current
            : historyResponse.value.items?.[0]?.history_id ?? null,
      );

      if (companionResponse.status === "fulfilled") {
        setCompanions(companionResponse.value.items);
      } else {
        setCompanions([]);
        startupWarnings.push(
          `동행자 목록을 불러오지 못했습니다. ${getErrorMessage(
            companionResponse.reason,
          )}`,
        );
      }

      if (vehicleResponse.status === "fulfilled") {
        setVehicles(vehicleResponse.value.items);
      } else {
        setVehicles([]);
        startupWarnings.push(
          `차량 목록을 불러오지 못했습니다. ${getErrorMessage(vehicleResponse.reason)}`,
        );
      }

      if (equipmentCategoryResponse.status === "rejected") {
        startupWarnings.push(
          `장비 카테고리를 불러오지 못했습니다. 기본 카테고리로 계속 진행합니다. ${getErrorMessage(
            equipmentCategoryResponse.reason,
          )}`,
        );
      }

      if (metadataStatusResponse.status === "rejected") {
        startupWarnings.push(
          `메타데이터 수집 상태를 불러오지 못했습니다. ${getErrorMessage(
            metadataStatusResponse.reason,
          )}`,
        );
      }

      if (startupWarnings.length > 0) {
        setBannerState({
          title: "초기 로딩 경고",
          tone: "warning",
          description: "일부 데이터를 기본값 또는 빈 상태로 불러왔습니다.",
          items: startupWarnings,
        });
      } else {
        setBannerState(null);
      }
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setAppLoading(false);
    }
  }

  function applyAnalysisStatus(status: AnalyzeTripResponse | null) {
    analysisStatusRef.current = status;
    setAnalysisStatus(status);
  }

  function applyUserLearningStatus(status: UserLearningJobStatusResponse) {
    userLearningStatusRef.current = status;
    setUserLearningStatus(status);
  }

  function applyDurableMetadataJobStatuses(
    statuses: DurableMetadataJobStatusResponse[],
  ) {
    const nextStatuses = createDurableMetadataJobStatusMap(statuses);
    durableMetadataJobStatusesRef.current = nextStatuses;
    setDurableMetadataJobStatuses(nextStatuses);
  }

  function upsertDurableMetadataJobStatus(status: DurableMetadataJobStatusResponse) {
    const nextStatuses = {
      ...durableMetadataJobStatusesRef.current,
      [status.item_id]: status,
    };

    durableMetadataJobStatusesRef.current = nextStatuses;
    setDurableMetadataJobStatuses(nextStatuses);
  }

  function removeDurableMetadataJobStatus(itemId: string) {
    const nextStatuses = { ...durableMetadataJobStatusesRef.current };
    delete nextStatuses[itemId];
    durableMetadataJobStatusesRef.current = nextStatuses;
    setDurableMetadataJobStatuses(nextStatuses);
  }

  function notifyAnalysisStatusTransition(
    previousStatus: AnalyzeTripResponse | null,
    nextStatus: AnalyzeTripResponse,
  ) {
    if (
      !previousStatus ||
      previousStatus.trip_id !== nextStatus.trip_id ||
      !isPendingAnalysisStatus(previousStatus.status)
    ) {
      return;
    }

    if (nextStatus.status === "completed") {
      setOperationState({
        title: "분석 완료",
        tone: "success",
        description:
          nextStatus.output_path ??
          "분석 결과를 저장하고 최신 Markdown을 다시 불러왔습니다.",
      });
      return;
    }

    if (nextStatus.status === "failed") {
      setOperationState({
        title: "분석 실패",
        tone: "error",
        description:
          nextStatus.error?.message ?? "백그라운드 분석 작업이 실패했습니다.",
      });
      return;
    }

    if (nextStatus.status === "interrupted") {
      setOperationState({
        title: "분석 중단",
        tone: "warning",
        description:
          nextStatus.error?.message ??
          "이전 분석 작업이 중단되었습니다. 다시 실행해 주세요.",
      });
    }
  }

  function notifyDurableMetadataTransitions(
    statuses: DurableMetadataJobStatusResponse[],
  ) {
    if (statuses.length === 0) {
      return;
    }

    setOperationState({
      title: "메타데이터 수집 경고",
      tone: "warning",
      description:
        statuses.length === 1
          ? statuses[0].error?.message ??
            `${statuses[0].item_id} 메타데이터 수집이 중단되었거나 실패했습니다.`
          : "일부 장비 메타데이터 수집이 중단되었거나 실패했습니다.",
      items:
        statuses.length > 1
          ? statuses.map(
              (status) =>
                `${status.item_id}: ${status.error?.message ?? getDurableMetadataStatusLabel(status.status)}`,
            )
          : undefined,
    });
  }

  function notifyUserLearningTransition(
    previousStatus: UserLearningJobStatusResponse,
    nextStatus: UserLearningJobStatusResponse,
  ) {
    if (
      !isPendingUserLearningStatus(previousStatus.status) ||
      previousStatus.status === nextStatus.status
    ) {
      return;
    }

    if (nextStatus.status === "completed") {
      setOperationState({
        title: "개인화 학습 업데이트 완료",
        tone: "success",
        description: "최신 회고를 누적 프로필에 반영했습니다.",
      });
      return;
    }

    if (nextStatus.status === "failed") {
      setOperationState({
        title: "개인화 학습 실패",
        tone: "error",
        description:
          nextStatus.error?.message ?? "회고 기반 개인화 학습 업데이트에 실패했습니다.",
      });
      return;
    }

    if (nextStatus.status === "interrupted") {
      setOperationState({
        title: "개인화 학습 중단",
        tone: "warning",
        description:
          nextStatus.error?.message ?? "진행 중이던 개인화 학습이 중단되었습니다.",
      });
    }
  }

  async function syncAiJobStateAfterRealtimeReconnect() {
    const syncWarnings: string[] = [];

    if (selectedTripIdRef.current && !isCreatingTripRef.current) {
      try {
        await syncTripAnalysisStatus(
          selectedTripIdRef.current,
          planningLoadRequestIdRef.current,
          {
            notifyTransition: true,
            syncOutputOnComplete: true,
          },
        );
      } catch (error) {
        syncWarnings.push(`분석 상태 동기화 실패: ${getErrorMessage(error)}`);
      }
    }

    try {
      await syncDurableMetadataJobStatuses({
        notifyTransitions: true,
        refreshEquipmentOnCompletion: true,
      });
    } catch (error) {
      syncWarnings.push(`메타데이터 상태 동기화 실패: ${getErrorMessage(error)}`);
    }

    try {
      await syncUserLearningState({
        notifyTransition: true,
        syncSelectedHistoryLearning: true,
      });
    } catch (error) {
      syncWarnings.push(`개인화 학습 상태 동기화 실패: ${getErrorMessage(error)}`);
    }

    if (syncWarnings.length > 0) {
      setOperationState({
        title: "실시간 상태 재연결 경고",
        tone: "warning",
        description: "실시간 연결은 복구했지만 일부 상태를 다시 읽지 못했습니다.",
        items: syncWarnings,
      });
    }
  }

  async function handleAiJobEvent(event: AiJobEvent) {
    if (event.type === "analysis-status") {
      if (selectedTripIdRef.current !== event.status.trip_id) {
        return;
      }

      const previousStatus =
        analysisStatusRef.current?.trip_id === event.status.trip_id
          ? analysisStatusRef.current
          : null;
      const previousCompletedCategoryCount =
        previousStatus?.completed_category_count ?? 0;

      applyAnalysisStatus(event.status);

      if (
        event.status.completed_category_count > previousCompletedCategoryCount ||
        event.status.status === "completed"
      ) {
        void loadPlanningOutput(event.status.trip_id, planningLoadRequestIdRef.current, {
          preserveCurrent: true,
        }).catch((error) => {
          setOperationState({
            title: "분석 결과 동기화 실패",
            tone: "warning",
            description: getErrorMessage(error),
          });
        });
      }

      notifyAnalysisStatusTransition(previousStatus, event.status);
      return;
    }

    if (event.type === "durable-metadata-status") {
      const previousStatus = durableMetadataJobStatusesRef.current[event.status.item_id];
      upsertDurableMetadataJobStatus(event.status);

      if (
        previousStatus &&
        isPendingDurableMetadataJobStatus(previousStatus.status) &&
        (event.status.status === "failed" || event.status.status === "interrupted")
      ) {
        notifyDurableMetadataTransitions([event.status]);
      }

      return;
    }

    if (event.type === "durable-metadata-completed") {
      removeDurableMetadataJobStatus(event.item_id);

      try {
        const syncWarnings = await refreshEquipmentState({
          syncMetadataStatuses: false,
        });

        if (syncWarnings.length > 0) {
          setOperationState({
            title: "장비 동기화 경고",
            tone: "warning",
            description: "메타데이터 수집은 완료됐지만 일부 상태를 다시 불러오지 못했습니다.",
            items: syncWarnings,
          });
        }
      } catch (error) {
        setOperationState({
          title: "장비 동기화 경고",
          tone: "warning",
          description: getErrorMessage(error),
        });
      }
    }

    if (event.type === "user-learning-status") {
      const previousStatus = userLearningStatusRef.current;

      applyUserLearningStatus(event.status);

      if (event.status.status === "completed" || event.status.status === "idle") {
        notifyUserLearningTransition(previousStatus, event.status);

        try {
          await syncUserLearningState({
            notifyTransition: false,
            syncSelectedHistoryLearning:
              event.status.trigger_history_id === selectedHistoryIdRef.current ||
              selectedHistoryIdRef.current !== null,
          });
        } catch (error) {
          setOperationState({
            title: "개인화 학습 동기화 경고",
            tone: "warning",
            description: getErrorMessage(error),
          });
        }
        return;
      }

      notifyUserLearningTransition(previousStatus, event.status);
    }
  }

  async function loadPlanningOutput(
    tripId: string,
    requestId: number,
    options: { preserveCurrent?: boolean } = {},
  ) {
    try {
      const response = await apiClient.getOutput(tripId);

      if (planningLoadRequestIdRef.current !== requestId) {
        return null;
      }

      setAnalysisOutput(response);
      return response;
    } catch (error) {
      if (planningLoadRequestIdRef.current !== requestId) {
        return null;
      }

      if (error instanceof ApiClientError && error.code === "RESOURCE_NOT_FOUND") {
        if (!options.preserveCurrent) {
          setAnalysisOutput(null);
        }

        return null;
      }

      throw error;
    }
  }

  async function syncTripAnalysisStatus(
    tripId: string,
    requestId: number,
    options: {
      notifyTransition?: boolean;
      syncOutputOnComplete?: boolean;
    } = {},
  ) {
    const previousStatus = analysisStatusRef.current;
    const response = await apiClient.getTripAnalysisStatus(tripId);

    if (planningLoadRequestIdRef.current !== requestId) {
      return null;
    }

    applyAnalysisStatus(response);

    const previousCompletedCategoryCount =
      previousStatus?.trip_id === response.trip_id
        ? previousStatus.completed_category_count
        : 0;

    if (
      options.syncOutputOnComplete &&
      (response.completed_category_count > previousCompletedCategoryCount ||
        response.status === "completed")
    ) {
      await loadPlanningOutput(tripId, requestId, { preserveCurrent: true });
    }

    if (options.notifyTransition) {
      notifyAnalysisStatusTransition(previousStatus, response);
    }

    return response;
  }

  async function syncUserLearningState(
    options: {
      notifyTransition?: boolean;
      syncSelectedHistoryLearning?: boolean;
    } = {},
  ) {
    const previousStatus = userLearningStatusRef.current;
    const response = await apiClient.getUserLearning();

    setUserLearningProfile(response.profile);
    applyUserLearningStatus(response.status);

    if (options.syncSelectedHistoryLearning && selectedHistoryIdRef.current) {
      const historyId = selectedHistoryIdRef.current;
      const requestId = historyLearningRequestIdRef.current + 1;

      historyLearningRequestIdRef.current = requestId;
      setHistoryLearningLoading(true);
      setHistoryLearningError(null);

      try {
        const learningResponse = await apiClient.getHistoryLearning(historyId);

        if (
          selectedHistoryIdRef.current === historyId &&
          historyLearningRequestIdRef.current === requestId
        ) {
          setHistoryLearningInsight(learningResponse.item);
        }
      } catch (error) {
        if (
          selectedHistoryIdRef.current === historyId &&
          historyLearningRequestIdRef.current === requestId
        ) {
          setHistoryLearningInsight(null);
          setHistoryLearningError(getErrorMessage(error));
        }
      } finally {
        if (
          selectedHistoryIdRef.current === historyId &&
          historyLearningRequestIdRef.current === requestId
        ) {
          setHistoryLearningLoading(false);
        }
      }
    }

    if (options.notifyTransition) {
      notifyUserLearningTransition(previousStatus, response.status);
    }

    return response;
  }

  async function refreshEquipmentState(
    options: { syncMetadataStatuses?: boolean } = {},
  ) {
    const [catalogResponse, categoriesResponse, metadataStatusesResponse] = await Promise.allSettled([
      apiClient.getEquipment(),
      apiClient.getEquipmentCategories(),
      options.syncMetadataStatuses === false
        ? Promise.resolve({ items: Object.values(durableMetadataJobStatusesRef.current) })
        : apiClient.getDurableMetadataJobStatuses(),
    ]);
    const warnings: string[] = [];

    if (catalogResponse.status === "fulfilled") {
      setEquipment(catalogResponse.value);
      durableSearchFingerprintRef.current = buildDurableFingerprintMap(
        catalogResponse.value,
      );
    } else {
      warnings.push(`장비 목록 동기화 실패: ${getErrorMessage(catalogResponse.reason)}`);
    }

    if (categoriesResponse.status === "fulfilled") {
      setEquipmentCategories(categoriesResponse.value);
    } else {
      warnings.push(
        `장비 카테고리 동기화 실패: ${getErrorMessage(categoriesResponse.reason)}`,
      );
    }

    if (metadataStatusesResponse.status === "fulfilled") {
      applyDurableMetadataJobStatuses(metadataStatusesResponse.value.items);
    } else {
      warnings.push(
        `메타데이터 상태 동기화 실패: ${getErrorMessage(metadataStatusesResponse.reason)}`,
      );
    }

    return warnings;
  }

  async function refreshDurableMetadata(
    itemId: string,
    options: { manual: boolean },
  ) {
    try {
      const response = await apiClient.refreshDurableEquipmentMetadata(itemId);
      upsertDurableMetadataJobStatus(response);

      return { warning: null as string | null };
    } catch (error) {
      const warning = `장비 메타데이터 수집 실패: ${getErrorMessage(error)}`;

      if (options.manual) {
        throw error;
      }

      return { warning };
    }
  }

  async function maybeAutoRefreshDurableMetadata(item: DurableEquipmentItem) {
    const savedFingerprint = durableSearchFingerprintRef.current[item.id];

    if (
      savedFingerprint === buildDurableMetadataFingerprint(item) &&
      item.metadata
    ) {
      return {
        warning: null as string | null,
        started: false,
      };
    }

    const result = await refreshDurableMetadata(item.id, { manual: false });
    return {
      warning: result.warning,
      started: result.warning === null,
    };
  }

  async function syncDurableMetadataJobStatuses(
    options: {
      notifyTransitions?: boolean;
      refreshEquipmentOnCompletion?: boolean;
    } = {},
  ) {
    const previousStatuses = durableMetadataJobStatusesRef.current;
    const response = await apiClient.getDurableMetadataJobStatuses();

    applyDurableMetadataJobStatuses(response.items);

    const completedIds = Object.values(previousStatuses)
      .filter(
        (status) =>
          isPendingDurableMetadataJobStatus(status.status) &&
          !response.items.some((item) => item.item_id === status.item_id),
      )
      .map((status) => status.item_id);
    const transitionedWarnings = response.items.filter((status) => {
      const previousStatus = previousStatuses[status.item_id];

      return (
        !!previousStatus &&
        isPendingDurableMetadataJobStatus(previousStatus.status) &&
        (status.status === "failed" || status.status === "interrupted")
      );
    });

    if (completedIds.length > 0 && options.refreshEquipmentOnCompletion) {
      const syncWarnings = await refreshEquipmentState({ syncMetadataStatuses: false });

      if (syncWarnings.length > 0) {
        setOperationState({
          title: "장비 동기화 경고",
          tone: "warning",
          description: "메타데이터 수집은 완료됐지만 일부 상태를 다시 불러오지 못했습니다.",
          items: syncWarnings,
        });
      }
    }

    if (options.notifyTransitions && transitionedWarnings.length > 0) {
      notifyDurableMetadataTransitions(transitionedWarnings);
    }

    return response.items;
  }

  function beginCreateTrip() {
    const nextDraft = createEmptyTripDraft();

    setActivePage("planning");
    setIsCreatingTrip(true);
    setSelectedTripId(null);
    setTripDraft(nextDraft);
    setCommaInputs(createCommaSeparatedInputs(nextDraft));
    setValidationWarnings([]);
    setAnalysisOutput(null);
    setAnalysisStatus(null);
    analysisStatusRef.current = null;
    setAssistantResponse(null);
    setOperationState(null);
    setLoadError(null);
  }

  function selectTrip(tripId: string) {
    setActivePage("planning");
    setIsCreatingTrip(false);
    setSelectedTripId(tripId);
    setOperationState(null);
  }

  function toggleAnalysisCategorySelection(category: TripAnalysisCategory) {
    setSelectedAnalysisCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  function selectAllAnalysisCategories() {
    setSelectedAnalysisCategories([...ALL_TRIP_ANALYSIS_CATEGORIES]);
  }

  function clearAnalysisCategorySelection() {
    setSelectedAnalysisCategories([]);
  }

  function updateTripDraft(
    updater: (current: TripDraft) => TripDraft,
  ) {
    setTripDraft((current) => (current ? updater(current) : current));
  }

  function beginCreateCompanion(companionId?: string) {
    setEditingCompanionId(null);
    setCompanionDraft(createEmptyCompanion(companionId));
  }

  function beginEditCompanion(companion: Companion) {
    setEditingCompanionId(companion.id);
    setCompanionDraft({
      ...companion,
      health_notes: [...companion.health_notes],
      required_medications: [...companion.required_medications],
      traits: {
        cold_sensitive: companion.traits.cold_sensitive ?? false,
        heat_sensitive: companion.traits.heat_sensitive ?? false,
        rain_sensitive: companion.traits.rain_sensitive ?? false,
      },
    });
  }

  async function handleCreateCompanion(input: Companion = companionDraft) {
    try {
      const response = await apiClient.createCompanion(input);
      const nextCompanions = [...companions, response.item].sort(sortCompanions);

      setCompanions(nextCompanions);
      setCompanionDraft(createEmptyCompanion());
      setEditingCompanionId(null);
      setOperationState({
        title: "동행자 추가 완료",
        tone: "success",
        description: `${response.item.name} (${response.item.id})`,
      });
    } catch (error) {
      setOperationState({
        title: "동행자 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveCompanion() {
    if (!editingCompanionId) return;

    try {
      const response = await apiClient.updateCompanion(editingCompanionId, companionDraft);
      setCompanions((current) =>
        current
          .map((item) => (item.id === response.item.id ? response.item : item))
          .sort(sortCompanions),
      );
      setCompanionDraft(createEmptyCompanion());
      setEditingCompanionId(null);
      setOperationState({
        title: "동행자 저장 완료",
        tone: "success",
        description: `${response.item.name} (${response.item.id})`,
      });
    } catch (error) {
      setOperationState({
        title: "동행자 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteCompanion(companionId: string) {
    if (!confirmDeletion(`동행자 프로필을 삭제할까요?\n${companionId}`)) return;

    try {
      await apiClient.deleteCompanion(companionId);
      setCompanions((current) =>
        current.filter((item) => item.id !== companionId).sort(sortCompanions),
      );

      if (editingCompanionId === companionId) {
        setEditingCompanionId(null);
        setCompanionDraft(createEmptyCompanion());
      }

      if (tripDraft?.party?.companion_ids.includes(companionId)) {
        updateTripDraft((current) => ({
          ...current,
          party: {
            companion_ids: current.party?.companion_ids.filter((item) => item !== companionId) ?? [],
          },
        }));
      }

      setOperationState({
        title: "동행자 삭제 완료",
        tone: "success",
        description: companionId,
      });
    } catch (error) {
      setOperationState({
        title: "동행자 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  function beginCreateVehicle() {
    setEditingVehicleId(null);
    setVehicleDraft(createEmptyVehicle());
  }

  function beginEditVehicle(vehicle: Vehicle) {
    setEditingVehicleId(vehicle.id);
    setVehicleDraft({
      ...vehicle,
      notes: [...vehicle.notes],
    });
  }

  async function handleCreateVehicle(input: VehicleInput = vehicleDraft) {
    try {
      const response = await apiClient.createVehicle(input);
      setVehicles((current) => [...current, response.item].sort(sortVehicles));
      setVehicleDraft(createEmptyVehicle());
      setEditingVehicleId(null);
      setOperationState({
        title: "차량 추가 완료",
        tone: "success",
        description: `${response.item.name} (${response.item.id})`,
      });
    } catch (error) {
      setOperationState({
        title: "차량 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveVehicle() {
    if (!editingVehicleId) return;

    try {
      const response = await apiClient.updateVehicle(editingVehicleId, vehicleDraft);
      setVehicles((current) =>
        current
          .map((item) => (item.id === response.item.id ? response.item : item))
          .sort(sortVehicles),
      );
      setVehicleDraft(createEmptyVehicle());
      setEditingVehicleId(null);
      setOperationState({
        title: "차량 저장 완료",
        tone: "success",
        description: `${response.item.name} (${response.item.id})`,
      });
    } catch (error) {
      setOperationState({
        title: "차량 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteVehicle(vehicleId: string) {
    if (!confirmDeletion(`차량 정보를 삭제할까요?\n${vehicleId}`)) return;

    try {
      await apiClient.deleteVehicle(vehicleId);
      setVehicles((current) => current.filter((item) => item.id !== vehicleId));

      if (editingVehicleId === vehicleId) {
        setEditingVehicleId(null);
        setVehicleDraft(createEmptyVehicle());
      }

      if (tripDraft?.vehicle?.id === vehicleId) {
        updateTripDraft((current) => ({
          ...current,
          vehicle: undefined,
        }));
      }

      setOperationState({
        title: "차량 삭제 완료",
        tone: "success",
        description: vehicleId,
      });
    } catch (error) {
      setOperationState({
        title: "차량 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveTrip() {
    if (!tripDraft) return;

    setSavingTrip(true);
    setOperationState(null);

    try {
      const response = isCreatingTrip
        ? await apiClient.createTrip(tripDraft)
        : await apiClient.updateTrip(selectedTripId ?? tripDraft.trip_id ?? "", tripDraft);

      const tripList = await apiClient.getTrips();
      setTrips(tripList.items);
      setSelectedTripId(response.trip_id);
      setIsCreatingTrip(false);
      setTripDraft(response.data);
      setCommaInputs(createCommaSeparatedInputs(response.data));
      const savedDescription = `${response.data.title} 계획을 저장했습니다.`;
      const backgroundAnalysisNotice = isAnalysisPending
        ? " 현재 분석에는 방금 저장한 변경이 반영되지 않습니다. 완료 후 다시 실행하세요."
        : "";

      try {
        const validation = await apiClient.validateTrip(response.trip_id);
        setValidationWarnings(validation.warnings);
        setOperationState({
          title: "캠핑 계획 저장 완료",
          tone:
            validation.warnings.length > 0 || isAnalysisPending
              ? "warning"
              : "success",
          description:
            validation.warnings.length > 0
              ? `${savedDescription} 검증 경고를 확인하세요.${backgroundAnalysisNotice}`
              : `${savedDescription}${backgroundAnalysisNotice}`,
        });
      } catch (error) {
        setValidationWarnings(toValidationWarnings(error));
        setOperationState({
          title: "캠핑 계획 저장 완료",
          tone: "warning",
          description: `${savedDescription} 검증 경고를 확인하세요.${backgroundAnalysisNotice}`,
        });
      }
    } catch (error) {
      setOperationState({
        title: "캠핑 계획 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      setSavingTrip(false);
    }
  }

  async function handleDeleteTrip() {
    if (!selectedTripId) return;
    if (!confirmDeletion(`캠핑 계획을 삭제할까요?\n${selectedTripId}`)) return;

    try {
      await apiClient.deleteTrip(selectedTripId);
      const response = await apiClient.getTrips();
      setTrips(response.items);
      setSelectedTripId(response.items[0]?.trip_id ?? null);
      setTripDraft(null);
      setCommaInputs(createCommaSeparatedInputs());
      setAnalysisOutput(null);
      setAnalysisStatus(null);
      analysisStatusRef.current = null;
      setAssistantResponse(null);
      setOperationState({
        title: "캠핑 계획 삭제 완료",
        tone: "success",
        description: `${selectedTripId} 계획을 삭제했습니다.`,
      });
    } catch (error) {
      setOperationState({
        title: "캠핑 계획 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleArchiveTrip() {
    if (!selectedTripId) return;

    try {
      const response = await apiClient.archiveTrip(selectedTripId);
      const [tripResponse, historyResponse] = await Promise.all([
        apiClient.getTrips(),
        apiClient.getHistory(),
      ]);

      setTrips(tripResponse.items);
      setHistory(historyResponse.items);
      setSelectedTripId(tripResponse.items[0]?.trip_id ?? null);
      setSelectedHistoryId(response.item.history_id);
      setTripDraft(null);
      setCommaInputs(createCommaSeparatedInputs());
      setAnalysisOutput(null);
      setAnalysisStatus(null);
      analysisStatusRef.current = null;
      setAssistantResponse(null);
      setActivePage("history");
      setOperationState({
        title: "히스토리 아카이브 완료",
        tone: "success",
        description: `${response.item.title} 계획을 히스토리로 이동했습니다.`,
      });
    } catch (error) {
      setOperationState({
        title: "아카이브 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function requestAnalysisRun(
    categories: TripAnalysisCategory[],
    options: {
      forceRefresh?: boolean;
      successTitle: string;
      successDescription: string;
    },
  ) {
    if (!selectedTripId || categories.length === 0) return;

    const tripId = selectedTripId;
    const requestId = planningLoadRequestIdRef.current;
    setOperationState(null);

    try {
      const response = await apiClient.analyzeTrip({
        trip_id: tripId,
        categories,
        force_refresh: options.forceRefresh,
        save_output: true,
      });

      if (planningLoadRequestIdRef.current !== requestId) {
        return;
      }

      applyAnalysisStatus(response);

      if (response.status === "completed") {
        await loadPlanningOutput(tripId, requestId, { preserveCurrent: true });
        setOperationState({
          title: options.successTitle,
          tone: "success",
          description: response.output_path ?? options.successDescription,
        });
      } else if (response.status === "failed") {
        setOperationState({
          title: "분석 실패",
          tone: "error",
          description:
            response.error?.message ?? "백그라운드 분석 작업이 실패했습니다.",
        });
      } else if (response.status === "interrupted") {
        setOperationState({
          title: "분석 중단",
          tone: "warning",
          description:
            response.error?.message ??
            "이전 분석 작업이 중단되었습니다. 다시 실행해 주세요.",
        });
      } else {
        setOperationState({
          title: options.successTitle,
          tone: "success",
          description: options.successDescription,
        });
      }
    } catch (error) {
      if (planningLoadRequestIdRef.current !== requestId) {
        return;
      }

      setOperationState({
        title: "분석 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleAnalyzeSelected() {
    await requestAnalysisRun(selectedAnalysisCategories, {
      successTitle: "섹션 수집 시작",
      successDescription:
        "선택한 섹션을 기준으로 백그라운드 분석을 시작했습니다.",
    });
  }

  async function handleAnalyzeAll() {
    await requestAnalysisRun([...ALL_TRIP_ANALYSIS_CATEGORIES], {
      successTitle: "전체 분석 시작",
      successDescription:
        "전체 섹션을 기준으로 백그라운드 분석을 시작했습니다.",
    });
  }

  async function handleRefreshAnalysisCategory(category: TripAnalysisCategory) {
    await requestAnalysisRun([category], {
      forceRefresh: true,
      successTitle: "섹션 재수집 시작",
      successDescription: "선택한 섹션을 다시 수집하기 시작했습니다.",
    });
  }

  function handleOpenAnalysisLayer() {
    if (!analysisOutput?.markdown) {
      return;
    }

    setMarkdownLayer({
      eyebrow: "계획 분석 레이어",
      title: `${tripDraft?.title ?? "현재 계획"} 분석 결과`,
      description:
        "본문 폭을 넓혀 이번 캠핑의 최종 Markdown 정리본을 다시 읽는 전용 보기입니다.",
      outputPath: analysisOutput.output_path,
      markdown: analysisOutput.markdown,
    });
  }

  async function handleAssistantSubmit() {
    if (!selectedTripId || !assistantInput.trim()) return;

    setAssistantLoading(true);

    try {
      const response = await apiClient.assistTrip(selectedTripId, assistantInput);
      setAssistantResponse(response);
      setOperationState({
        title: "AI 보조 응답 완료",
        tone: "success",
        description: "폼에서 반영할 항목과 장비 액션 제안을 확인하세요.",
      });
      setAssistantInput("");
    } catch (error) {
      setOperationState({
        title: "AI 보조 응답 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      setAssistantLoading(false);
    }
  }

  async function handleApplyAssistantAction(action: PlanningAssistantAction) {
    try {
      const additionalWarnings: string[] = [];
      let metadataCollectionStarted = false;

      if (action.action === "increase_quantity" && action.item_id) {
        const currentItem = findEquipmentItem(equipment, action.section, action.item_id);

        if (!currentItem) {
          throw new ApiClientError("현재 장비 목록에서 대상 항목을 찾지 못했습니다.");
        }

        if (action.section === "durable") {
          await apiClient.updateEquipmentItem("durable", action.item_id, {
            ...(currentItem as DurableEquipmentItem),
            quantity:
              (currentItem as DurableEquipmentItem).quantity +
              (action.quantity_delta ?? 1),
          });
        } else if (action.section === "consumables") {
          await apiClient.updateEquipmentItem("consumables", action.item_id, {
            ...(currentItem as ConsumableEquipmentItem),
            quantity_on_hand:
              (currentItem as ConsumableEquipmentItem).quantity_on_hand +
              (action.quantity_delta ?? 1),
          });
        }
      }

      if (action.action === "mark_needs_check" && action.item_id) {
        const currentItem = findEquipmentItem(equipment, action.section, action.item_id);

        if (!currentItem || action.section !== "precheck") {
          throw new ApiClientError("점검 대상으로 적용할 항목을 찾지 못했습니다.");
        }

        await apiClient.updateEquipmentItem("precheck", action.item_id, {
          ...(currentItem as PrecheckItem),
          status: "needs_check",
        });
      }

      if (action.action === "add_item") {
        if (action.section === "durable" && action.durable_item) {
          const { id: _ignored, ...payload } = action.durable_item;
          const response = await apiClient.createEquipmentItem("durable", payload);
          const metadataRefreshResult = await maybeAutoRefreshDurableMetadata(
            response.item as DurableEquipmentItem,
          );
          metadataCollectionStarted = metadataRefreshResult.started;
          if (metadataRefreshResult.warning) {
            additionalWarnings.push(metadataRefreshResult.warning);
          }
        }

        if (action.section === "consumables" && action.consumable_item) {
          const { id: _ignored, ...payload } = action.consumable_item;
          await apiClient.createEquipmentItem("consumables", payload);
        }

        if (action.section === "precheck" && action.precheck_item) {
          const { id: _ignored, ...payload } = action.precheck_item;
          await apiClient.createEquipmentItem("precheck", payload);
        }
      }

      const syncWarnings = [
        ...(await refreshEquipmentState()),
        ...additionalWarnings,
      ];
      setOperationState({
        title: "AI 제안 반영 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(
          `${action.title}${metadataCollectionStarted ? " 메타데이터 수집은 백그라운드에서 계속됩니다." : ""}`,
          syncWarnings,
        ),
      });
    } catch (error) {
      setOperationState({
        title: "AI 제안 반영 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleCreateEquipmentItem(section: EquipmentSection) {
    try {
      const additionalWarnings: string[] = [];
      let metadataCollectionStarted = false;

      if (section === "durable") {
        const response = await apiClient.createEquipmentItem(section, durableDraft);
        const metadataRefreshResult = await maybeAutoRefreshDurableMetadata(
          response.item as DurableEquipmentItem,
        );
        metadataCollectionStarted = metadataRefreshResult.started;
        if (metadataRefreshResult.warning) {
          additionalWarnings.push(metadataRefreshResult.warning);
        }
        setDurableDraft((current) => ({
          ...createEmptyDurableItem(),
          category: resolveCategorySelection(
            current.category,
            equipmentCategories.durable,
          ),
        }));
      }

      if (section === "consumables") {
        await apiClient.createEquipmentItem(section, consumableDraft);
        setConsumableDraft((current) => ({
          ...createEmptyConsumableItem(),
          category: resolveCategorySelection(
            current.category,
            equipmentCategories.consumables,
          ),
        }));
      }

      if (section === "precheck") {
        await apiClient.createEquipmentItem(section, precheckDraft);
        setPrecheckDraft((current) => ({
          ...createEmptyPrecheckItem(),
          category: resolveCategorySelection(
            current.category,
            equipmentCategories.precheck,
          ),
        }));
      }

      const syncWarnings = [
        ...(await refreshEquipmentState()),
        ...additionalWarnings,
      ];
      setOperationState({
        title: "장비 항목 추가 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(
          `${section} 섹션에 새 항목을 추가했습니다.${metadataCollectionStarted ? " 메타데이터 수집은 백그라운드에서 계속됩니다." : ""}`,
          syncWarnings,
        ),
      });
    } catch (error) {
      setOperationState({
        title: "장비 항목 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveEquipmentItem(
    section: EquipmentSection,
    itemId: string,
  ) {
    if (!equipment) return;

    try {
      const additionalWarnings: string[] = [];
      let metadataCollectionStarted = false;
      const pendingCategoryId =
        equipmentCategorySelectionDrafts[section][itemId] ?? null;

      if (section === "durable") {
        const item = equipment.durable.items.find((candidate) => candidate.id === itemId);
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
          const metadataRefreshResult = await maybeAutoRefreshDurableMetadata(itemToSave);
          metadataCollectionStarted = metadataRefreshResult.started;
          if (metadataRefreshResult.warning) {
            additionalWarnings.push(metadataRefreshResult.warning);
          }
        }
      }

      if (section === "consumables") {
        const item = equipment.consumables.items.find(
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
        const item = equipment.precheck.items.find(
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
        setEquipmentCategorySelectionDrafts((current) =>
          setEquipmentCategorySelectionDraft(current, section, itemId, null),
        );
        setCollapsedEquipmentCategories((current) =>
          removeSectionTrackedId(current, section, pendingCategoryId),
        );
        previousEquipmentGroupIdsRef.current = ensureSectionIdTracked(
          buildVisibleEquipmentCategoryIdMap(equipment, equipmentCategories),
          section,
          pendingCategoryId,
        );
      }

      const syncWarnings = [
        ...(await refreshEquipmentState()),
        ...additionalWarnings,
      ];
      setOperationState({
        title: "장비 저장 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(
          `${itemId}${metadataCollectionStarted ? " 메타데이터 수집은 백그라운드에서 계속됩니다." : ""}`,
          syncWarnings,
        ),
      });
    } catch (error) {
      setOperationState({
        title: "장비 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteEquipmentItem(
    section: EquipmentSection,
    itemId: string,
  ) {
    if (!confirmDeletion(`장비 항목을 삭제할까요?\n${section} / ${itemId}`)) return;

    try {
      await apiClient.deleteEquipmentItem(section, itemId);
      setEquipmentCategorySelectionDrafts((current) =>
        setEquipmentCategorySelectionDraft(current, section, itemId, null),
      );
      const syncWarnings = await refreshEquipmentState();
      setOperationState({
        title: "장비 삭제 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(itemId, syncWarnings),
      });
    } catch (error) {
      setOperationState({
        title: "장비 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleRefreshDurableMetadata(itemId: string) {
    const currentItem = equipment?.durable.items.find((item) => item.id === itemId);
    const pendingCategoryId =
      equipmentCategorySelectionDrafts.durable[itemId] ?? null;

    try {
      if (currentItem) {
        const itemToSave =
          pendingCategoryId && pendingCategoryId !== currentItem.category
            ? { ...currentItem, category: pendingCategoryId }
            : currentItem;
        await apiClient.updateEquipmentItem(
          "durable",
          itemId,
          toDurableEquipmentInput(itemToSave),
        );

        if (pendingCategoryId) {
          setEquipmentCategorySelectionDrafts((current) =>
            setEquipmentCategorySelectionDraft(current, "durable", itemId, null),
          );
          setCollapsedEquipmentCategories((current) =>
            removeSectionTrackedId(current, "durable", pendingCategoryId),
          );
          previousEquipmentGroupIdsRef.current = ensureSectionIdTracked(
            buildVisibleEquipmentCategoryIdMap(equipment, equipmentCategories),
            "durable",
            pendingCategoryId,
          );
        }
      }

      await refreshDurableMetadata(itemId, { manual: true });
      const syncWarnings = await refreshEquipmentState();
      setOperationState({
        title: "장비 메타데이터 수집 시작",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(
          `${itemId} 메타데이터를 백그라운드에서 다시 수집합니다.`,
          syncWarnings,
        ),
      });
    } catch (error) {
      setOperationState({
        title: "장비 메타데이터 재수집 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  function handleToggleEquipmentCategory(
    section: EquipmentSection,
    categoryId: string,
  ) {
    setCollapsedEquipmentCategories((current) =>
      toggleSectionTrackedId(current, section, categoryId),
    );
  }

  function handleToggleCategoryEditor(
    section: EquipmentSection,
    categoryId: string,
  ) {
    setCollapsedCategoryEditors((current) =>
      toggleSectionTrackedId(current, section, categoryId),
    );
  }

  function handleToggleCategorySection(section: EquipmentSection) {
    setEquipmentSection(section);
    setExpandedCategorySections((current) =>
      toggleExpandedEquipmentSections(current, section),
    );
  }

  function handleToggleEquipmentItem(section: EquipmentSection, itemId: string) {
    setExpandedEquipmentItems((current) =>
      toggleSectionTrackedId(current, section, itemId),
    );
  }

  function handleChangeEquipmentItemCategory(
    section: EquipmentSection,
    itemId: string,
    categoryId: string,
  ) {
    const item = findEquipmentItem(equipment, section, itemId);

    if (!item) {
      return;
    }

    setEquipmentCategorySelectionDrafts((current) =>
      setEquipmentCategorySelectionDraft(
        current,
        section,
        itemId,
        categoryId === item.category ? null : categoryId,
      ),
    );
  }

  async function handleCreateEquipmentCategory(section: EquipmentSection) {
    const draft = categoryDrafts[section];
    const label = draft.label.trim();
    const manualCode = draft.id?.trim();

    if (!label) {
      setOperationState({
        title: "장비 카테고리 추가 실패",
        tone: "error",
        description: "카테고리 표시 이름을 입력해 주세요.",
      });
      return;
    }

    if (!manualCode) {
      setOperationState({
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
      setEquipmentSection(section);
      setExpandedCategorySections((current) =>
        current.includes(section)
          ? current
          : toggleExpandedEquipmentSections(current, section),
      );
      setEquipmentCategories((current) => ({
        ...current,
        [section]: [...current[section], response.item].sort(sortEquipmentCategories),
      }));
      setCategoryDrafts((current) => ({
        ...current,
        [section]: createEmptyEquipmentCategoryDraft(),
      }));
      setOperationState({
        title: "장비 카테고리 추가 완료",
        tone: "success",
        description: `${EQUIPMENT_SECTION_LABELS[section]} / ${response.item.label}`,
      });
    } catch (error) {
      setOperationState({
        title: "장비 카테고리 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveEquipmentCategory(
    section: EquipmentSection,
    categoryId: string,
  ) {
    const category = equipmentCategories[section].find((item) => item.id === categoryId);

    if (!category) {
      return;
    }

    try {
      const nextLabel = (
        categoryLabelDrafts[section][categoryId] ?? category.label
      ).trim();
      const response = await apiClient.updateEquipmentCategory(section, categoryId, {
        ...category,
        label: nextLabel,
      });
      setEquipmentCategories((current) => ({
        ...current,
        [section]: current[section]
          .map((item) => (item.id === categoryId ? response.item : item))
          .sort(sortEquipmentCategories),
      }));
      setCategoryLabelDrafts((current) => ({
        ...current,
        [section]: omitDraftLabel(current[section], categoryId),
      }));
      setOperationState({
        title: "장비 카테고리 저장 완료",
        tone: "success",
        description: `${EQUIPMENT_SECTION_LABELS[section]} / ${response.item.label}`,
      });
    } catch (error) {
      setOperationState({
        title: "장비 카테고리 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteEquipmentCategory(
    section: EquipmentSection,
    categoryId: string,
  ) {
    if (
      !confirmDeletion(`장비 카테고리를 삭제할까요?\n${EQUIPMENT_SECTION_LABELS[section]} / ${categoryId}`)
    ) {
      return;
    }

    try {
      await apiClient.deleteEquipmentCategory(section, categoryId);
      setEquipmentCategories((current) => ({
        ...current,
        [section]: current[section].filter((item) => item.id !== categoryId),
      }));
      setCategoryLabelDrafts((current) => ({
        ...current,
        [section]: omitDraftLabel(current[section], categoryId),
      }));
      setOperationState({
        title: "장비 카테고리 삭제 완료",
        tone: "success",
        description: `${EQUIPMENT_SECTION_LABELS[section]} / ${categoryId}`,
      });
    } catch (error) {
      setOperationState({
        title: "장비 카테고리 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveHistory() {
    if (!selectedHistory) return;

    try {
      const response = await apiClient.updateHistory(
        selectedHistory.history_id,
        selectedHistory,
      );
      setHistory((current) =>
        current.map((item) =>
          item.history_id === response.item.history_id ? response.item : item,
        ),
      );
      setOperationState({
        title: "히스토리 저장 완료",
        tone: "success",
        description: response.item.title,
      });
    } catch (error) {
      setOperationState({
        title: "히스토리 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleAddRetrospective() {
    if (!selectedHistory) {
      return;
    }

    setSavingRetrospective(true);

    try {
      const response = await apiClient.addHistoryRetrospective(
        selectedHistory.history_id,
        buildRetrospectiveInput(retrospectiveDraft),
      );

      setHistory((current) =>
        current.map((item) =>
          item.history_id === response.item.history_id ? response.item : item,
        ),
      );
      applyUserLearningStatus(response.learning_status);
      setRetrospectiveDraft(createEmptyRetrospectiveDraft());
      setHistoryLearningError(null);
      setOperationState({
        title: "후기 저장 완료",
        tone: "success",
        description: "회고를 저장했고 개인화 학습 업데이트를 시작했습니다.",
      });
    } catch (error) {
      setOperationState({
        title: "후기 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      setSavingRetrospective(false);
    }
  }

  async function handleOpenHistoryOutput() {
    if (!selectedHistory?.output_path) return;

    const requestedHistoryId = selectedHistory.history_id;
    const requestId = historyOutputRequestIdRef.current + 1;

    historyOutputRequestIdRef.current = requestId;
    setHistoryOutputLoading(true);
    setHistoryOutputError(null);

    try {
      const response = await apiClient.getOutput(selectedHistory.source_trip_id);

      if (
        selectedHistoryIdRef.current !== requestedHistoryId ||
        historyOutputRequestIdRef.current !== requestId
      ) {
        return;
      }

      setHistoryOutput(response);
      setOperationState({
        title: "히스토리 결과 불러오기 완료",
        tone: "success",
        description: response.output_path,
      });
    } catch (error) {
      if (
        selectedHistoryIdRef.current !== requestedHistoryId ||
        historyOutputRequestIdRef.current !== requestId
      ) {
        return;
      }

      setHistoryOutput(null);
      const message = getErrorMessage(error);
      setHistoryOutputError(message);
      setOperationState({
        title: "히스토리 결과 불러오기 실패",
        tone: "error",
        description: message,
      });
    } finally {
      if (
        selectedHistoryIdRef.current !== requestedHistoryId ||
        historyOutputRequestIdRef.current !== requestId
      ) {
        return;
      }

      setHistoryOutputLoading(false);
    }
  }

  function handleOpenHistoryOutputLayer() {
    if (!historyOutput?.markdown) {
      return;
    }

    setMarkdownLayer({
      eyebrow: "히스토리 결과 레이어",
      title: `${selectedHistory?.title ?? "보관 기록"} 저장 결과`,
      description:
        "아카이브 당시 저장된 Markdown 결과를 넓은 폭으로 다시 확인하는 보기입니다.",
      outputPath: historyOutput.output_path,
      markdown: historyOutput.markdown,
    });
  }

  async function handleDeleteHistory(historyId: string) {
    if (!confirmDeletion(`캠핑 히스토리를 삭제할까요?\n${historyId}`)) return;

    try {
      await apiClient.deleteHistory(historyId);
      const response = await apiClient.getHistory();
      setHistory(response.items);
      setSelectedHistoryId(response.items[0]?.history_id ?? null);
      setOperationState({
        title: "히스토리 삭제 완료",
        tone: "success",
        description: historyId,
      });
    } catch (error) {
      setOperationState({
        title: "히스토리 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleCreateLink() {
    try {
      const response = await apiClient.createLink(linkDraft);
      setLinks((current) => [...current, response.item].sort(sortLinks));
      setLinkDraft(createEmptyLink());
      setOperationState({
        title: "외부 링크 추가 완료",
        tone: "success",
        description: response.item.name,
      });
    } catch (error) {
      setOperationState({
        title: "외부 링크 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveLink(link: ExternalLink) {
    try {
      const response = await apiClient.updateLink(link.id, link);
      setLinks((current) =>
        current
          .map((item) => (item.id === response.item.id ? response.item : item))
          .sort(sortLinks),
      );
      setOperationState({
        title: "외부 링크 저장 완료",
        tone: "success",
        description: response.item.name,
      });
    } catch (error) {
      setOperationState({
        title: "외부 링크 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteLink(linkId: string) {
    if (!confirmDeletion(`외부 링크를 삭제할까요?\n${linkId}`)) return;

    try {
      await apiClient.deleteLink(linkId);
      setLinks((current) => current.filter((item) => item.id !== linkId));
      setOperationState({
        title: "외부 링크 삭제 완료",
        tone: "success",
        description: linkId,
      });
    } catch (error) {
      setOperationState({
        title: "외부 링크 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleCreateDataBackup() {
    setCreatingDataBackup(true);

    try {
      const response = await apiClient.createDataBackup();
      setOperationState({
        title: "로컬 데이터 백업 완료",
        tone: "success",
        description: response.item.backup_path,
      });
    } catch (error) {
      setOperationState({
        title: "로컬 데이터 백업 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      setCreatingDataBackup(false);
    }
  }

  async function handleCancelAllAiJobs() {
    if (
      !confirmDeletion(
        "현재 실행 중인 AI 분석과 장비 메타데이터 수집을 모두 중단하고 대기 큐를 비울까요?",
      )
    ) {
      return;
    }

    setStoppingAllAiJobs(true);

    try {
      const response = await apiClient.cancelAllAiJobs();

      if (selectedTripId && !isCreatingTrip) {
        await syncTripAnalysisStatus(selectedTripId, planningLoadRequestIdRef.current, {
          syncOutputOnComplete: false,
        });
      }

      const metadataStatuses = await apiClient.getDurableMetadataJobStatuses();
      applyDurableMetadataJobStatuses(metadataStatuses.items);

      setOperationState({
        title: "모든 AI 요청 중단 완료",
        tone: "success",
        description:
          response.cancelled_analysis_category_count > 0 ||
          response.cancelled_metadata_item_count > 0
            ? `분석 섹션 ${response.cancelled_analysis_category_count}개, 메타데이터 ${response.cancelled_metadata_item_count}건을 중단하고 queue를 비웠습니다.`
            : "중단할 AI 수집 작업이 없어 queue만 다시 정리했습니다.",
      });
    } catch (error) {
      setOperationState({
        title: "모든 AI 요청 중단 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      setStoppingAllAiJobs(false);
    }
  }

  function renderNavButton(
    page: PageKey,
    description: string,
    meta: string,
  ) {
    const isActive = activePage === page;
    const descriptionId = `nav-description-${page}`;

    return (
      <button
        aria-current={isActive ? "page" : undefined}
        aria-describedby={descriptionId}
        aria-label={PAGE_LABELS[page]}
        className={navButtonClass(isActive)}
        onClick={() => setActivePage(page)}
        type="button"
      >
        <span className="nav-button__head">
          <span className="nav-button__title">{PAGE_LABELS[page]}</span>
          <InfoTooltip text={description} />
        </span>
        <span aria-hidden="true" className="nav-button__meta">
          {meta}
        </span>
        <span className="sr-only" id={descriptionId}>
          {description}
        </span>
      </button>
    );
  }

  return (
    <div className="app-shell">
      {loadError ? (
        <StatusBanner tone="error" title="초기 로딩 실패" description={loadError} />
      ) : null}

      {bannerState ? (
        <StatusBanner
          tone={bannerState.tone}
          title={bannerState.title}
          description={bannerState.description}
          items={bannerState.items}
          onDismiss={() => setBannerState(null)}
        />
      ) : null}

      {operationState ? (
        <div className="floating-status-layer">
          <StatusBanner
            tone={operationState.tone}
            title={operationState.title}
            description={operationState.description}
            items={operationState.items}
            onDismiss={() => setOperationState(null)}
            variant="floating"
          />
        </div>
      ) : null}

      {markdownLayer ? (
        <MarkdownLayer
          description={markdownLayer.description}
          eyebrow={markdownLayer.eyebrow}
          markdown={markdownLayer.markdown}
          outputPath={markdownLayer.outputPath}
          title={markdownLayer.title}
          onClose={() => setMarkdownLayer(null)}
        />
      ) : null}

      <div className="app-layout">
        <aside className="side-nav panel panel--nav">
          <div className="panel__eyebrow">메뉴</div>
          <div className="nav-overview">
            <strong>읽기 쉬운 작업 흐름</strong>
            <p>
              메뉴를 운영 허브, 준비 데이터, 관리 설정으로 나눠 지금 해야 할 일과
              기준 데이터를 분리했습니다.
            </p>
          </div>
          <nav className="nav-sections" aria-label="주 메뉴">
            {NAVIGATION_GROUPS.map((group) => (
              <section className="nav-section" key={group.title}>
                <div className="nav-section__header">
                  <div className="nav-section__heading">
                    <span className="nav-section__title">{group.title}</span>
                    <InfoTooltip text={group.description} />
                    <span className="sr-only">{group.description}</span>
                  </div>
                </div>
                <div className="nav-list">
                  {group.items.includes("dashboard")
                    ? renderNavButton(
                        "dashboard",
                        "예정 계획, 최근 기록, 점검 경고를 먼저 확인합니다.",
                        `예정 ${dashboardMetrics.trips}건 · 경고 ${dashboardMetrics.alerts}건`,
                      )
                    : null}
                  {group.items.includes("planning")
                    ? renderNavButton(
                        "planning",
                        "trip 원본 입력, AI 보조, 분석을 한 흐름으로 진행합니다.",
                        `선택 ${currentTripLabel} · 검증 ${validationWarnings.length}건`,
                      )
                    : null}
                  {group.items.includes("history")
                    ? renderNavButton(
                        "history",
                        "완료된 계획과 저장된 결과를 다시 열어봅니다.",
                        `기록 ${dashboardMetrics.history}건 · 현재 ${currentHistoryLabel}`,
                      )
                    : null}
                  {group.items.includes("companions")
                    ? renderNavButton(
                        "companions",
                        "캠핑 인원 프로필을 미리 등록하고 계획에서는 선택만 합니다.",
                        `등록 ${dashboardMetrics.companions}명`,
                      )
                    : null}
                  {group.items.includes("vehicles")
                    ? renderNavButton(
                        "vehicles",
                        "차량 정보를 미리 저장하고 계획에서는 차량만 선택합니다.",
                        `등록 ${dashboardMetrics.vehicles}대`,
                      )
                    : null}
                  {group.items.includes("equipment")
                    ? renderNavButton(
                        "equipment",
                        "보유 장비, 소모품, 출발 전 점검을 같은 구조로 관리합니다.",
                        `항목 ${
                          equipmentMetrics.durable +
                          equipmentMetrics.consumables +
                          equipmentMetrics.precheck
                        }개 · 경고 ${dashboardMetrics.alerts}건`,
                      )
                    : null}
                  {group.items.includes("links")
                    ? renderNavButton(
                        "links",
                        "날씨, 장소, 맛집 같은 참고 링크를 카테고리별로 정리합니다.",
                        `링크 ${dashboardMetrics.links}건 · 그룹 ${linkGroups.length}개`,
                      )
                    : null}
                  {group.items.includes("categories")
                    ? renderNavButton(
                        "categories",
                        "장비 카테고리 기준과 로컬 백업을 관리합니다.",
                        `카테고리 ${equipmentMetrics.categories}개`,
                      )
                    : null}
                  {group.items.includes("help")
                    ? renderNavButton(
                        "help",
                        "주 작업 파일, 결과 파일, 보조 설명을 따로 모아 봅니다.",
                        `trip ${selectedTripId ? "선택됨" : "없음"} · 결과 ${
                          currentAnalysisOutputPath
                            ? isAnalysisPending
                              ? "분석 중"
                              : "연결됨"
                            : isAnalysisPending
                              ? "분석 중"
                              : "대기"
                        }`,
                      )
                    : null}
                </div>
              </section>
            ))}
          </nav>
          <div className="nav-actions">
            <button className="button button--primary" onClick={beginCreateTrip} type="button">
              새 캠핑 계획
            </button>
            <button
              className="button button--danger"
              disabled={stoppingAllAiJobs}
              onClick={handleCancelAllAiJobs}
              type="button"
            >
              {stoppingAllAiJobs ? "중단 처리 중..." : "모든 AI 요청 중단"}
            </button>
            <div className="nav-note nav-note--danger">
              <strong>AI 수집 초기화</strong>
              <span>
                실행 중인 분석과 장비 메타데이터 수집을 모두 멈추고 남아 있는
                대기 queue를 정리합니다.
              </span>
            </div>
          </div>
        </aside>

        <main className="content-panel">
          {appLoading ? (
            <section className="panel empty-state">
              초기 데이터를 불러오는 중...
            </section>
          ) : null}

          {!appLoading && activePage === "dashboard" ? (
            <section className="page-stack">
              <section className="page-intro page-intro--dashboard panel">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">운영 허브</div>
                  <h2>대시보드</h2>
                  <p className="panel__copy">
                    오늘 필요한 상태만 먼저 훑고, 계획 작성이나 장비 점검 같은 다음
                    작업으로 바로 넘어갈 수 있게 정리했습니다.
                  </p>
                </div>
                <div className="page-intro__meta page-intro__meta--three">
                  <div className="meta-chip">
                    <span>현재 선택 계획</span>
                    <strong>{selectedTripSummary?.title ?? "없음"}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>경고 항목</span>
                    <strong>{dashboardAlerts.length}건</strong>
                  </div>
                  <div className="meta-chip">
                    <span>링크 그룹</span>
                    <strong>{linkGroups.length}개</strong>
                  </div>
                </div>
              </section>

              <div aria-label="대시보드 보기" className="detail-tabs" role="tablist">
                {DASHBOARD_PAGE_TABS.map((tab) => {
                  const isActive = dashboardPageTab === tab;

                  return (
                    <button
                      key={tab}
                      aria-controls={isActive ? getDetailPanelId("dashboard-page", tab) : undefined}
                      aria-selected={isActive}
                      className={detailTabClass(isActive)}
                      id={getDetailTabId("dashboard-page", tab)}
                      onClick={() => setDashboardPageTab(tab)}
                      onKeyDown={(event) =>
                        handleDetailTabKeyDown(
                          event,
                          DASHBOARD_PAGE_TABS,
                          tab,
                          setDashboardPageTab,
                          "dashboard-page",
                        )
                      }
                      role="tab"
                      tabIndex={isActive ? 0 : -1}
                      type="button"
                    >
                      {DASHBOARD_PAGE_TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>

              <section
                aria-labelledby={activeDashboardPageTabId}
                className="detail-tab-panel"
                id={activeDashboardPagePanelId}
                role="tabpanel"
              >
                {dashboardPageTab === "overview" ? (
                <>
                  <section className="panel dashboard-grid__feature">
                    <div className="panel__eyebrow">운영 요약</div>
                    <div className="panel__header">
                      <h2>운영 현황</h2>
                    </div>
                    <div className="metric-grid metric-grid--feature">
                      <MetricCard label="예정 계획" value={`${dashboardMetrics.trips}건`} />
                      <MetricCard label="히스토리" value={`${dashboardMetrics.history}건`} />
                      <MetricCard label="점검/재고 경고" value={`${dashboardMetrics.alerts}건`} />
                      <MetricCard label="외부 링크" value={`${dashboardMetrics.links}건`} />
                    </div>
                  </section>

                  <div className="panel-stack">
                    <section className="panel">
                    <div className="panel__eyebrow">예정 계획</div>
                    <div className="panel__header">
                      <h2>곧 실행할 계획</h2>
                    </div>
                    {trips.length === 0 ? (
                      <div className="empty-state empty-state--compact">
                        아직 등록된 캠핑 계획이 없습니다.
                      </div>
                    ) : (
                      <div className="stack-list">
                        {trips.slice(0, 4).map((trip) => (
                          <button
                            key={trip.trip_id}
                            className="list-card"
                            onClick={() => {
                              setActivePage("planning");
                              setPlanningPageTab("editor");
                              selectTrip(trip.trip_id);
                            }}
                            type="button"
                          >
                            <strong>{trip.title}</strong>
                            <span>
                              {trip.start_date ?? "날짜 미입력"} / {trip.region ?? "지역 미입력"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="panel">
                    <div className="panel__eyebrow">점검 경고</div>
                    <div className="panel__header">
                      <h2>점검 경고</h2>
                    </div>
                    {dashboardAlerts.length === 0 ? (
                      <div className="empty-state empty-state--compact">
                        현재 확인이 필요한 장비 경고가 없습니다.
                      </div>
                    ) : (
                      <ul className="detail-list">
                        {dashboardAlerts.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                    </section>
                  </div>
                </>
                ) : null}

                {dashboardPageTab === "links" ? (
                <div className="panel-stack">
                  <section className="panel">
                    <div className="panel__eyebrow">최근 기록</div>
                    <div className="panel__header">
                      <h2>최근 히스토리</h2>
                    </div>
                    {history.length === 0 ? (
                      <div className="empty-state empty-state--compact">
                        아직 아카이브된 캠핑 히스토리가 없습니다.
                      </div>
                    ) : (
                      <div className="stack-list">
                        {history.slice(0, 4).map((item) => (
                          <button
                            key={item.history_id}
                            className="list-card"
                            onClick={() => {
                              setActivePage("history");
                              setHistoryPageTab("details");
                              setSelectedHistoryId(item.history_id);
                            }}
                            type="button"
                          >
                            <strong>{item.title}</strong>
                            <span>
                              {item.date?.start ?? "날짜 미입력"} /{" "}
                              {item.location?.region ?? "지역 미입력"} /{" "}
                              {item.attendee_count ?? item.companion_ids.length}명
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="panel">
                    <div className="panel__eyebrow">링크 현황</div>
                    <div className="panel__header">
                      <h2>외부 링크 요약</h2>
                    </div>
                    {linkGroups.length === 0 ? (
                      <div className="empty-state empty-state--compact">
                        등록된 외부 링크가 없습니다.
                      </div>
                    ) : (
                      <div className="stack-list">
                        {linkGroups.slice(0, 4).map((group) => (
                          <article className="summary-card" key={group.category}>
                            <strong>{group.label}</strong>
                            <span>{group.items.length}개 링크</span>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
                ) : null}

                {dashboardPageTab === "actions" ? (
                <div className="panel-stack">
                  <section className="panel">
                    <div className="panel__eyebrow">빠른 작업</div>
                    <div className="panel__header">
                      <h2>빠른 이동</h2>
                    </div>
                    <div className="stack-list">
                      <button
                        className="list-card"
                        onClick={() => setActivePage("planning")}
                        type="button"
                      >
                        <strong>캠핑 계획 열기</strong>
                        <span>저장된 계획을 편집하거나 분석을 다시 실행합니다.</span>
                      </button>
                      <button
                        className="list-card"
                        onClick={() => setActivePage("equipment")}
                        type="button"
                      >
                        <strong>장비 점검으로 이동</strong>
                        <span>재고와 출발 전 점검 상태를 바로 수정합니다.</span>
                      </button>
                      <button
                        className="list-card"
                        onClick={() => setActivePage("links")}
                        type="button"
                      >
                        <strong>외부 링크 정리</strong>
                        <span>날씨, 장소, 맛집 링크를 카테고리별로 관리합니다.</span>
                      </button>
                    </div>
                  </section>
                </div>
                ) : null}
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "companions" ? (
            <section className="page-stack">
              <section className="page-intro panel">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">준비 데이터</div>
                  <h2>사람 관리</h2>
                  <p className="panel__copy">
                    캠핑 인원 프로필을 미리 정리해 두고, 계획 화면에서는 동행자 선택과
                    요약 확인만 하도록 분리했습니다.
                  </p>
                </div>
                <div className="page-intro__meta">
                  <div className="meta-chip">
                    <span>등록 인원</span>
                    <strong>{companions.length}명</strong>
                  </div>
                  <div className="meta-chip">
                    <span>현재 계획 선택</span>
                    <strong>{selectedTripCompanions.length}명</strong>
                  </div>
                  <div className="meta-chip">
                    <span>건강 메모</span>
                    <strong>
                      {companions.filter((item) => item.health_notes.length > 0).length}명
                    </strong>
                  </div>
                  <div className="meta-chip">
                    <span>복용약 기록</span>
                    <strong>
                      {
                        companions.filter(
                          (item) => item.required_medications.length > 0,
                        ).length
                      }
                      명
                    </strong>
                  </div>
                </div>
              </section>

              <section className="page-stack">
                <div aria-label="사람 관리 보기" className="detail-tabs" role="tablist">
                  {COMPANION_PAGE_TABS.map((tab) => {
                    const isActive = companionPageTab === tab;

                    return (
                      <button
                        key={tab}
                        aria-controls={isActive ? getDetailPanelId("companion-page", tab) : undefined}
                        aria-selected={isActive}
                        className={detailTabClass(isActive)}
                        id={getDetailTabId("companion-page", tab)}
                        onClick={() => setCompanionPageTab(tab)}
                        onKeyDown={(event) =>
                          handleDetailTabKeyDown(
                            event,
                            COMPANION_PAGE_TABS,
                            tab,
                            setCompanionPageTab,
                            "companion-page",
                          )
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        {COMPANION_PAGE_TAB_LABELS[tab]}
                      </button>
                    );
                  })}
                </div>

                <section
                  aria-labelledby={activeCompanionPageTabId}
                  className="detail-tab-panel"
                  id={activeCompanionPagePanelId}
                  role="tabpanel"
                >
                  {companionPageTab === "list" ? (
                    <section className="panel">
                  <div className="panel__eyebrow">인원 목록</div>
                  <div className="panel__header">
                    <h2>등록된 사람</h2>
                    <span className="pill">{companions.length}명</span>
                  </div>
                  <div className="stack-list">
                    <button
                      className="button"
                      onClick={() => {
                        beginCreateCompanion();
                        setCompanionPageTab("editor");
                      }}
                      type="button"
                    >
                      새 사람 추가
                    </button>
                    {companions.length === 0 ? (
                      <div className="empty-state empty-state--compact">
                        아직 등록된 사람이 없습니다.
                      </div>
                    ) : (
                      companions.map((companion) => (
                        <button
                          key={companion.id}
                          className={`list-card${
                            editingCompanionId === companion.id ? " list-card--active" : ""
                          }`}
                          onClick={() => {
                            beginEditCompanion(companion);
                            setCompanionPageTab("editor");
                          }}
                          type="button"
                        >
                          <strong>{companion.name}</strong>
                          <span>
                            {AGE_GROUP_LABELS[companion.age_group]}
                            {companion.birth_year ? ` / ${companion.birth_year}년생` : ""}
                            {companion.required_medications[0]
                              ? ` / ${companion.required_medications[0]}`
                              : ""}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                    </section>
                  ) : null}

                  {companionPageTab === "editor" ? (
                    <section className="panel">
                  <div className="panel__eyebrow">프로필 편집</div>
                  <div className="panel__header">
                    <h2>{editingCompanionId ? "사람 정보 수정" : "새 사람 추가"}</h2>
                  </div>
                  <p className="panel__copy">
                    이름, 연령대, 건강 특이사항, 복용약과 민감도를 기록해 두면 계획과
                    분석에서 바로 활용합니다.
                  </p>
                  <div className="form-grid">
                    <FormField label="사람 ID">
                      <input
                        placeholder="예: child-2"
                        value={companionDraft.id}
                        disabled={Boolean(editingCompanionId)}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            id: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="이름">
                      <input
                        placeholder="이름"
                        value={companionDraft.name}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="연령대">
                      <select
                        value={companionDraft.age_group}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            age_group: event.target.value as Companion["age_group"],
                          }))
                        }
                      >
                        {Object.entries(AGE_GROUP_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="출생연도">
                      <input
                        type="number"
                        min="1900"
                        max="2100"
                        placeholder="예: 2018"
                        value={companionDraft.birth_year ?? ""}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            birth_year: parseInteger(event.target.value),
                          }))
                        }
                      />
                    </FormField>
                    <FormField full label="건강 특이사항">
                      <textarea
                        className="form-grid__full"
                        placeholder="알레르기, 추위 민감, 멀미, 수면 습관 등 준비물에 영향을 주는 내용을 줄 단위로 입력하세요."
                        value={joinLineList(companionDraft.health_notes)}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            health_notes: splitLineList(event.target.value),
                          }))
                        }
                      />
                    </FormField>
                    <FormField full label="필수 복용약">
                      <textarea
                        className="form-grid__full"
                        placeholder="반드시 챙겨야 하는 약, 체온계, 밴드 같은 의료 관련 준비물을 줄 단위로 입력하세요."
                        value={joinLineList(companionDraft.required_medications)}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            required_medications: splitLineList(event.target.value),
                          }))
                        }
                      />
                    </FormField>
                    <label className="checkbox-row">
                      <input
                        checked={companionDraft.traits.cold_sensitive ?? false}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            traits: {
                              ...current.traits,
                              cold_sensitive: event.target.checked,
                            },
                          }))
                        }
                        type="checkbox"
                      />
                      추위에 민감
                    </label>
                    <label className="checkbox-row">
                      <input
                        checked={companionDraft.traits.heat_sensitive ?? false}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            traits: {
                              ...current.traits,
                              heat_sensitive: event.target.checked,
                            },
                          }))
                        }
                        type="checkbox"
                      />
                      더위에 민감
                    </label>
                    <label className="checkbox-row">
                      <input
                        checked={companionDraft.traits.rain_sensitive ?? false}
                        onChange={(event) =>
                          setCompanionDraft((current) => ({
                            ...current,
                            traits: {
                              ...current.traits,
                              rain_sensitive: event.target.checked,
                            },
                          }))
                        }
                        type="checkbox"
                      />
                      비에 민감
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      className="button button--primary"
                      onClick={() =>
                        editingCompanionId
                          ? void handleSaveCompanion()
                          : void handleCreateCompanion()
                      }
                      type="button"
                    >
                      {editingCompanionId ? "사람 저장" : "사람 추가"}
                    </button>
                    <button className="button" onClick={() => beginCreateCompanion()} type="button">
                      새 입력으로 초기화
                    </button>
                    {editingCompanionId ? (
                      <button
                        className="button"
                        onClick={() => handleDeleteCompanion(editingCompanionId)}
                        type="button"
                      >
                        사람 삭제
                      </button>
                    ) : null}
                  </div>
                    </section>
                  ) : null}
                </section>
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "vehicles" ? (
            <section className="page-stack">
              <section className="page-intro panel">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">준비 데이터</div>
                  <h2>차량 관리</h2>
                  <p className="panel__copy">
                    자주 쓰는 차량 정보를 미리 저장해 두고, 계획 화면에서는 차량 선택과
                    요약 확인만 하도록 정리했습니다.
                  </p>
                </div>
                <div className="page-intro__meta">
                  <div className="meta-chip">
                    <span>등록 차량</span>
                    <strong>{vehicles.length}대</strong>
                  </div>
                  <div className="meta-chip">
                    <span>현재 계획 차량</span>
                    <strong>{selectedTripVehicle?.name ?? "미선택"}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>적재량 기록</span>
                    <strong>
                      {vehicles.filter((item) => item.load_capacity_kg).length}대
                    </strong>
                  </div>
                  <div className="meta-chip">
                    <span>탑승 인원 기록</span>
                    <strong>
                      {vehicles.filter((item) => item.passenger_capacity).length}대
                    </strong>
                  </div>
                </div>
              </section>

              <section className="page-stack">
                <div aria-label="차량 관리 보기" className="detail-tabs" role="tablist">
                  {VEHICLE_PAGE_TABS.map((tab) => {
                    const isActive = vehiclePageTab === tab;

                    return (
                      <button
                        key={tab}
                        aria-controls={isActive ? getDetailPanelId("vehicle-page", tab) : undefined}
                        aria-selected={isActive}
                        className={detailTabClass(isActive)}
                        id={getDetailTabId("vehicle-page", tab)}
                        onClick={() => setVehiclePageTab(tab)}
                        onKeyDown={(event) =>
                          handleDetailTabKeyDown(
                            event,
                            VEHICLE_PAGE_TABS,
                            tab,
                            setVehiclePageTab,
                            "vehicle-page",
                          )
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        {VEHICLE_PAGE_TAB_LABELS[tab]}
                      </button>
                    );
                  })}
                </div>

                <section
                  aria-labelledby={activeVehiclePageTabId}
                  className="detail-tab-panel"
                  id={activeVehiclePagePanelId}
                  role="tabpanel"
                >
                  {vehiclePageTab === "list" ? (
                    <section className="panel">
                  <div className="panel__eyebrow">차량 목록</div>
                  <div className="panel__header">
                    <h2>등록된 차량</h2>
                    <span className="pill">{vehicles.length}대</span>
                  </div>
                  <div className="stack-list">
                    <button
                      className="button"
                      onClick={() => {
                        beginCreateVehicle();
                        setVehiclePageTab("editor");
                      }}
                      type="button"
                    >
                      새 차량 추가
                    </button>
                    {vehicles.length === 0 ? (
                      <div className="empty-state empty-state--compact">
                        아직 등록된 차량이 없습니다.
                      </div>
                    ) : (
                      vehicles.map((vehicle) => (
                        <button
                          key={vehicle.id}
                          className={`list-card${
                            editingVehicleId === vehicle.id ? " list-card--active" : ""
                          }`}
                          onClick={() => {
                            beginEditVehicle(vehicle);
                            setVehiclePageTab("editor");
                          }}
                          type="button"
                        >
                          <strong>{vehicle.name}</strong>
                          <span>
                            {vehicle.passenger_capacity
                              ? `탑승 ${vehicle.passenger_capacity}명`
                              : "탑승 인원 미입력"}
                            {" / "}
                            {vehicle.load_capacity_kg
                              ? `적재 ${vehicle.load_capacity_kg}kg`
                              : "적재량 미입력"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                    </section>
                  ) : null}

                  {vehiclePageTab === "editor" ? (
                    <section className="panel">
                  <div className="panel__eyebrow">차량 편집</div>
                  <div className="panel__header">
                    <h2>{editingVehicleId ? "차량 정보 수정" : "새 차량 추가"}</h2>
                  </div>
                  <p className="panel__copy">
                    차종 설명, 탑승 인원, 적재량을 기록해 두면 매번 같은 값을 다시 입력할
                    필요가 없습니다.
                  </p>
                  <div className="form-grid">
                    <FormField label="차량 ID">
                      <input
                        placeholder="예: family-suv"
                        value={vehicleDraft.id ?? ""}
                        disabled={Boolean(editingVehicleId)}
                        onChange={(event) =>
                          setVehicleDraft((current) => ({
                            ...current,
                            id: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="표시 이름">
                      <input
                        placeholder="예: 패밀리 SUV"
                        value={vehicleDraft.name ?? ""}
                        onChange={(event) =>
                          setVehicleDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField full label="차량 설명">
                      <input
                        className="form-grid__full"
                        placeholder="예: 2열 독립 시트, 루프박스 없이 적재하는 주력 차량"
                        value={vehicleDraft.description ?? ""}
                        onChange={(event) =>
                          setVehicleDraft((current) => ({
                            ...current,
                            description: event.target.value || undefined,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="탑승 인원">
                      <input
                        type="number"
                        min="1"
                        placeholder="예: 5"
                        value={vehicleDraft.passenger_capacity ?? ""}
                        onChange={(event) =>
                          setVehicleDraft((current) => ({
                            ...current,
                            passenger_capacity: parseInteger(event.target.value),
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="적재량 (kg)">
                      <input
                        type="number"
                        min="0"
                        placeholder="예: 400"
                        value={vehicleDraft.load_capacity_kg ?? ""}
                        onChange={(event) =>
                          setVehicleDraft((current) => ({
                            ...current,
                            load_capacity_kg: parseNumber(event.target.value),
                          }))
                        }
                      />
                    </FormField>
                    <FormField full label="메모">
                      <textarea
                        className="form-grid__full"
                        placeholder="루프백 사용 여부, 적재 습관, 아이 카시트 배치 같은 메모를 줄 단위로 입력하세요."
                        value={joinLineList(vehicleDraft.notes)}
                        onChange={(event) =>
                          setVehicleDraft((current) => ({
                            ...current,
                            notes: splitLineList(event.target.value),
                          }))
                        }
                      />
                    </FormField>
                  </div>
                  <div className="button-row">
                    <button
                      className="button button--primary"
                      onClick={() =>
                        editingVehicleId
                          ? void handleSaveVehicle()
                          : void handleCreateVehicle()
                      }
                      type="button"
                    >
                      {editingVehicleId ? "차량 저장" : "차량 추가"}
                    </button>
                    <button className="button" onClick={beginCreateVehicle} type="button">
                      새 입력으로 초기화
                    </button>
                    {editingVehicleId ? (
                      <button
                        className="button"
                        onClick={() => handleDeleteVehicle(editingVehicleId)}
                        type="button"
                      >
                        차량 삭제
                      </button>
                    ) : null}
                  </div>
                    </section>
                  ) : null}
                </section>
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "equipment" ? (
            <section className="page-stack">
              <section className="page-intro panel">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">준비 데이터</div>
                  <h2>장비 점검과 재고 관리</h2>
                  <p className="panel__copy">
                    반복 장비, 소모품, 출발 전 점검을 같은 읽기 흐름으로 보고 현재 상태를
                    먼저 파악한 뒤 필요한 항목만 펼쳐 수정합니다.
                  </p>
                </div>
                <div className="page-intro__meta">
                  <div className="meta-chip">
                    <span>반복 장비</span>
                    <strong>{equipmentMetrics.durable}개</strong>
                  </div>
                  <div className="meta-chip">
                    <span>소모품</span>
                    <strong>{equipmentMetrics.consumables}개</strong>
                  </div>
                  <div className="meta-chip">
                    <span>점검 항목</span>
                    <strong>{equipmentMetrics.precheck}개</strong>
                  </div>
                  <div className="meta-chip">
                    <span>경고</span>
                    <strong>{equipmentMetrics.alerts}건</strong>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel__eyebrow">장비 개요</div>
                <div className="panel__header">
                  <h2>섹션 전환</h2>
                </div>
                <p className="panel__copy">
                  반복 장비, 소모품, 출발 전 점검을 같은 위치에서 전환해 흐름을 유지합니다.
                </p>
                <div className="metric-grid metric-grid--compact">
                  <MetricCard label="반복 장비" value={`${equipmentMetrics.durable}개`} />
                  <MetricCard label="소모품" value={`${equipmentMetrics.consumables}개`} />
                  <MetricCard label="출발 전 점검" value={`${equipmentMetrics.precheck}개`} />
                  <MetricCard label="카테고리" value={`${equipmentMetrics.categories}개`} />
                </div>
                <div aria-label="장비 섹션" className="equipment-tabs" role="tablist">
                  {EQUIPMENT_SECTIONS.map((section) => {
                    const isActive = equipmentSection === section;

                    return (
                      <button
                        key={section}
                        aria-controls={getEquipmentSectionPanelId(section)}
                        aria-selected={isActive}
                        className={equipmentTabClass(isActive)}
                        id={getEquipmentSectionTabId(section)}
                        onClick={() => setEquipmentSection(section)}
                        onKeyDown={(event) =>
                          handleEquipmentTabKeyDown(event, section)
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        {EQUIPMENT_SECTION_LABELS[section]}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div aria-label="장비 관리 보기" className="detail-tabs" role="tablist">
                {EQUIPMENT_PAGE_TABS.map((tab) => {
                  const isActive = equipmentPageTab === tab;

                  return (
                    <button
                      key={tab}
                      aria-controls={isActive ? getDetailPanelId("equipment-page", tab) : undefined}
                      aria-selected={isActive}
                      className={detailTabClass(isActive)}
                      id={getDetailTabId("equipment-page", tab)}
                      onClick={() => setEquipmentPageTab(tab)}
                      onKeyDown={(event) =>
                        handleDetailTabKeyDown(
                          event,
                          EQUIPMENT_PAGE_TABS,
                          tab,
                          setEquipmentPageTab,
                          "equipment-page",
                        )
                      }
                      role="tab"
                      tabIndex={isActive ? 0 : -1}
                      type="button"
                    >
                      {EQUIPMENT_PAGE_TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>

              <section
                aria-labelledby={activeEquipmentPageTabId}
                className="detail-tab-panel"
                id={activeEquipmentPagePanelId}
                role="tabpanel"
              >
                <section
                  aria-labelledby={activeEquipmentTabId}
                  className="equipment-tab-panel equipment-workspace"
                  id={activeEquipmentPanelId}
                  role="tabpanel"
                >
                {equipmentPageTab === "list" ? (
                <section className="panel">
                  <div className="panel__eyebrow">목록</div>
                  <div className="panel__header">
                    <h2>{`${currentEquipmentSectionLabel} 목록`}</h2>
                  </div>

                  {equipmentSection === "durable" ? (
                    <EquipmentList
                      section="durable"
                      categoryDrafts={equipmentCategorySelectionDrafts.durable}
                      categories={equipmentCategories.durable}
                      collapsedCategoryIds={collapsedEquipmentCategories.durable}
                      expandedItemIds={expandedEquipmentItems.durable}
                      items={equipment?.durable.items ?? []}
                      metadataJobStatuses={durableMetadataJobStatuses}
                      refreshingMetadataIds={refreshingDurableMetadataIds}
                      onDelete={(itemId) => handleDeleteEquipmentItem("durable", itemId)}
                      onRefreshMetadata={(itemId) => handleRefreshDurableMetadata(itemId)}
                      onSave={(itemId) => handleSaveEquipmentItem("durable", itemId)}
                      onToggleCategory={(categoryId) =>
                        handleToggleEquipmentCategory("durable", categoryId)
                      }
                    onToggleItem={(itemId) =>
                      handleToggleEquipmentItem("durable", itemId)
                    }
                    onCategoryChange={(itemId, categoryId) =>
                      handleChangeEquipmentItemCategory("durable", itemId, categoryId)
                    }
                    onChange={(itemId, updater) =>
                      setEquipment((current) =>
                        current
                            ? {
                                ...current,
                                durable: {
                                  ...current.durable,
                                  items: current.durable.items.map((item) =>
                                    item.id === itemId ? updater(item) : item,
                                  ),
                                },
                              }
                            : current,
                        )
                      }
                    />
                  ) : null}

                  {equipmentSection === "consumables" ? (
                    <ConsumableList
                      section="consumables"
                      categoryDrafts={equipmentCategorySelectionDrafts.consumables}
                      categories={equipmentCategories.consumables}
                      collapsedCategoryIds={collapsedEquipmentCategories.consumables}
                      expandedItemIds={expandedEquipmentItems.consumables}
                      items={equipment?.consumables.items ?? []}
                      onDelete={(itemId) =>
                        handleDeleteEquipmentItem("consumables", itemId)
                      }
                      onSave={(itemId) =>
                        handleSaveEquipmentItem("consumables", itemId)
                      }
                      onToggleCategory={(categoryId) =>
                        handleToggleEquipmentCategory("consumables", categoryId)
                      }
                    onToggleItem={(itemId) =>
                      handleToggleEquipmentItem("consumables", itemId)
                    }
                    onCategoryChange={(itemId, categoryId) =>
                      handleChangeEquipmentItemCategory(
                        "consumables",
                        itemId,
                        categoryId,
                      )
                    }
                    onChange={(itemId, updater) =>
                      setEquipment((current) =>
                        current
                            ? {
                                ...current,
                                consumables: {
                                  ...current.consumables,
                                  items: current.consumables.items.map((item) =>
                                    item.id === itemId ? updater(item) : item,
                                  ),
                                },
                              }
                            : current,
                        )
                      }
                    />
                  ) : null}

                  {equipmentSection === "precheck" ? (
                    <PrecheckList
                      section="precheck"
                      categoryDrafts={equipmentCategorySelectionDrafts.precheck}
                      categories={equipmentCategories.precheck}
                      collapsedCategoryIds={collapsedEquipmentCategories.precheck}
                      expandedItemIds={expandedEquipmentItems.precheck}
                      items={equipment?.precheck.items ?? []}
                      onDelete={(itemId) =>
                        handleDeleteEquipmentItem("precheck", itemId)
                      }
                      onSave={(itemId) => handleSaveEquipmentItem("precheck", itemId)}
                      onToggleCategory={(categoryId) =>
                        handleToggleEquipmentCategory("precheck", categoryId)
                      }
                    onToggleItem={(itemId) =>
                      handleToggleEquipmentItem("precheck", itemId)
                    }
                    onCategoryChange={(itemId, categoryId) =>
                      handleChangeEquipmentItemCategory("precheck", itemId, categoryId)
                    }
                    onChange={(itemId, updater) =>
                      setEquipment((current) =>
                        current
                            ? {
                                ...current,
                                precheck: {
                                  ...current.precheck,
                                  items: current.precheck.items.map((item) =>
                                    item.id === itemId ? updater(item) : item,
                                  ),
                                },
                              }
                            : current,
                        )
                      }
                    />
                  ) : null}
                </section>
                ) : null}

                {equipmentPageTab === "details" ? (
                <section className="panel equipment-side-stack detail-panel">
                  <div className="panel__eyebrow">현재 섹션</div>
                  <div className="panel__header">
                    <h2>{currentEquipmentSectionLabel} 상세</h2>
                  </div>
                  <div className="detail-shell">
                    <div className="summary-grid summary-grid--compact detail-summary-grid">
                      <article className="summary-card">
                        <span>현재 선택 섹션</span>
                        <strong>{currentEquipmentSectionLabel}</strong>
                        <p className="panel__copy">현재 보고 있는 장비 섹션 기준으로 작업합니다.</p>
                      </article>
                      <article className="summary-card">
                        <span>카테고리 수</span>
                        <strong>{currentEquipmentCategories.length}개</strong>
                        <p className="panel__copy">선택한 섹션에 연결된 카테고리 수입니다.</p>
                      </article>
                      <article className="summary-card">
                        <span>점검 경고</span>
                        <strong>{dashboardMetrics.alerts}건</strong>
                        <p className="panel__copy">소모품 부족과 출발 전 점검 경고를 함께 봅니다.</p>
                      </article>
                    </div>

                    <div aria-label="장비 상세 보기" className="detail-tabs" role="tablist">
                      {EQUIPMENT_DETAIL_TABS.map((tab) => {
                        const isActive = equipmentDetailTab === tab;

                        return (
                          <button
                            key={tab}
                            aria-controls={
                              isActive ? getDetailPanelId("equipment-detail", tab) : undefined
                            }
                            aria-selected={isActive}
                            className={detailTabClass(isActive)}
                            id={getDetailTabId("equipment-detail", tab)}
                            onClick={() => setEquipmentDetailTab(tab)}
                            onKeyDown={(event) =>
                              handleDetailTabKeyDown(
                                event,
                                EQUIPMENT_DETAIL_TABS,
                                tab,
                                setEquipmentDetailTab,
                                "equipment-detail",
                              )
                            }
                            role="tab"
                            tabIndex={isActive ? 0 : -1}
                            type="button"
                          >
                            {EQUIPMENT_DETAIL_TAB_LABELS[tab]}
                          </button>
                        );
                      })}
                    </div>

                    <section
                      aria-labelledby={activeEquipmentDetailTabId}
                      className="detail-tab-panel"
                      id={activeEquipmentDetailPanelId}
                      role="tabpanel"
                    >
                      {equipmentDetailTab === "summary" ? (
                        <>
                          <div className="section-label">
                            <strong>{currentEquipmentSectionLabel} 작업 요약</strong>
                            <p>
                              현재 섹션의 카테고리 수는 {currentEquipmentCategories.length}개이며,
                              왼쪽 목록에서 항목을 펼쳐 수정할 수 있습니다.
                            </p>
                          </div>
                          <div className="stack-list">
                            <article className="summary-card">
                              <strong>현재 선택 섹션</strong>
                              <span>{currentEquipmentSectionLabel}</span>
                            </article>
                            <article className="summary-card">
                              <strong>카테고리 수</strong>
                              <span>{currentEquipmentCategories.length}개</span>
                            </article>
                            <article className="summary-card">
                              <strong>점검 경고</strong>
                              <span>{dashboardMetrics.alerts}건</span>
                            </article>
                          </div>
                        </>
                      ) : null}

                      {equipmentDetailTab === "create" ? (
                        <>
                          <div className="section-label">
                            <strong>{`${currentEquipmentSectionLabel} 추가`}</strong>
                            <p>현재 선택된 섹션 기준으로 새 항목을 바로 추가합니다.</p>
                          </div>
                          {equipmentSection === "durable" ? (
                            <div className="form-grid">
                              <FormField label="장비명">
                                <input
                                  placeholder="예: 3계절 침낭"
                                  value={durableDraft.name}
                                  onChange={(event) =>
                                    setDurableDraft((current) => ({
                                      ...current,
                                      name: event.target.value,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="모델명">
                                <input
                                  placeholder="예: 머미형 800g"
                                  value={durableDraft.model ?? ""}
                                  onChange={(event) =>
                                    setDurableDraft((current) => ({
                                      ...current,
                                      model: event.target.value || undefined,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="카테고리">
                                <EquipmentCategorySelect
                                  categories={equipmentCategories.durable}
                                  value={durableDraft.category}
                                  onChange={(value) =>
                                    setDurableDraft((current) => ({
                                      ...current,
                                      category: value,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="수량">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="1"
                                  value={durableDraft.quantity}
                                  onChange={(event) =>
                                    setDurableDraft((current) => ({
                                      ...current,
                                      quantity: Number(event.target.value) || 1,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="상태">
                                <select
                                  value={durableDraft.status}
                                  onChange={(event) =>
                                    setDurableDraft((current) => ({
                                      ...current,
                                      status: event.target.value as DurableEquipmentItem["status"],
                                    }))
                                  }
                                >
                                  {Object.entries(DURABLE_STATUS_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </FormField>
                              <FormField label="구매 링크" full>
                                <input
                                  placeholder="https://"
                                  value={durableDraft.purchase_link ?? ""}
                                  onChange={(event) =>
                                    setDurableDraft((current) => ({
                                      ...current,
                                      purchase_link: event.target.value || undefined,
                                    }))
                                  }
                                />
                              </FormField>
                              <p className="equipment-helper-copy form-grid__full">
                                구매 링크가 있으면 AI 메타데이터 수집 시 우선 참고합니다.
                              </p>
                              <button
                                className="button button--primary form-grid__full"
                                onClick={() => handleCreateEquipmentItem("durable")}
                                type="button"
                              >
                                반복 장비 추가
                              </button>
                            </div>
                          ) : null}

                          {equipmentSection === "consumables" ? (
                            <div className="form-grid">
                              <FormField label="소모품명">
                                <input
                                  placeholder="예: 가스 캔"
                                  value={consumableDraft.name}
                                  onChange={(event) =>
                                    setConsumableDraft((current) => ({
                                      ...current,
                                      name: event.target.value,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="카테고리">
                                <EquipmentCategorySelect
                                  categories={equipmentCategories.consumables}
                                  value={consumableDraft.category}
                                  onChange={(value) =>
                                    setConsumableDraft((current) => ({
                                      ...current,
                                      category: value,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="단위">
                                <input
                                  placeholder="예: pack"
                                  value={consumableDraft.unit}
                                  onChange={(event) =>
                                    setConsumableDraft((current) => ({
                                      ...current,
                                      unit: event.target.value,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="현재 수량">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={consumableDraft.quantity_on_hand}
                                  onChange={(event) =>
                                    setConsumableDraft((current) => ({
                                      ...current,
                                      quantity_on_hand: Number(event.target.value) || 0,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="부족 기준">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="예: 2"
                                  value={consumableDraft.low_stock_threshold ?? ""}
                                  onChange={(event) =>
                                    setConsumableDraft((current) => ({
                                      ...current,
                                      low_stock_threshold: parseInteger(event.target.value),
                                    }))
                                  }
                                />
                              </FormField>
                              <button
                                className="button button--primary form-grid__full"
                                onClick={() => handleCreateEquipmentItem("consumables")}
                                type="button"
                              >
                                소모품 추가
                              </button>
                            </div>
                          ) : null}

                          {equipmentSection === "precheck" ? (
                            <div className="form-grid">
                              <FormField label="점검 항목명">
                                <input
                                  placeholder="예: 랜턴 배터리"
                                  value={precheckDraft.name}
                                  onChange={(event) =>
                                    setPrecheckDraft((current) => ({
                                      ...current,
                                      name: event.target.value,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="카테고리">
                                <EquipmentCategorySelect
                                  categories={equipmentCategories.precheck}
                                  value={precheckDraft.category}
                                  onChange={(value) =>
                                    setPrecheckDraft((current) => ({
                                      ...current,
                                      category: value,
                                    }))
                                  }
                                />
                              </FormField>
                              <FormField label="상태">
                                <select
                                  value={precheckDraft.status}
                                  onChange={(event) =>
                                    setPrecheckDraft((current) => ({
                                      ...current,
                                      status: event.target.value as PrecheckItem["status"],
                                    }))
                                  }
                                >
                                  {Object.entries(PRECHECK_STATUS_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </FormField>
                              <button
                                className="button button--primary form-grid__full"
                                onClick={() => handleCreateEquipmentItem("precheck")}
                                type="button"
                              >
                                점검 항목 추가
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </section>
                  </div>
                </section>
                ) : null}
                </section>
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "categories" ? (
            <section className="page-stack">
              <section className="page-intro panel">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">운영 설정</div>
                  <h2>카테고리 설정</h2>
                  <p className="panel__copy">
                    장비 섹션별 카테고리 기준을 한곳에서 관리하고, 필요한 순간에는 같은
                    화면에서 로컬 운영 데이터 백업까지 실행합니다.
                  </p>
                </div>
                <div className="page-intro__meta">
                  <div className="meta-chip">
                    <span>입력 대상 섹션</span>
                    <strong>{currentEquipmentSectionLabel}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>열린 섹션</span>
                    <strong>
                      {expandedCategorySectionCount === 0
                        ? "없음"
                        : `${expandedCategorySectionCount}개`}
                    </strong>
                  </div>
                  <div className="meta-chip">
                    <span>총 카테고리 수</span>
                    <strong>{equipmentMetrics.categories}개</strong>
                  </div>
                  <div className="meta-chip">
                    <span>백업 실행</span>
                    <strong>{creatingDataBackup ? "진행 중" : "가능"}</strong>
                  </div>
                </div>
              </section>

              <div aria-label="카테고리 설정 보기" className="detail-tabs" role="tablist">
                {CATEGORY_PAGE_TABS.map((tab) => {
                  const isActive = categoryPageTab === tab;

                  return (
                    <button
                      key={tab}
                      aria-controls={isActive ? getDetailPanelId("category-page", tab) : undefined}
                      aria-selected={isActive}
                      className={detailTabClass(isActive)}
                      id={getDetailTabId("category-page", tab)}
                      onClick={() => setCategoryPageTab(tab)}
                      onKeyDown={(event) =>
                        handleDetailTabKeyDown(
                          event,
                          CATEGORY_PAGE_TABS,
                          tab,
                          setCategoryPageTab,
                          "category-page",
                        )
                      }
                      role="tab"
                      tabIndex={isActive ? 0 : -1}
                      type="button"
                    >
                      {CATEGORY_PAGE_TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>

              <section
                aria-labelledby={activeCategoryPageTabId}
                className="detail-tab-panel"
                id={activeCategoryPagePanelId}
                role="tabpanel"
              >
                {categoryPageTab === "list" ? (
                <section className="panel">
                  <div className="panel__eyebrow">카테고리</div>
                  <div className="panel__header">
                    <h2>장비 카테고리 관리</h2>
                    <span className="pill">{equipmentMetrics.categories}개</span>
                  </div>
                  <p className="panel__copy">
                    장비 화면에서는 여기서 정한 카테고리만 선택합니다. 섹션 메뉴를 눌러
                    목록을 펼치고 닫을 수 있으며, 카테고리 코드는 내부 식별값으로
                    유지합니다.
                  </p>
                  <div className="stack-list">
                    {EQUIPMENT_SECTIONS.map((section) => {
                      const sectionCategories = equipmentCategories[section];
                      const sectionLabel = EQUIPMENT_SECTION_LABELS[section];
                      const isExpanded = expandedCategorySections.includes(section);
                      const sectionPanelId = `category-section-panel-${section}`;

                      return (
                        <article
                          className="equipment-category-card category-settings-section"
                          key={section}
                        >
                          <button
                            aria-controls={sectionPanelId}
                            aria-expanded={isExpanded}
                            aria-label={`${sectionLabel} 섹션 ${isExpanded ? "접기" : "펼치기"}`}
                            className="equipment-category-toggle category-settings-section__toggle"
                            onClick={() => handleToggleCategorySection(section)}
                            type="button"
                          >
                            <span className="equipment-category-toggle__content">
                              <span className="equipment-category-toggle__eyebrow">
                                카테고리 섹션
                              </span>
                              <strong>{sectionLabel}</strong>
                              <span>
                                {sectionCategories.length === 0
                                  ? "등록된 카테고리 없음"
                                  : `${sectionCategories.length}개 카테고리`}
                              </span>
                            </span>
                            <span className="category-settings-section__meta">
                              {equipmentSection === section ? (
                                <span className="pill">입력 대상</span>
                              ) : null}
                              <span className="equipment-category-toggle__state">
                                {isExpanded ? "접기" : "펼치기"}
                              </span>
                            </span>
                          </button>

                          {isExpanded ? (
                            <div
                              className="category-settings-section__body"
                              id={sectionPanelId}
                            >
                              {sectionCategories.length === 0 ? (
                                <div className="empty-state">
                                  이 섹션에 등록된 카테고리가 없습니다.
                                </div>
                              ) : (
                                <div className="stack-list">
                                  {sectionCategories.map((category) => {
                                    const editorPanelId =
                                      `category-editor-panel-${section}-${category.id}`;
                                    const isCollapsed =
                                      collapsedCategoryEditors[section].includes(category.id);
                                    const draftLabel =
                                      categoryLabelDrafts[section][category.id] ?? category.label;
                                    const accessibleLabel = draftLabel.trim() || category.label;

                                    return (
                                      <article
                                        className="edit-card category-editor-card"
                                        key={category.id}
                                      >
                                        <button
                                          aria-controls={editorPanelId}
                                          aria-expanded={!isCollapsed}
                                          aria-label={`${accessibleLabel} 카테고리 설정 ${isCollapsed ? "펼치기" : "접기"}`}
                                          className="category-editor-toggle"
                                          onClick={() =>
                                            handleToggleCategoryEditor(section, category.id)
                                          }
                                          type="button"
                                        >
                                          <span className="category-editor-toggle__content">
                                            <span className="category-editor-toggle__eyebrow">
                                              카테고리 설정
                                            </span>
                                            <strong>{draftLabel}</strong>
                                            <code>{category.id}</code>
                                          </span>
                                          <span className="category-editor-toggle__state">
                                            {isCollapsed ? "펼치기" : "접기"}
                                          </span>
                                        </button>

                                        {!isCollapsed ? (
                                          <div
                                            className="category-editor-body"
                                            id={editorPanelId}
                                          >
                                            <div className="form-grid">
                                              <FormField label="표시 이름">
                                                <input
                                                  placeholder="카테고리 표시 이름"
                                                  value={draftLabel}
                                                  onChange={(event) =>
                                                    setCategoryLabelDrafts((current) => ({
                                                      ...current,
                                                      [section]: {
                                                        ...current[section],
                                                        [category.id]: event.target.value,
                                                      },
                                                    }))
                                                  }
                                                />
                                              </FormField>
                                              <FormField label="카테고리 코드">
                                                <input value={category.id} readOnly />
                                              </FormField>
                                            </div>
                                            <div className="button-row">
                                              <button
                                                className="button"
                                                onClick={() =>
                                                  void handleSaveEquipmentCategory(
                                                    section,
                                                    category.id,
                                                  )
                                                }
                                                type="button"
                                              >
                                                저장
                                              </button>
                                              <button
                                                className="button"
                                                onClick={() =>
                                                  void handleDeleteEquipmentCategory(
                                                    section,
                                                    category.id,
                                                  )
                                                }
                                                type="button"
                                              >
                                                삭제
                                              </button>
                                            </div>
                                          </div>
                                        ) : null}
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
                ) : null}

                {categoryPageTab === "details" ? (
                <section className="panel categories-side-stack detail-panel">
                  <div className="panel__eyebrow">보조 작업</div>
                  <div className="panel__header">
                    <h2>카테고리 상세</h2>
                  </div>
                  <div className="detail-shell">
                    <div className="summary-grid summary-grid--compact detail-summary-grid">
                      <article className="summary-card">
                        <span>입력 대상</span>
                        <strong>{currentEquipmentSectionLabel}</strong>
                        <p className="panel__copy">새 카테고리는 현재 선택된 장비 섹션에 추가됩니다.</p>
                      </article>
                      <article className="summary-card">
                        <span>총 카테고리 수</span>
                        <strong>{equipmentMetrics.categories}개</strong>
                        <p className="panel__copy">장비 전 섹션 기준 카테고리 총합입니다.</p>
                      </article>
                      <article className="summary-card">
                        <span>백업 상태</span>
                        <strong>{creatingDataBackup ? "진행 중" : "가능"}</strong>
                        <p className="panel__copy">큰 수정 전 현재 로컬 운영 데이터를 수동 백업할 수 있습니다.</p>
                      </article>
                    </div>

                    <div aria-label="카테고리 상세 보기" className="detail-tabs" role="tablist">
                      {CATEGORY_DETAIL_TABS.map((tab) => {
                        const isActive = categoryDetailTab === tab;

                        return (
                          <button
                            key={tab}
                            aria-controls={
                              isActive ? getDetailPanelId("category-detail", tab) : undefined
                            }
                            aria-selected={isActive}
                            className={detailTabClass(isActive)}
                            id={getDetailTabId("category-detail", tab)}
                            onClick={() => setCategoryDetailTab(tab)}
                            onKeyDown={(event) =>
                              handleDetailTabKeyDown(
                                event,
                                CATEGORY_DETAIL_TABS,
                                tab,
                                setCategoryDetailTab,
                                "category-detail",
                              )
                            }
                            role="tab"
                            tabIndex={isActive ? 0 : -1}
                            type="button"
                          >
                            {CATEGORY_DETAIL_TAB_LABELS[tab]}
                          </button>
                        );
                      })}
                    </div>

                    <section
                      aria-labelledby={activeCategoryDetailTabId}
                      className="detail-tab-panel"
                      id={activeCategoryDetailPanelId}
                      role="tabpanel"
                    >
                      {categoryDetailTab === "create" ? (
                        <>
                          <div className="section-label">
                            <strong>새 카테고리 추가</strong>
                            <p>
                              카테고리 코드는 자동 생성하지 않습니다. 영문 소문자, 숫자,
                              하이픈(-), 밑줄(_) 형식으로 직접 입력합니다.
                            </p>
                          </div>
                          <div className="form-grid">
                            <FormField label="적용 섹션">
                              <input value={EQUIPMENT_SECTION_LABELS[equipmentSection]} readOnly />
                            </FormField>
                            <FormField label="카테고리 코드">
                              <input
                                placeholder="예: tarp"
                                value={categoryDrafts[equipmentSection].id ?? ""}
                                onChange={(event) =>
                                  setCategoryDrafts((current) => ({
                                    ...current,
                                    [equipmentSection]: {
                                      ...current[equipmentSection],
                                      id: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </FormField>
                            <FormField full label="표시 이름">
                              <input
                                className="form-grid__full"
                                placeholder="예: 수납"
                                value={categoryDrafts[equipmentSection].label}
                                onChange={(event) =>
                                  setCategoryDrafts((current) => ({
                                    ...current,
                                    [equipmentSection]: {
                                      ...current[equipmentSection],
                                      label: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </FormField>
                            <button
                              className="button button--primary form-grid__full"
                              onClick={() => void handleCreateEquipmentCategory(equipmentSection)}
                              type="button"
                            >
                              카테고리 추가
                            </button>
                          </div>
                        </>
                      ) : null}

                      {categoryDetailTab === "guidelines" ? (
                        <>
                          <div className="section-label">
                            <strong>관리 원칙</strong>
                            <p>카테고리 코드는 내부 기준값이므로 읽기 쉬운 표시 이름과 구분해 관리합니다.</p>
                          </div>
                          <ul className="detail-list">
                            <li>표시 이름은 사용자가 보는 라벨입니다.</li>
                            <li>카테고리 코드는 영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 허용됩니다.</li>
                            <li>이미 사용 중이거나 마지막 남은 카테고리는 삭제가 제한됩니다.</li>
                          </ul>
                        </>
                      ) : null}

                      {categoryDetailTab === "backup" ? (
                        <>
                          <div className="section-label">
                            <strong>로컬 운영 데이터 백업</strong>
                            <p>
                              현재 camping-data 폴더 상태를 camping-backups 아래에 시점별로 수동
                              백업합니다. 큰 수정 전에 현재 상태를 남길 때 사용합니다.
                            </p>
                          </div>
                          <div className="button-row">
                            <button
                              className="button button--primary"
                              disabled={creatingDataBackup}
                              onClick={() => void handleCreateDataBackup()}
                              type="button"
                            >
                              {creatingDataBackup ? "백업 생성 중..." : "지금 백업 생성"}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </section>
                  </div>
                </section>
                ) : null}
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "help" ? (
            <section className="page-stack">
              <section className="page-intro panel">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">보조 설명</div>
                  <h2>작업 파일과 생성 결과 안내</h2>
                  <p className="panel__copy">
                    메인 작업 흐름을 방해하지 않도록 파일 경로와 생성 규칙 같은 설명성
                    정보는 이 화면에만 모았습니다.
                  </p>
                </div>
                <div className="page-intro__meta page-intro__meta--three">
                  <div className="meta-chip">
                    <span>현재 계획 파일</span>
                    <strong>
                      {selectedTripId
                        ? `.camping-data/trips/${selectedTripId}.yaml`
                        : ".camping-data/trips/<trip-id>.yaml"}
                    </strong>
                  </div>
                  <div className="meta-chip">
                    <span>결과 Markdown</span>
                    <strong>{currentAnalysisOutputPath ?? "분석 실행 후 생성"}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>히스토리 파일</span>
                    <strong>
                      {selectedHistoryId
                        ? `.camping-data/history/${selectedHistoryId}.yaml`
                        : ".camping-data/history/<history-id>.yaml"}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="page-stack">
                <div aria-label="보조 설명 보기" className="detail-tabs" role="tablist">
                  {HELP_PAGE_TABS.map((tab) => {
                    const isActive = helpPageTab === tab;

                    return (
                      <button
                        key={tab}
                        aria-controls={isActive ? getDetailPanelId("help-page", tab) : undefined}
                        aria-selected={isActive}
                        className={detailTabClass(isActive)}
                        id={getDetailTabId("help-page", tab)}
                        onClick={() => setHelpPageTab(tab)}
                        onKeyDown={(event) =>
                          handleDetailTabKeyDown(
                            event,
                            HELP_PAGE_TABS,
                            tab,
                            setHelpPageTab,
                            "help-page",
                          )
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        {HELP_PAGE_TAB_LABELS[tab]}
                      </button>
                    );
                  })}
                </div>

                <section
                  aria-labelledby={activeHelpPageTabId}
                  className="detail-tab-panel"
                  id={activeHelpPagePanelId}
                  role="tabpanel"
                >
                  {helpPageTab === "files" ? (
                    <section className="panel">
                  <div className="panel__eyebrow">주 작업 파일</div>
                  <div className="panel__header">
                    <h2>기준 파일 안내</h2>
                  </div>
                  <div className="stack-list">
                    <article className="action-card">
                      <strong>주 작업 파일</strong>
                      <code className="output-path">
                        {selectedTripId
                          ? `.camping-data/trips/${selectedTripId}.yaml`
                          : ".camping-data/trips/<trip-id>.yaml"}
                      </code>
                      <p>캠핑 계획 저장 시 갱신되는 원본 입력 파일입니다.</p>
                    </article>
                    <article className="action-card">
                      <strong>결과 파일</strong>
                      <code className="output-path">
                        {currentAnalysisOutputPath ?? "분석 실행 후 생성"}
                      </code>
                      <p>분석 실행 후 저장되는 Markdown 결과 문서입니다.</p>
                    </article>
                    <article className="action-card">
                      <strong>히스토리 파일</strong>
                      <code className="output-path">
                        {selectedHistoryId
                          ? `.camping-data/history/${selectedHistoryId}.yaml`
                          : ".camping-data/history/<history-id>.yaml"}
                      </code>
                      <p>계획을 아카이브하면 당시 스냅샷과 메모가 이 파일에 저장됩니다.</p>
                    </article>
                  </div>
                    </section>
                  ) : null}

                  {helpPageTab === "guide" ? (
                    <div className="panel-stack">
                      <section className="panel">
                    <div className="panel__eyebrow">생성 규칙</div>
                    <div className="panel__header">
                      <h2>언제 무엇이 만들어지나</h2>
                    </div>
                    <ul className="detail-list">
                      <li>계획 저장 시 trips 폴더의 YAML 원본이 갱신됩니다.</li>
                      <li>분석 실행 후 outputs 폴더에 Markdown 결과가 생성되거나 덮어써집니다.</li>
                      <li>히스토리로 이동하면 history 폴더에 당시 스냅샷이 저장됩니다.</li>
                    </ul>
                  </section>

                  <section className="panel">
                    <div className="panel__eyebrow">운영 메모</div>
                    <div className="panel__header">
                      <h2>참고 사항</h2>
                    </div>
                    <div className="stack-list">
                      <article className="summary-card">
                        <strong>사람/차량 관리</strong>
                        <span>준비 데이터에서 미리 입력하고 계획에서는 선택만 합니다.</span>
                      </article>
                      <article className="summary-card">
                        <strong>히스토리 스냅샷</strong>
                        <span>아카이브 시점의 동행자/차량 요약이 함께 저장됩니다.</span>
                      </article>
                      <article className="summary-card">
                        <strong>보조 설명 위치</strong>
                        <span>경로, 생성 규칙 같은 정보는 이 메뉴에서만 확인합니다.</span>
                      </article>
                    </div>
                      </section>
                    </div>
                  ) : null}
                </section>
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "planning" ? (
            <section className="page-stack">
              <section className="page-intro panel">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">계획 실행</div>
                  <h2>캠핑 계획</h2>
                  <p className="panel__copy">
                    계획 목록, 원본 입력, AI 보조, 분석 결과를 같은 화면에서 다루되
                    사용자 입력과 AI 제안이 섞여 보이지 않게 작업 순서를 분리했습니다.
                  </p>
                </div>
                <div className="page-intro__meta">
                  <div className="meta-chip">
                    <span>선택된 계획</span>
                    <strong>{formatCompactTripId(selectedTripId) ?? "새 초안"}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>검증 경고</span>
                    <strong>{validationWarnings.length}건</strong>
                  </div>
                  <div className="meta-chip">
                    <span>선택 동행자</span>
                    <strong>{selectedTripCompanions.length}명</strong>
                  </div>
                  <div className="meta-chip">
                    <span>선택 차량</span>
                    <strong>{selectedTripVehicle?.name ?? "미선택"}</strong>
                  </div>
                </div>
              </section>

              <div aria-label="캠핑 계획 보기" className="detail-tabs" role="tablist">
                {PLANNING_PAGE_TABS.map((tab) => {
                  const isActive = planningPageTab === tab;

                  return (
                    <button
                      key={tab}
                      aria-controls={isActive ? getDetailPanelId("planning-page", tab) : undefined}
                      aria-selected={isActive}
                      className={detailTabClass(isActive)}
                      id={getDetailTabId("planning-page", tab)}
                      onClick={() => setPlanningPageTab(tab)}
                      onKeyDown={(event) =>
                        handleDetailTabKeyDown(
                          event,
                          PLANNING_PAGE_TABS,
                          tab,
                          setPlanningPageTab,
                          "planning-page",
                        )
                      }
                      role="tab"
                      tabIndex={isActive ? 0 : -1}
                      type="button"
                    >
                      {PLANNING_PAGE_TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>

              <section
                aria-labelledby={activePlanningPageTabId}
                className="detail-tab-panel"
                id={activePlanningPagePanelId}
                role="tabpanel"
              >
                {planningPageTab === "list" ? (
                <section className="panel">
                <div className="panel__eyebrow">계획 목록</div>
                <div className="panel__header">
                  <h2>캠핑 계획 목록</h2>
                  <span className="pill">{trips.length}건</span>
                </div>
                <div className="stack-list">
                  <button
                    className="button"
                    onClick={() => {
                      beginCreateTrip();
                      setPlanningPageTab("editor");
                    }}
                    type="button"
                  >
                    새 계획 작성
                  </button>
                  {trips.map((trip) => (
                    <button
                      key={trip.trip_id}
                      className={`list-card${
                        selectedTripId === trip.trip_id && !isCreatingTrip
                          ? " list-card--active"
                          : ""
                      }`}
                      onClick={() => {
                        selectTrip(trip.trip_id);
                        setPlanningPageTab("editor");
                      }}
                      type="button"
                    >
                      <strong>{trip.title}</strong>
                      <span>
                        {trip.start_date ?? "날짜 미입력"} / {trip.region ?? "지역 미입력"}
                      </span>
                    </button>
                  ))}
                </div>
                </section>
                ) : null}

                {planningPageTab === "editor" ? (
                <section className="panel">
                <div className="panel__eyebrow">원본 입력</div>
                <div className="panel__header">
                  <h2>계획 편집</h2>
                </div>

                {detailLoading ? <div className="empty-state">trip 상세를 불러오는 중...</div> : null}

                {!detailLoading && tripDraft ? (
                  <>
                    <div className="form-grid">
                      <FormField label="계획 제목">
                        <input
                          placeholder="새 캠핑 계획"
                          value={tripDraft.title}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="시작일">
                        <input
                          type="date"
                          value={tripDraft.date?.start ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              date: {
                                ...current.date,
                                start: event.target.value || undefined,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="종료일">
                        <input
                          type="date"
                          value={tripDraft.date?.end ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              date: {
                                ...current.date,
                                end: event.target.value || undefined,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="캠핑장 이름">
                        <input
                          placeholder="예: 솔숲 캠핑장"
                          value={tripDraft.location?.campsite_name ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              location: {
                                ...current.location,
                                campsite_name: event.target.value || undefined,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="지역">
                        <input
                          placeholder="예: 강원 속초"
                          value={tripDraft.location?.region ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              location: {
                                ...current.location,
                                region: event.target.value || undefined,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="출발 지역">
                        <input
                          placeholder="예: 서울 마포"
                          value={tripDraft.departure?.region ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              departure: {
                                ...current.departure,
                                region: event.target.value || undefined,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField full label="동행자 선택">
                        <div className="selection-block form-grid__full">
                          <div className="selection-block__header">
                            <div>
                              <strong>등록된 사람 목록에서 이번 동행자를 고르세요.</strong>
                              <p>
                                계획에는 선택만 남기고, 상세 프로필 수정은 사람 관리에서
                                따로 다룹니다.
                              </p>
                            </div>
                            <button
                              className="button"
                              onClick={() => setActivePage("companions")}
                              type="button"
                            >
                              사람 관리 열기
                            </button>
                          </div>

                          {companions.length > 0 ? (
                            <div className="choice-list">
                              {companions.map((companion) => {
                                const included =
                                  tripDraft.party?.companion_ids.includes(companion.id) ?? false;

                                return (
                                  <label
                                    className={`choice-card${
                                      included ? " choice-card--active" : ""
                                    }`}
                                    key={companion.id}
                                  >
                                    <input
                                      checked={included}
                                      onChange={() =>
                                        updateTripDraft((current) => ({
                                          ...current,
                                          party: {
                                            companion_ids: toggleSelectionId(
                                              current.party?.companion_ids ?? [],
                                              companion.id,
                                            ),
                                          },
                                        }))
                                      }
                                      type="checkbox"
                                    />
                                    <div className="choice-card__body">
                                      <strong>{companion.name}</strong>
                                      <span>
                                        {AGE_GROUP_LABELS[companion.age_group]}
                                        {companion.birth_year
                                          ? ` / ${companion.birth_year}년생`
                                          : ""}
                                        {companion.health_notes[0]
                                          ? ` / ${companion.health_notes[0]}`
                                          : ""}
                                      </span>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="empty-state empty-state--compact">
                              등록된 사람이 없습니다. 사람 관리에서 먼저 프로필을 추가하세요.
                            </div>
                          )}

                          {selectedTripCompanions.length > 0 ? (
                            <div className="summary-grid summary-grid--compact">
                              {selectedTripCompanions.map((companion) => (
                                <article className="summary-card" key={companion.id}>
                                  <span>{companion.id}</span>
                                  <strong>{companion.name}</strong>
                                  <p className="panel__copy">
                                    {AGE_GROUP_LABELS[companion.age_group]}
                                    {companion.required_medications[0]
                                      ? ` / 복용약 ${companion.required_medications[0]}`
                                      : ""}
                                  </p>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-state empty-state--compact">
                              동행자를 선택하면 요약 정보가 여기 표시됩니다.
                            </div>
                          )}

                          {missingCompanionIds.length > 0 ? (
                            <div className="action-card">
                              <strong>기존 계획에만 남아 있는 동행자 ID</strong>
                              <p>{missingCompanionIds.join(", ")} 를 사람 관리에서 정리하세요.</p>
                            </div>
                          ) : null}
                        </div>
                      </FormField>
                      <FormField full label="차량 선택">
                        <div className="selection-block form-grid__full">
                          <div className="selection-block__header">
                            <div>
                              <strong>사전에 등록한 차량에서 이번 이동 차량을 선택하세요.</strong>
                              <p>
                                선택하면 탑승 인원과 적재량 요약이 계획에 함께 반영됩니다.
                              </p>
                            </div>
                            <button
                              className="button"
                              onClick={() => setActivePage("vehicles")}
                              type="button"
                            >
                              차량 관리 열기
                            </button>
                          </div>
                          <select
                            aria-label="차량 선택"
                            value={tripDraft.vehicle?.id ?? ""}
                            onChange={(event) =>
                              updateTripDraft((current) => ({
                                ...current,
                                vehicle: buildTripVehicleSelection(
                                  event.target.value,
                                  vehicles,
                                  current.vehicle,
                                ),
                              }))
                            }
                          >
                            <option value="">차량을 선택하세요</option>
                            {buildVehicleOptions(vehicles, tripDraft.vehicle).map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>
                                {vehicle.name}
                              </option>
                            ))}
                          </select>

                          {selectedTripVehicle ? (
                            <article className="summary-card">
                              <span>{selectedTripVehicle.id}</span>
                              <strong>{selectedTripVehicle.name}</strong>
                              <p className="panel__copy">
                                {selectedTripVehicle.description ?? "차량 설명 없음"}
                              </p>
                              <div className="button-row button-row--compact">
                                <span className="pill">
                                  탑승 {selectedTripVehicle.passenger_capacity ?? "미입력"}명
                                </span>
                                <span className="pill">
                                  적재 {selectedTripVehicle.load_capacity_kg ?? "미입력"}kg
                                </span>
                              </div>
                            </article>
                          ) : (
                            <div className="empty-state empty-state--compact">
                              차량을 선택하면 요약 정보가 여기 표시됩니다.
                            </div>
                          )}
                        </div>
                      </FormField>
                      <FormField label="날씨 요약">
                        <input
                          placeholder="예: 흐리고 바람 강함"
                          value={tripDraft.conditions?.expected_weather?.summary ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              conditions: {
                                ...current.conditions,
                                expected_weather: {
                                  ...current.conditions?.expected_weather,
                                  summary: event.target.value || undefined,
                                },
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="강수 정보">
                        <input
                          placeholder="예: 오후 비 예보"
                          value={tripDraft.conditions?.expected_weather?.precipitation ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              conditions: {
                                ...current.conditions,
                                expected_weather: {
                                  ...current.conditions?.expected_weather,
                                  precipitation: event.target.value || undefined,
                                },
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="전기 사용">
                        <label className="checkbox-row">
                          <input
                            checked={tripDraft.conditions?.electricity_available ?? false}
                            onChange={(event) =>
                              updateTripDraft((current) => ({
                                ...current,
                                conditions: {
                                  ...current.conditions,
                                  electricity_available: event.target.checked,
                                },
                              }))
                            }
                            type="checkbox"
                          />
                          전기 사용 가능
                        </label>
                      </FormField>
                      <FormField label="취사 가능 여부">
                        <label className="checkbox-row">
                          <input
                            checked={tripDraft.conditions?.cooking_allowed ?? false}
                            onChange={(event) =>
                              updateTripDraft((current) => ({
                                ...current,
                                conditions: {
                                  ...current.conditions,
                                  cooking_allowed: event.target.checked,
                                },
                              }))
                            }
                            type="checkbox"
                          />
                          취사 가능
                        </label>
                      </FormField>
                      <FormField label="요청 메뉴">
                        <input
                          placeholder="콤마로 구분 (예: 바비큐, 어묵탕)"
                          value={commaInputs.requestedDishes}
                          onChange={(event) => {
                            setCommaInputs((current) => ({
                              ...current,
                              requestedDishes: event.target.value,
                            }));
                            updateTripDraft((current) => ({
                              ...current,
                              meal_plan: {
                                ...current.meal_plan,
                                use_ai_recommendation:
                                  current.meal_plan?.use_ai_recommendation ?? true,
                                requested_dishes: splitCommaList(event.target.value),
                              },
                            }));
                          }}
                        />
                      </FormField>
                      <FormField label="경유 희망지">
                        <input
                          placeholder="콤마로 구분 (예: 휴게소, 시장)"
                          value={commaInputs.requestedStops}
                          onChange={(event) => {
                            setCommaInputs((current) => ({
                              ...current,
                              requestedStops: event.target.value,
                            }));
                            updateTripDraft((current) => ({
                              ...current,
                              travel_plan: {
                                ...current.travel_plan,
                                use_ai_recommendation:
                                  current.travel_plan?.use_ai_recommendation ?? true,
                                requested_stops: splitCommaList(event.target.value),
                              },
                            }));
                          }}
                        />
                      </FormField>
                      <FormField full label="메모">
                        <textarea
                          className="form-grid__full"
                          placeholder="사이트 특이사항, 출발 전 꼭 챙길 것, 당일 일정 메모, 아직 장비/링크로 옮기지 않은 임시 메모를 줄 단위로 적어두세요."
                          value={joinLineList(tripDraft.notes)}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              notes: splitLineList(event.target.value),
                            }))
                          }
                        />
                      </FormField>
                    </div>

                    {validationWarnings.length > 0 ? (
                      <StatusBanner
                        tone="warning"
                        title="분석 경고"
                        items={validationWarnings}
                        description="아직 값이 덜 채워진 항목이 있습니다."
                      />
                    ) : (
                      <StatusBanner
                        tone="success"
                        title="분석 준비 상태 양호"
                        description="현재 기준으로 분석 실행이 가능합니다."
                      />
                    )}

                    <div className="action-row">
                      <div className="button-row">
                        <button
                          className="button"
                          disabled={savingTrip}
                          onClick={handleSaveTrip}
                          type="button"
                        >
                          {savingTrip ? "저장 중..." : "계획 저장"}
                        </button>
                        {!isCreatingTrip ? (
                          <button
                            className="button"
                            disabled={isAnalysisPending}
                            onClick={handleArchiveTrip}
                            type="button"
                          >
                            히스토리로 이동
                          </button>
                        ) : null}
                        {!isCreatingTrip ? (
                          <button
                            className="button"
                            disabled={isAnalysisPending}
                            onClick={handleDeleteTrip}
                            type="button"
                          >
                            계획 삭제
                          </button>
                        ) : null}
                        {!isCreatingTrip ? (
                          <button
                            className="button button--primary"
                            disabled={isAnalysisPending}
                            onClick={handleAnalyzeAll}
                            type="button"
                          >
                            {isAnalysisPending ? "분석 중..." : "전체 분석 실행"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : null}

                {!detailLoading && !tripDraft ? (
                  <div className="empty-state">
                    왼쪽에서 계획을 선택하거나 새 계획을 시작하세요.
                  </div>
                ) : null}
                </section>
                ) : null}

                {planningPageTab === "details" ? (
                <section className="panel planning-side-stack detail-panel">
                  <div className="panel__eyebrow">상세 보기</div>
                  <div className="panel__header">
                    <h2>AI 보조와 분석</h2>
                  </div>
                  <div className="detail-shell">
                    <div className="summary-grid summary-grid--compact detail-summary-grid">
                      <article className="summary-card">
                        <span>누적 학습</span>
                        <strong>{currentUserLearningStatusLabel}</strong>
                        <p className="panel__copy">
                          {userLearningProfile
                            ? `히스토리 ${userLearningProfile.source_history_ids.length}건 / 회고 ${userLearningProfile.source_entry_count}건 반영`
                            : "아직 누적 회고 학습 프로필이 없습니다."}
                        </p>
                      </article>
                      <article className="summary-card">
                        <span>AI 보조</span>
                        <strong>
                          {!selectedTripId
                            ? "저장 필요"
                            : assistantLoading
                              ? "응답 생성 중"
                              : assistantResponse
                                ? "응답 있음"
                                : "대기"}
                        </strong>
                        <p className="panel__copy">
                          저장된 계획을 기준으로 질문하고, 필요한 제안만 직접 반영합니다.
                        </p>
                      </article>
                      <article className="summary-card">
                        <span>분석 상태</span>
                        <strong>
                          {getTripAnalysisStatusLabel(analysisStatus?.status ?? "idle")}
                        </strong>
                        <p className="panel__copy">
                          {selectedTripId
                            ? `섹션 ${completedAnalysisCategoryCount}/${analysisCategoryStatuses.length}개 완료`
                            : "저장된 계획을 선택하면 분석 상태를 보여 줍니다."}
                        </p>
                      </article>
                    </div>

                    {isUserLearningPending ? (
                      <StatusBanner
                        tone="info"
                        title="개인화 학습 업데이트 중"
                        description="최신 회고를 반영해 다음 계획 힌트를 다시 합성하고 있습니다."
                      />
                    ) : null}
                    {userLearningStatus.status === "failed" ? (
                      <StatusBanner
                        tone="error"
                        title="개인화 학습 실패"
                        description={
                          userLearningStatus.error?.message ??
                          "회고 학습 결과를 다시 만들지 못했습니다."
                        }
                      />
                    ) : null}
                    {analysisStatus?.status === "queued" || analysisStatus?.status === "running" ? (
                      <StatusBanner
                        tone="info"
                        title="백그라운드 분석 진행 중"
                        description="선택한 섹션을 순차적으로 수집 중입니다. 완료될 때마다 최신 Markdown을 자동으로 다시 불러옵니다."
                      />
                    ) : null}
                    {analysisStatus?.status === "failed" ? (
                      <StatusBanner
                        tone="error"
                        title="분석 실패"
                        description={
                          analysisStatus.error?.message ??
                          "백그라운드 분석 작업이 실패했습니다."
                        }
                      />
                    ) : null}
                    {analysisStatus?.status === "interrupted" ? (
                      <StatusBanner
                        tone="warning"
                        title="분석 중단"
                        description={
                          analysisStatus.error?.message ??
                          "이전 분석 작업이 중단되었습니다. 다시 실행해 주세요."
                        }
                      />
                    ) : null}
                    {analysisStatus?.status === "completed" && !analysisOutput?.markdown ? (
                      <StatusBanner
                        tone="warning"
                        title="결과 동기화 대기"
                        description="분석은 끝났지만 결과 Markdown을 아직 다시 불러오지 못했습니다."
                      />
                    ) : null}

                    <div aria-label="계획 상세 보기" className="detail-tabs" role="tablist">
                      {PLANNING_DETAIL_TABS.map((tab) => {
                        const isActive = planningDetailTab === tab;

                        return (
                          <button
                            key={tab}
                            aria-controls={
                              isActive ? getDetailPanelId("planning-detail", tab) : undefined
                            }
                            aria-selected={isActive}
                            className={detailTabClass(isActive)}
                            id={getDetailTabId("planning-detail", tab)}
                            onClick={() => setPlanningDetailTab(tab)}
                            onKeyDown={(event) =>
                              handleDetailTabKeyDown(
                                event,
                                PLANNING_DETAIL_TABS,
                                tab,
                                setPlanningDetailTab,
                                "planning-detail",
                              )
                            }
                            role="tab"
                            tabIndex={isActive ? 0 : -1}
                            type="button"
                          >
                            {PLANNING_DETAIL_TAB_LABELS[tab]}
                          </button>
                        );
                      })}
                    </div>

                    <section
                      aria-labelledby={activePlanningDetailTabId}
                      className="detail-tab-panel"
                      id={activePlanningDetailPanelId}
                      role="tabpanel"
                    >
                      {planningDetailTab === "learning" ? (
                        <>
                          <div className="section-label">
                            <strong>개인화 학습 요약</strong>
                            <p>히스토리 회고가 누적될수록 다음 계획과 AI 보조에 자동 반영됩니다.</p>
                          </div>
                          {userLearningProfile ? (
                            <div className="stack-list">
                              <div className="action-card">
                                <strong>요약</strong>
                                <p>{userLearningProfile.summary}</p>
                              </div>
                              {userLearningProfile.behavior_patterns[0] ? (
                                <div className="action-card">
                                  <strong>행동 패턴</strong>
                                  <p>{userLearningProfile.behavior_patterns.join(" / ")}</p>
                                </div>
                              ) : null}
                              {userLearningProfile.equipment_hints[0] ? (
                                <div className="action-card">
                                  <strong>장비 힌트</strong>
                                  <p>{userLearningProfile.equipment_hints.join(" / ")}</p>
                                </div>
                              ) : null}
                              {userLearningProfile.next_trip_focus[0] ? (
                                <div className="action-card">
                                  <strong>다음 계획 포커스</strong>
                                  <p>{userLearningProfile.next_trip_focus.join(" / ")}</p>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="empty-state empty-state--compact">
                              히스토리 상세에서 실제 후기와 회고를 쌓으면 여기에 개인화 학습 요약이 표시됩니다.
                            </div>
                          )}
                        </>
                      ) : null}

                      {planningDetailTab === "assistant" ? (
                        <>
                          <div className="stack-list usage-guide-list">
                            <div className="action-card">
                              <strong>AI 보조는 저장 후 질문할 때 사용</strong>
                              <p>
                                분석 전에 빠진 정보, 장비 보강 포인트, 먼저 수정할 항목을
                                확인할 때 사용합니다.
                              </p>
                            </div>
                            <div className="action-card">
                              <strong>AI 제안은 자동 반영되지 않음</strong>
                              <p>
                                제안과 실제 저장을 분리해, 사용자가 확인한 액션만 명시적으로
                                반영합니다.
                              </p>
                            </div>
                          </div>

                          {selectedTripId ? (
                            <>
                              <div className="section-label">
                                <strong>AI 보조</strong>
                                <p>
                                  저장된 계획을 기준으로 먼저 물어보고, 필요한 제안만 직접
                                  반영합니다.
                                </p>
                              </div>
                              <div className="assistant-box">
                                <textarea
                                  placeholder="예: 빠진 준비물이 있는지 먼저 점검해줘. 비 예보와 아이 동행 기준으로 알려줘"
                                  value={assistantInput}
                                  onChange={(event) => setAssistantInput(event.target.value)}
                                />
                                <button
                                  className="button button--primary"
                                  disabled={assistantLoading}
                                  onClick={handleAssistantSubmit}
                                  type="button"
                                >
                                  {assistantLoading ? "응답 생성 중..." : "AI에게 물어보기"}
                                </button>
                              </div>

                              {assistantResponse ? (
                                <>
                                  <StatusBanner
                                    tone="info"
                                    title="AI 보조 응답"
                                    description="제안은 자동 반영되지 않으며, 아래 액션을 눌러야 실제 파일이 수정됩니다."
                                    items={assistantResponse.warnings}
                                  />
                                  <article className="markdown-pane markdown-pane--compact">
                                    <ReactMarkdown>{assistantResponse.assistant_message}</ReactMarkdown>
                                  </article>
                                  <div className="stack-list">
                                    {assistantResponse.actions.map((action) => (
                                      <div className="action-card" key={action.id}>
                                        <strong>{action.title}</strong>
                                        <p>{action.reason}</p>
                                        <button
                                          className="button"
                                          onClick={() => handleApplyAssistantAction(action)}
                                          type="button"
                                        >
                                          제안 반영
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <div className="empty-state">
                              AI 보조는 저장된 계획에서만 실행할 수 있습니다.
                            </div>
                          )}
                        </>
                      ) : null}

                      {planningDetailTab === "analysis" ? (
                        selectedTripId ? (
                          <>
                            <div className="detail-tab-panel__header">
                              <div className="section-label section-label--analysis">
                                <strong>섹션별 분석</strong>
                                <p>
                                  필요한 섹션만 먼저 수집하고, 누적된 결과를 하나의 Markdown
                                  플랜으로 계속 합성합니다.
                                </p>
                              </div>
                              {analysisOutput?.markdown ? (
                                <button
                                  className="button"
                                  onClick={handleOpenAnalysisLayer}
                                  type="button"
                                >
                                  넓게 보기
                                </button>
                              ) : null}
                            </div>
                            <div className="analysis-category-summary">
                              <div className="meta-chip">
                                <span>전체 섹션</span>
                                <strong>{analysisCategoryStatuses.length}개</strong>
                              </div>
                              <div className="meta-chip">
                                <span>수집 완료</span>
                                <strong>{completedAnalysisCategoryCount}개</strong>
                              </div>
                              <div className="meta-chip">
                                <span>선택 상태</span>
                                <strong>{selectedAnalysisCategories.length}개 선택</strong>
                              </div>
                            </div>
                            <div className="analysis-category-toolbar">
                              <div className="button-row">
                                <button
                                  className="button"
                                  onClick={selectAllAnalysisCategories}
                                  type="button"
                                >
                                  전체 선택
                                </button>
                                <button
                                  className="button"
                                  onClick={clearAnalysisCategorySelection}
                                  type="button"
                                >
                                  선택 해제
                                </button>
                                <button
                                  className="button"
                                  disabled={selectedAnalysisCategories.length === 0}
                                  onClick={handleAnalyzeSelected}
                                  type="button"
                                >
                                  선택 수집
                                </button>
                                <button
                                  className="button button--primary"
                                  onClick={handleAnalyzeAll}
                                  type="button"
                                >
                                  전체 실행
                                </button>
                              </div>
                            </div>
                            <div className="analysis-category-list">
                              {analysisCategoryStatuses.map((categoryStatus) => {
                                const metadata =
                                  TRIP_ANALYSIS_CATEGORY_METADATA[categoryStatus.category];
                                const isSelected = selectedAnalysisCategories.includes(
                                  categoryStatus.category,
                                );
                                const isCategoryPending = isPendingAnalysisStatus(
                                  categoryStatus.status,
                                );

                                return (
                                  <article
                                    className="analysis-category-card"
                                    key={categoryStatus.category}
                                  >
                                    <div className="analysis-category-card__header">
                                      <label className="analysis-category-card__toggle">
                                        <input
                                          checked={isSelected}
                                          onChange={() =>
                                            toggleAnalysisCategorySelection(categoryStatus.category)
                                          }
                                          type="checkbox"
                                        />
                                        <span>
                                          <strong>{metadata.label}</strong>
                                          <span>{metadata.summary}</span>
                                        </span>
                                      </label>
                                      <div className="analysis-category-card__meta">
                                        <span
                                          className={`analysis-status-chip analysis-status-chip--${categoryStatus.status}`}
                                        >
                                          {getTripAnalysisStatusLabel(categoryStatus.status)}
                                        </span>
                                        <button
                                          className="button"
                                          disabled={isCategoryPending}
                                          onClick={() =>
                                            handleRefreshAnalysisCategory(categoryStatus.category)
                                          }
                                          type="button"
                                        >
                                          {categoryStatus.has_result ? "재수집" : "이 섹션 수집"}
                                        </button>
                                      </div>
                                    </div>
                                    <div className="analysis-category-card__body">
                                      <p>
                                        섹션:{" "}
                                        {metadata.sections
                                          .map((section) => `${section.order}. ${section.title}`)
                                          .join(", ")}
                                      </p>
                                      <p>
                                        마지막 수집:{" "}
                                        {categoryStatus.collected_at
                                          ? formatRelativeDate(categoryStatus.collected_at)
                                          : "아직 없음"}
                                      </p>
                                      {categoryStatus.error ? (
                                        <p className="analysis-category-card__error">
                                          {categoryStatus.error.message}
                                        </p>
                                      ) : null}
                                    </div>
                                  </article>
                                );
                              })}
                            </div>

                            {analysisOutput?.markdown ? (
                              <article className="markdown-pane">
                                <ReactMarkdown>{analysisOutput.markdown}</ReactMarkdown>
                              </article>
                            ) : (
                              <div className="empty-state">
                                계획 저장 후 섹션을 선택해 수집하면, 누적된 최종 Markdown
                                플랜이 여기에 표시됩니다.
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="empty-state">
                            분석은 저장된 계획에서만 실행할 수 있습니다.
                          </div>
                        )
                      ) : null}
                    </section>
                  </div>
                </section>
                ) : null}
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "history" ? (
            <section className="page-stack">
              <section className="page-intro panel page-intro--archive">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">기록 보관</div>
                  <h2>캠핑 기록 보관</h2>
                  <p className="panel__copy">
                    완료된 계획을 아카이브 문서처럼 관리하고, 결과 Markdown과 실제 메모를
                    다시 열어 다음 준비에 참고할 수 있게 유지합니다.
                  </p>
                </div>
                <div className="page-intro__meta">
                  <div className="meta-chip">
                    <span>보관된 기록</span>
                    <strong>{history.length}건</strong>
                  </div>
                  <div className="meta-chip">
                    <span>선택 기록</span>
                    <strong>{selectedHistory?.title ?? "없음"}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>결과 문서</span>
                    <strong>{selectedHistory?.output_path ? "연결됨" : "없음"}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>차량 기록</span>
                    <strong>{selectedHistoryVehicle?.name ?? "없음"}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>회고 엔트리</span>
                    <strong>{selectedHistory?.retrospectives.length ?? 0}건</strong>
                  </div>
                  <div className="meta-chip">
                    <span>학습 상태</span>
                    <strong>{currentUserLearningStatusLabel}</strong>
                  </div>
                </div>
              </section>

              <div aria-label="캠핑 히스토리 보기" className="detail-tabs" role="tablist">
                {HISTORY_PAGE_TABS.map((tab) => {
                  const isActive = historyPageTab === tab;

                  return (
                    <button
                      key={tab}
                      aria-controls={isActive ? getDetailPanelId("history-page", tab) : undefined}
                      aria-selected={isActive}
                      className={detailTabClass(isActive)}
                      id={getDetailTabId("history-page", tab)}
                      onClick={() => setHistoryPageTab(tab)}
                      onKeyDown={(event) =>
                        handleDetailTabKeyDown(
                          event,
                          HISTORY_PAGE_TABS,
                          tab,
                          setHistoryPageTab,
                          "history-page",
                        )
                      }
                      role="tab"
                      tabIndex={isActive ? 0 : -1}
                      type="button"
                    >
                      {HISTORY_PAGE_TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>

              <section
                aria-labelledby={activeHistoryPageTabId}
                className="detail-tab-panel"
                id={activeHistoryPagePanelId}
                role="tabpanel"
              >
                {historyPageTab === "list" ? (
                <section className="panel">
                <div className="panel__eyebrow">기록 목록</div>
                <div className="panel__header">
                  <h2>캠핑 히스토리 목록</h2>
                </div>
                {history.length === 0 ? (
                  <div className="empty-state">아직 아카이브된 히스토리가 없습니다.</div>
                ) : (
                  <div className="stack-list">
                    {history.map((item) => (
                      <button
                        key={item.history_id}
                        className={`list-card${
                          selectedHistoryId === item.history_id ? " list-card--active" : ""
                        }`}
                        onClick={() => {
                          setSelectedHistoryId(item.history_id);
                          setHistoryPageTab("details");
                        }}
                        type="button"
                      >
                        <strong>{item.title}</strong>
                        <span>
                          {item.date?.start ?? "날짜 미입력"} /{" "}
                          {item.location?.region ?? "지역 미입력"} /{" "}
                          {item.attendee_count ?? item.companion_ids.length}명 /{" "}
                          {resolveHistoryVehicleSnapshot(item, vehicles)?.name ?? "차량 미기록"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                </section>
                ) : null}

                {historyPageTab === "details" ? (
                <section className="panel">
                <div className="panel__eyebrow">기록 상세</div>
                <div className="panel__header">
                  <h2>히스토리 상세</h2>
                </div>
                {selectedHistory ? (
                  <div className="detail-shell">
                    <div className="summary-grid summary-grid--compact detail-summary-grid">
                      {selectedHistoryCompanionSnapshots.length > 0 ? (
                        selectedHistoryCompanionSnapshots.map((companion) => (
                          <article className="summary-card" key={companion.id}>
                            <span>{companion.id}</span>
                            <strong>{companion.name}</strong>
                            <p className="panel__copy">
                              {AGE_GROUP_LABELS[companion.age_group]}
                              {companion.required_medications[0]
                                ? ` / 복용약 ${companion.required_medications[0]}`
                                : ""}
                            </p>
                          </article>
                        ))
                      ) : (
                        <article className="summary-card">
                          <span>동행자</span>
                          <strong>기록 없음</strong>
                        </article>
                      )}
                      <article className="summary-card">
                        <span>차량</span>
                        <strong>{selectedHistoryVehicle?.name ?? "기록 없음"}</strong>
                        <p className="panel__copy">
                          {selectedHistoryVehicle
                            ? `탑승 ${selectedHistoryVehicle.passenger_capacity ?? "미입력"}명 / 적재 ${
                                selectedHistoryVehicle.load_capacity_kg ?? "미입력"
                              }kg`
                            : "당시 사용 차량 정보가 기록되지 않았습니다."}
                        </p>
                      </article>
                      <article className="summary-card">
                        <span>회고 누적</span>
                        <strong>{selectedHistory.retrospectives.length}건</strong>
                        <p className="panel__copy">
                          사용 후기와 실제 행동을 누적 저장해 다음 계획에 자동 반영합니다.
                        </p>
                      </article>
                      <article className="summary-card">
                        <span>개인화 학습</span>
                        <strong>{currentUserLearningStatusLabel}</strong>
                        <p className="panel__copy">
                          {userLearningProfile
                            ? `전역 프로필 ${userLearningProfile.source_history_ids.length}건 / 회고 ${userLearningProfile.source_entry_count}건 반영`
                            : "아직 전역 개인화 프로필이 없습니다."}
                        </p>
                      </article>
                    </div>

                    {isUserLearningPending ? (
                      <StatusBanner
                        tone="info"
                        title="학습 업데이트 중"
                        description="회고를 바탕으로 이번 캠핑 학습과 전역 개인화 프로필을 다시 합성하고 있습니다."
                      />
                    ) : null}
                    {userLearningStatus.status === "failed" ? (
                      <StatusBanner
                        tone="error"
                        title="개인화 학습 실패"
                        description={
                          userLearningStatus.error?.message ??
                          "회고 기반 학습 결과를 다시 만들지 못했습니다."
                        }
                      />
                    ) : null}

                    <div aria-label="히스토리 상세 보기" className="detail-tabs" role="tablist">
                      {HISTORY_DETAIL_TABS.map((tab) => {
                        const isActive = historyDetailTab === tab;

                        return (
                          <button
                            key={tab}
                            aria-controls={
                              isActive ? getDetailPanelId("history-detail", tab) : undefined
                            }
                            aria-selected={isActive}
                            className={detailTabClass(isActive)}
                            id={getDetailTabId("history-detail", tab)}
                            onClick={() => setHistoryDetailTab(tab)}
                            onKeyDown={(event) =>
                              handleDetailTabKeyDown(
                                event,
                                HISTORY_DETAIL_TABS,
                                tab,
                                setHistoryDetailTab,
                                "history-detail",
                              )
                            }
                            role="tab"
                            tabIndex={isActive ? 0 : -1}
                            type="button"
                          >
                            {HISTORY_DETAIL_TAB_LABELS[tab]}
                          </button>
                        );
                      })}
                    </div>

                    <section
                      aria-labelledby={activeHistoryDetailTabId}
                      className="detail-tab-panel"
                      id={activeHistoryDetailPanelId}
                      role="tabpanel"
                    >
                      {historyDetailTab === "overview" ? (
                        <>
                          <div className="section-label">
                            <strong>히스토리 요약</strong>
                            <p>기본 정보와 현재 학습 요약을 확인하고 필요한 메모를 빠르게 읽습니다.</p>
                          </div>
                          <div className="form-grid">
                            <FormField label="히스토리 제목">
                              <input
                                placeholder="히스토리 제목"
                                value={selectedHistory.title}
                                onChange={(event) =>
                                  setHistory((current) =>
                                    current.map((item) =>
                                      item.history_id === selectedHistory.history_id
                                        ? { ...item, title: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </FormField>
                            <FormField label="참석 인원">
                              <input
                                type="number"
                                min="0"
                                placeholder="예: 4"
                                value={
                                  selectedHistory.attendee_count ??
                                  selectedHistory.companion_ids.length
                                }
                                onChange={(event) =>
                                  setHistory((current) =>
                                    current.map((item) =>
                                      item.history_id === selectedHistory.history_id
                                        ? {
                                            ...item,
                                            attendee_count: parseInteger(event.target.value) ?? 0,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </FormField>
                            <FormField label="보관 시각">
                              <input value={selectedHistory.archived_at} readOnly />
                            </FormField>
                          </div>
                          <div className="summary-grid summary-grid--compact">
                            <article className="summary-card">
                              <span>이번 캠핑에서 AI가 배운 점</span>
                              <strong>{historyLearningInsight ? "최신 반영됨" : "아직 없음"}</strong>
                              <p className="panel__copy">
                                {historyLearningInsight
                                  ? historyLearningInsight.summary
                                  : "회고를 남기면 실제 현장 사용 패턴과 다음 준비 힌트를 요약합니다."}
                              </p>
                            </article>
                            <article className="summary-card">
                              <span>전역 개인화 학습 요약</span>
                              <strong>{userLearningProfile ? "누적 반영됨" : "아직 없음"}</strong>
                              <p className="panel__copy">
                                {userLearningProfile
                                  ? userLearningProfile.summary
                                  : "여러 히스토리 회고가 쌓일수록 다음 계획 분석에 자동 반영됩니다."}
                              </p>
                            </article>
                          </div>
                          <div className="button-row">
                            <button className="button" onClick={handleSaveHistory} type="button">
                              히스토리 저장
                            </button>
                          </div>
                        </>
                      ) : null}

                      {historyDetailTab === "retrospective" ? (
                        <>
                          <div className="summary-grid summary-grid--compact">
                            <article className="summary-card">
                              <span>후기 / 회고 추가</span>
                              <strong>실제 사용 기록</strong>
                              <p className="panel__copy">
                                현장에서 어떻게 사용했고 무엇이 부족했는지 남기면 다음 계획 힌트가 계속 보정됩니다.
                              </p>
                            </article>
                          </div>
                          <div className="form-grid">
                            <FormField label="만족도">
                              <select
                                aria-label="만족도"
                                value={retrospectiveDraft.overallSatisfaction}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    overallSatisfaction: event.target.value,
                                  }))
                                }
                              >
                                <option value="">선택 안 함</option>
                                <option value="5">5점 매우 만족</option>
                                <option value="4">4점 만족</option>
                                <option value="3">3점 보통</option>
                                <option value="2">2점 아쉬움</option>
                                <option value="1">1점 매우 아쉬움</option>
                              </select>
                            </FormField>
                            <FormField label="사용한 반복 장비">
                              {equipment?.durable.items.length ? (
                                <div className="choice-list">
                                  {equipment.durable.items.map((item) => {
                                    const checked = retrospectiveDraft.usedDurableItemIds.includes(
                                      item.id,
                                    );

                                    return (
                                      <label
                                        className={`choice-card${
                                          checked ? " choice-card--active" : ""
                                        }`}
                                        key={item.id}
                                      >
                                        <input
                                          checked={checked}
                                          onChange={() =>
                                            setRetrospectiveDraft((current) => ({
                                              ...current,
                                              usedDurableItemIds: toggleSelectionId(
                                                current.usedDurableItemIds,
                                                item.id,
                                              ),
                                            }))
                                          }
                                          type="checkbox"
                                        />
                                        <div className="choice-card__body">
                                          <strong>{item.name}</strong>
                                          <span>{item.id}</span>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="empty-state empty-state--compact">
                                  현재 등록된 반복 장비가 없습니다.
                                </div>
                              )}
                            </FormField>
                            <FormField full label="잘 안 쓴 것 / 과했던 것">
                              <textarea
                                className="form-grid__full"
                                placeholder="줄 단위로 적어 주세요. 예: 대형 랜턴 2개는 과했다"
                                value={retrospectiveDraft.unusedItems}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    unusedItems: event.target.value,
                                  }))
                                }
                              />
                            </FormField>
                            <FormField full label="부족했거나 다음에 더 필요한 것">
                              <textarea
                                className="form-grid__full"
                                placeholder="줄 단위로 적어 주세요. 예: 아이 여벌 옷, 바람막이 타프"
                                value={retrospectiveDraft.missingOrNeededItems}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    missingOrNeededItems: event.target.value,
                                  }))
                                }
                              />
                            </FormField>
                            <FormField full label="식단 / 요리 회고">
                              <textarea
                                className="form-grid__full"
                                placeholder="줄 단위로 적어 주세요."
                                value={retrospectiveDraft.mealFeedback}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    mealFeedback: event.target.value,
                                  }))
                                }
                              />
                            </FormField>
                            <FormField full label="이동 / 동선 회고">
                              <textarea
                                className="form-grid__full"
                                placeholder="줄 단위로 적어 주세요."
                                value={retrospectiveDraft.routeFeedback}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    routeFeedback: event.target.value,
                                  }))
                                }
                              />
                            </FormField>
                            <FormField full label="사이트 / 현장 회고">
                              <textarea
                                className="form-grid__full"
                                placeholder="줄 단위로 적어 주세요."
                                value={retrospectiveDraft.siteFeedback}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    siteFeedback: event.target.value,
                                  }))
                                }
                              />
                            </FormField>
                            <FormField full label="문제 / 이슈">
                              <textarea
                                className="form-grid__full"
                                placeholder="줄 단위로 적어 주세요."
                                value={retrospectiveDraft.issues}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    issues: event.target.value,
                                  }))
                                }
                              />
                            </FormField>
                            <FormField full label="다음엔 이렇게 하고 싶음">
                              <textarea
                                className="form-grid__full"
                                placeholder="줄 단위로 적어 주세요."
                                value={retrospectiveDraft.nextTimeRequests}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    nextTimeRequests: event.target.value,
                                  }))
                                }
                              />
                            </FormField>
                            <FormField full label="자유 후기">
                              <textarea
                                className="form-grid__full"
                                placeholder="현장에서 어떻게 캠핑했는지 자유롭게 남겨 주세요."
                                value={retrospectiveDraft.freeformNote}
                                onChange={(event) =>
                                  setRetrospectiveDraft((current) => ({
                                    ...current,
                                    freeformNote: event.target.value,
                                  }))
                                }
                              />
                            </FormField>
                            <div className="form-grid__full button-row">
                              <button
                                className="button button--primary"
                                disabled={savingRetrospective}
                                onClick={handleAddRetrospective}
                                type="button"
                              >
                                {savingRetrospective
                                  ? "후기 저장 중..."
                                  : "후기 저장 후 학습 업데이트"}
                              </button>
                            </div>
                          </div>
                        </>
                      ) : null}

                      {historyDetailTab === "learning" ? (
                        <div className="detail-section-stack">
                          <section className="detail-section-card">
                            <div className="panel__eyebrow">회고 학습 결과</div>
                            {historyLearningLoading ? (
                              <div className="empty-state empty-state--compact">
                                학습 결과를 불러오는 중입니다.
                              </div>
                            ) : historyLearningError ? (
                              <StatusBanner
                                tone="warning"
                                title="이번 캠핑 학습 결과를 다시 읽지 못했습니다."
                                description={historyLearningError}
                              />
                            ) : historyLearningInsight ? (
                              <div className="stack-list">
                                <div className="action-card">
                                  <strong>요약</strong>
                                  <p>{historyLearningInsight.summary}</p>
                                </div>
                                {historyLearningInsight.behavior_patterns[0] ? (
                                  <div className="action-card">
                                    <strong>행동 패턴</strong>
                                    <p>{historyLearningInsight.behavior_patterns.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {historyLearningInsight.equipment_hints[0] ? (
                                  <div className="action-card">
                                    <strong>장비 힌트</strong>
                                    <p>{historyLearningInsight.equipment_hints.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {historyLearningInsight.meal_hints[0] ? (
                                  <div className="action-card">
                                    <strong>식단 힌트</strong>
                                    <p>{historyLearningInsight.meal_hints.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {historyLearningInsight.route_hints[0] ? (
                                  <div className="action-card">
                                    <strong>이동 힌트</strong>
                                    <p>{historyLearningInsight.route_hints.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {historyLearningInsight.campsite_hints[0] ? (
                                  <div className="action-card">
                                    <strong>현장 힌트</strong>
                                    <p>{historyLearningInsight.campsite_hints.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {historyLearningInsight.next_trip_focus[0] ? (
                                  <div className="action-card">
                                    <strong>다음 계획 포커스</strong>
                                    <p>{historyLearningInsight.next_trip_focus.join(" / ")}</p>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="empty-state empty-state--compact">
                                아직 이번 캠핑 학습 결과가 없습니다.
                              </div>
                            )}
                          </section>

                          <section className="detail-section-card">
                            <div className="panel__eyebrow">전역 개인화 학습 요약</div>
                            {userLearningProfile ? (
                              <div className="stack-list">
                                <div className="action-card">
                                  <strong>요약</strong>
                                  <p>{userLearningProfile.summary}</p>
                                </div>
                                {userLearningProfile.behavior_patterns[0] ? (
                                  <div className="action-card">
                                    <strong>행동 패턴</strong>
                                    <p>{userLearningProfile.behavior_patterns.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {userLearningProfile.equipment_hints[0] ? (
                                  <div className="action-card">
                                    <strong>장비 힌트</strong>
                                    <p>{userLearningProfile.equipment_hints.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {userLearningProfile.meal_hints[0] ? (
                                  <div className="action-card">
                                    <strong>식단 힌트</strong>
                                    <p>{userLearningProfile.meal_hints.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {userLearningProfile.route_hints[0] ? (
                                  <div className="action-card">
                                    <strong>이동 힌트</strong>
                                    <p>{userLearningProfile.route_hints.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {userLearningProfile.campsite_hints[0] ? (
                                  <div className="action-card">
                                    <strong>현장 힌트</strong>
                                    <p>{userLearningProfile.campsite_hints.join(" / ")}</p>
                                  </div>
                                ) : null}
                                {userLearningProfile.next_trip_focus[0] ? (
                                  <div className="action-card">
                                    <strong>다음 계획 포커스</strong>
                                    <p>{userLearningProfile.next_trip_focus.join(" / ")}</p>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="empty-state empty-state--compact">
                                아직 전역 개인화 학습 프로필이 없습니다.
                              </div>
                            )}
                          </section>
                        </div>
                      ) : null}

                      {historyDetailTab === "records" ? (
                        <div className="detail-section-stack">
                          <section className="detail-section-card">
                            <div className="panel__eyebrow">회고 엔트리 목록</div>
                            {selectedHistoryRetrospectives.length > 0 ? (
                              <div className="stack-list">
                                {selectedHistoryRetrospectives.map((entry) => (
                                  <article className="action-card" key={entry.entry_id}>
                                    <strong>
                                      {formatRelativeDate(entry.created_at)}
                                      {typeof entry.overall_satisfaction === "number"
                                        ? ` / 만족도 ${entry.overall_satisfaction}점`
                                        : ""}
                                    </strong>
                                    <p>
                                      사용 장비:{" "}
                                      {entry.used_durable_item_ids.length > 0
                                        ? entry.used_durable_item_ids.join(", ")
                                        : "기록 없음"}
                                    </p>
                                    {entry.missing_or_needed_items[0] ? (
                                      <p>부족/필요: {entry.missing_or_needed_items.join(" / ")}</p>
                                    ) : null}
                                    {entry.issues[0] ? (
                                      <p>이슈: {entry.issues.join(" / ")}</p>
                                    ) : null}
                                    {entry.next_time_requests[0] ? (
                                      <p>다음 요청: {entry.next_time_requests.join(" / ")}</p>
                                    ) : null}
                                    {entry.freeform_note ? <p>{entry.freeform_note}</p> : null}
                                  </article>
                                ))}
                              </div>
                            ) : (
                              <div className="empty-state empty-state--compact">
                                아직 남겨진 회고 엔트리가 없습니다.
                              </div>
                            )}
                          </section>

                          <section className="detail-section-card history-output-card">
                            <div className="history-output-card__header">
                              <div>
                                <strong>저장된 분석 결과</strong>
                                <p>
                                  {selectedHistory.output_path
                                    ? "아카이브 당시 저장된 Markdown 결과를 다시 열 수 있습니다."
                                    : "이 히스토리에는 저장된 분석 결과 경로가 없습니다."}
                                </p>
                              </div>
                              <div className="history-output-card__actions">
                                <button
                                  className="button"
                                  disabled={!selectedHistory.output_path || historyOutputLoading}
                                  onClick={handleOpenHistoryOutput}
                                  type="button"
                                >
                                  {historyOutputLoading ? "불러오는 중..." : "결과 열기"}
                                </button>
                                {historyOutput?.markdown ? (
                                  <button
                                    className="button"
                                    onClick={handleOpenHistoryOutputLayer}
                                    type="button"
                                  >
                                    넓게 보기
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {selectedHistory.output_path ? (
                              <code className="output-path">{selectedHistory.output_path}</code>
                            ) : (
                              <div className="empty-state empty-state--compact">
                                저장된 결과 문서가 없으면 여기서 다시 열 수 없습니다.
                              </div>
                            )}
                            {historyOutputError ? (
                              <StatusBanner
                                tone="error"
                                title="결과 문서를 불러오지 못했습니다."
                                description={historyOutputError}
                              />
                            ) : null}
                            {historyOutput ? (
                              <article className="markdown-pane markdown-pane--compact">
                                <ReactMarkdown>{historyOutput.markdown}</ReactMarkdown>
                              </article>
                            ) : null}
                          </section>

                          <section className="detail-section-card">
                            <div className="form-grid">
                              <FormField full label="메모">
                                <textarea
                                  className="form-grid__full"
                                  placeholder="누구와 어떤 차량으로 갔는지, 실제로 좋았던 점과 불편했던 점, 다음에 보완할 준비물을 줄 단위로 적어두세요."
                                  value={joinLineList(selectedHistory.notes)}
                                  onChange={(event) =>
                                    setHistory((current) =>
                                      current.map((item) =>
                                        item.history_id === selectedHistory.history_id
                                          ? {
                                              ...item,
                                              notes: splitLineList(event.target.value),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </FormField>
                            </div>
                            <div className="button-row">
                              <button className="button" onClick={handleSaveHistory} type="button">
                                히스토리 저장
                              </button>
                              <button
                                className="button"
                                onClick={() => handleDeleteHistory(selectedHistory.history_id)}
                                type="button"
                              >
                                히스토리 삭제
                              </button>
                            </div>
                          </section>
                        </div>
                      ) : null}
                    </section>
                  </div>
                ) : (
                  <div className="empty-state">왼쪽에서 히스토리를 선택하세요.</div>
                )}
                </section>
                ) : null}
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "links" ? (
            <section className="page-stack">
              <section className="page-intro panel">
                <div className="page-intro__copy">
                  <div className="panel__eyebrow">참고 링크</div>
                  <h2>참고 링크 관리</h2>
                  <p className="panel__copy">
                    날씨, 장소, 맛집, 장보기 링크를 북마크처럼 빠르게 읽고 수정할 수 있게
                    카테고리 단위로 묶었습니다.
                  </p>
                </div>
                <div className="page-intro__meta page-intro__meta--three">
                  <div className="meta-chip">
                    <span>전체 링크</span>
                    <strong>{links.length}개</strong>
                  </div>
                  <div className="meta-chip">
                    <span>카테고리 그룹</span>
                    <strong>{linkGroups.length}개</strong>
                  </div>
                  <div className="meta-chip">
                    <span>최근 작업</span>
                    <strong>{links[0]?.name ?? "없음"}</strong>
                  </div>
                </div>
              </section>

              <section className="page-stack">
                <div aria-label="외부 링크 보기" className="detail-tabs" role="tablist">
                  {LINK_PAGE_TABS.map((tab) => {
                    const isActive = linkPageTab === tab;

                    return (
                      <button
                        key={tab}
                        aria-controls={isActive ? getDetailPanelId("link-page", tab) : undefined}
                        aria-selected={isActive}
                        className={detailTabClass(isActive)}
                        id={getDetailTabId("link-page", tab)}
                        onClick={() => setLinkPageTab(tab)}
                        onKeyDown={(event) =>
                          handleDetailTabKeyDown(
                            event,
                            LINK_PAGE_TABS,
                            tab,
                            setLinkPageTab,
                            "link-page",
                          )
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        {LINK_PAGE_TAB_LABELS[tab]}
                      </button>
                    );
                  })}
                </div>

                <section
                  aria-labelledby={activeLinkPageTabId}
                  className="detail-tab-panel"
                  id={activeLinkPagePanelId}
                  role="tabpanel"
                >
                  {linkPageTab === "list" ? (
                    <section className="panel">
                <div className="panel__eyebrow">링크 목록</div>
                <div className="panel__header">
                  <h2>외부 링크 목록</h2>
                </div>
                {links.length === 0 ? (
                  <div className="empty-state">등록된 외부 링크가 없습니다.</div>
                ) : (
                  <div className="stack-list">
                    {linkGroups.map((group) => (
                      <section className="link-group" key={group.category}>
                        <div className="link-group__header">
                          <h3>{group.label}</h3>
                          <span>{group.items.length}개</span>
                        </div>
                        <div className="stack-list">
                          {group.items.map((link) => (
                            <div className="link-card" key={link.id}>
                              <FormField label="링크 이름">
                                <input
                                  placeholder="링크 이름"
                                  value={link.name}
                                  onChange={(event) =>
                                    setLinks((current) =>
                                      current.map((item) =>
                                        item.id === link.id
                                          ? { ...item, name: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </FormField>
                              <FormField label="URL">
                                <input
                                  placeholder="https://..."
                                  value={link.url}
                                  onChange={(event) =>
                                    setLinks((current) =>
                                      current.map((item) =>
                                        item.id === link.id
                                          ? { ...item, url: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </FormField>
                              <FormField label="카테고리">
                                <select
                                  value={link.category}
                                  onChange={(event) =>
                                    setLinks((current) =>
                                      current.map((item) =>
                                        item.id === link.id
                                          ? {
                                              ...item,
                                              category:
                                                event.target.value as ExternalLinkCategory,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  {Object.entries(EXTERNAL_LINK_CATEGORY_LABELS).map(
                                    ([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </FormField>
                              <FormField full label="메모">
                                <textarea
                                  className="form-grid__full"
                                  placeholder="링크 메모"
                                  value={link.notes ?? ""}
                                  onChange={(event) =>
                                    setLinks((current) =>
                                      current.map((item) =>
                                        item.id === link.id
                                          ? { ...item, notes: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </FormField>
                              <div className="button-row">
                                <a
                                  className="button"
                                  href={link.url}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  링크 열기
                                </a>
                                <button
                                  className="button"
                                  onClick={() => handleSaveLink(link)}
                                  type="button"
                                >
                                  저장
                                </button>
                                <button
                                  className="button"
                                  onClick={() => handleDeleteLink(link.id)}
                                  type="button"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
                    </section>
                  ) : null}

                  {linkPageTab === "editor" ? (
                    <section className="panel">
                <div className="panel__eyebrow">새 링크</div>
                <div className="panel__header">
                  <h2>새 외부 링크</h2>
                </div>
                <div className="form-grid">
                  <FormField label="링크 이름">
                    <input
                      placeholder="예: 주말 날씨"
                      value={linkDraft.name}
                      onChange={(event) =>
                        setLinkDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="URL">
                    <input
                      placeholder="https://..."
                      value={linkDraft.url}
                      onChange={(event) =>
                        setLinkDraft((current) => ({
                          ...current,
                          url: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="카테고리">
                    <select
                      value={linkDraft.category}
                      onChange={(event) =>
                        setLinkDraft((current) => ({
                          ...current,
                          category: event.target.value as ExternalLinkCategory,
                        }))
                      }
                    >
                      {Object.entries(EXTERNAL_LINK_CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField full label="메모">
                    <textarea
                      className="form-grid__full"
                      placeholder="링크 메모"
                      value={linkDraft.notes ?? ""}
                      onChange={(event) =>
                        setLinkDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                  <button
                    className="button button--primary form-grid__full"
                    onClick={handleCreateLink}
                    type="button"
                  >
                    링크 추가
                  </button>
                </div>
                    </section>
                  ) : null}
                </section>
              </section>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function MarkdownLayer(props: {
  eyebrow: string;
  title: string;
  description: string;
  outputPath: string | null;
  markdown: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !panelRef.current) {
      return;
    }

    const focusableElements = getFocusableElements(panelRef.current);

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const currentElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (currentElement === firstElement || !panelRef.current.contains(currentElement)) {
        event.preventDefault();
        lastElement.focus();
      }

      return;
    }

    if (currentElement === lastElement || !panelRef.current.contains(currentElement)) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div
      aria-labelledby="markdown-layer-title"
      aria-modal="true"
      className="markdown-layer"
      onClick={props.onClose}
      role="dialog"
    >
      <div className="markdown-layer__backdrop" />
      <section
        className="markdown-layer__panel"
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
      >
        <div className="markdown-layer__header">
          <div className="markdown-layer__copy">
            <div className="panel__eyebrow">{props.eyebrow}</div>
            <h2 id="markdown-layer-title">{props.title}</h2>
            <p>{props.description}</p>
          </div>
          <button
            aria-label="결과 레이어 닫기"
            className="button"
            onClick={props.onClose}
            ref={closeButtonRef}
            type="button"
          >
            닫기
          </button>
        </div>
        {props.outputPath ? <code className="output-path">{props.outputPath}</code> : null}
        <article className="markdown-pane markdown-pane--layer">
          <ReactMarkdown>{props.markdown}</ReactMarkdown>
        </article>
      </section>
    </div>
  );
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("aria-hidden"));
}

function navButtonClass(active: boolean) {
  return `nav-button${active ? " nav-button--active" : ""}`;
}

function InfoTooltip(props: { text: string }) {
  return (
    <span aria-hidden="true" className="info-tooltip" title={props.text}>
      <span className="info-tooltip__icon">i</span>
    </span>
  );
}

function detailTabClass(active: boolean) {
  return `segment-button${active ? " segment-button--active" : ""}`;
}

function equipmentTabClass(active: boolean) {
  return `equipment-tab${active ? " equipment-tab--active" : ""}`;
}

function getDetailTabId(prefix: string, tab: string) {
  return `${prefix}-tab-${tab}`;
}

function getDetailPanelId(prefix: string, tab: string) {
  return `${prefix}-panel-${tab}`;
}

function getEquipmentSectionTabId(section: EquipmentSection) {
  return `equipment-tab-${section}`;
}

function getEquipmentSectionPanelId(section: EquipmentSection) {
  return `equipment-panel-${section}`;
}

function getAdjacentEquipmentSection(
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

function handleDetailTabKeyDown<T extends string>(
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

function toggleExpandedEquipmentSections(
  sections: EquipmentSection[],
  nextSection: EquipmentSection,
) {
  const nextSections = sections.includes(nextSection)
    ? sections.filter((section) => section !== nextSection)
    : [...sections, nextSection];

  return EQUIPMENT_SECTIONS.filter((section) => nextSections.includes(section));
}

function createEmptyTripDraft(): TripDraft {
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

function createEmptyCompanion(companionId = ""): Companion {
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

function createPlaceholderCompanion(companionId: string): Companion {
  return createEmptyCompanion(companionId);
}

function createEmptyDurableItem(): DurableEquipmentItemInput {
  return {
    name: "",
    category: "shelter",
    quantity: 1,
    status: "ok",
  };
}

function createEmptyConsumableItem(): ConsumableEquipmentItemInput {
  return {
    name: "",
    category: "fuel",
    quantity_on_hand: 0,
    unit: "pack",
    low_stock_threshold: undefined,
  };
}

function createEmptyPrecheckItem(): PrecheckItemInput {
  return {
    name: "",
    category: "battery",
    status: "needs_check",
  };
}

function createEmptyLink(): ExternalLinkInput {
  return {
    name: "",
    category: "weather",
    url: "https://",
    notes: "",
    sort_order: 0,
  };
}

function createEmptyVehicle(): VehicleInput {
  return {
    id: "",
    name: "",
    description: "",
    notes: [],
  };
}

function createEmptyEquipmentCategoryDraft(): EquipmentCategoryCreateInput {
  return {
    id: "",
    label: "",
  };
}

function createEmptyCategoryDrafts(): CategoryDrafts {
  return {
    durable: createEmptyEquipmentCategoryDraft(),
    consumables: createEmptyEquipmentCategoryDraft(),
    precheck: createEmptyEquipmentCategoryDraft(),
  };
}

function createEmptyCategoryLabelDrafts(): CategoryLabelDrafts {
  return {
    durable: {},
    consumables: {},
    precheck: {},
  };
}

function createEmptyEquipmentCategorySelectionDrafts(): EquipmentCategorySelectionDrafts {
  return {
    durable: {},
    consumables: {},
    precheck: {},
  };
}

function createEmptySectionTrackedIds(): SectionTrackedIds {
  return {
    durable: [],
    consumables: [],
    precheck: [],
  };
}

function createCommaSeparatedInputs(draft?: TripDraft | null): CommaSeparatedInputs {
  return {
    requestedDishes: joinCommaList(draft?.meal_plan?.requested_dishes),
    requestedStops: joinCommaList(draft?.travel_plan?.requested_stops),
  };
}

function createEmptyRetrospectiveDraft(): RetrospectiveDraft {
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

function buildRetrospectiveInput(
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

function createIdleUserLearningStatus(): UserLearningJobStatusResponse {
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

function FormField(props: { children: ReactNode; full?: boolean; label: string }) {
  const child =
    isValidElement(props.children) &&
    typeof props.children.type === "string" &&
    ["input", "select", "textarea"].includes(props.children.type)
      ? cloneElement(
          props.children as ReactElement<Record<string, unknown>>,
          {
            "aria-label":
              (props.children.props as Record<string, unknown>)["aria-label"] ?? props.label,
          },
        )
      : props.children;

  return (
    <div className={props.full ? "field form-grid__full" : "field"}>
      <span className="field__label">{props.label}</span>
      {child}
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function EquipmentCategorySelect(props: {
  categories: EquipmentCategory[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = buildEquipmentCategoryOptions(props.categories, props.value);

  return (
    <select
      aria-label="카테고리"
      value={resolveCategorySelection(props.value, options)}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {options.map((category) => (
        <option key={category.id} value={category.id}>
          {category.label}
        </option>
      ))}
    </select>
  );
}

type GroupedEquipmentListProps<T extends { id: string; name: string; category: string }> = {
  section: EquipmentSection;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: T[];
  emptyMessage: string;
  onToggleCategory: (categoryId: string) => void;
  onToggleItem: (itemId: string) => void;
  renderSummaryMeta: (item: T) => {
    metadata?: string;
    quantity?: string;
    status: string;
  };
  renderEditor: (item: T) => ReactNode;
};

function GroupedEquipmentList<T extends { id: string; name: string; category: string }>(
  props: GroupedEquipmentListProps<T>,
) {
  const groups = buildEquipmentCategoryGroups(props.items, props.categories);

  if (groups.length === 0) {
    return <div className="empty-state empty-state--compact">{props.emptyMessage}</div>;
  }

  return (
    <div className="equipment-category-list">
      {groups.map((group) => {
        const categoryPanelId = `equipment-category-panel-${props.section}-${group.categoryId}`;
        const isCollapsed = props.collapsedCategoryIds.includes(group.categoryId);

        return (
          <section className="equipment-category-card" key={group.categoryId}>
            <button
              aria-controls={categoryPanelId}
              aria-expanded={!isCollapsed}
              aria-label={`${group.categoryLabel} 카테고리 ${isCollapsed ? "펼치기" : "접기"}`}
              className="equipment-category-toggle"
              onClick={() => props.onToggleCategory(group.categoryId)}
              type="button"
            >
              <span className="equipment-category-toggle__content">
                <span className="equipment-category-toggle__eyebrow">카테고리</span>
                <strong>{group.categoryLabel}</strong>
                <span className="equipment-category-toggle__meta">
                  {group.items.length}개 항목
                </span>
              </span>
              <span className="equipment-category-toggle__state">
                {isCollapsed ? "펼치기" : "접기"}
              </span>
            </button>

            {!isCollapsed ? (
              <div className="equipment-category-body" id={categoryPanelId}>
                <div className="equipment-category-body__header">
                  <span>카테고리 안 항목</span>
                  <strong>{group.items.length}개</strong>
                </div>
                <div className="equipment-item-list">
                {group.items.map((item) => {
                  const summary = props.renderSummaryMeta(item);
                  const itemPanelId = `equipment-item-panel-${props.section}-${item.id}`;
                  const isExpanded = props.expandedItemIds.includes(item.id);

                  return (
                    <article className="equipment-item-card" key={item.id}>
                      <button
                        aria-controls={itemPanelId}
                        aria-expanded={isExpanded}
                        aria-label={`${item.name} 상세 ${isExpanded ? "접기" : "펼치기"}`}
                        className="equipment-item-summary"
                        onClick={() => props.onToggleItem(item.id)}
                        type="button"
                      >
                        <span className="equipment-item-summary__content">
                          <span className="equipment-item-summary__eyebrow">항목</span>
                          <strong>{item.name}</strong>
                        </span>
                        <span className="equipment-item-summary__meta">
                          {summary.quantity ? (
                            <span className="equipment-item-summary__badge">
                              {summary.quantity}
                            </span>
                          ) : null}
                          {summary.metadata ? (
                            <span className="equipment-item-summary__badge">
                              {summary.metadata}
                            </span>
                          ) : null}
                          <span className="equipment-item-summary__badge">
                            {summary.status}
                          </span>
                        </span>
                      </button>

                      {isExpanded ? (
                        <div className="equipment-item-detail" id={itemPanelId}>
                          {props.renderEditor(item)}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function EquipmentList(props: {
  section: EquipmentSection;
  categoryDrafts: Record<string, string>;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: DurableEquipmentItem[];
  metadataJobStatuses: DurableMetadataJobStatusMap;
  refreshingMetadataIds: string[];
  onToggleCategory: (categoryId: string) => void;
  onToggleItem: (itemId: string) => void;
  onChange: (itemId: string, updater: (item: DurableEquipmentItem) => DurableEquipmentItem) => void;
  onCategoryChange: (itemId: string, categoryId: string) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onRefreshMetadata: (itemId: string) => void;
}) {
  return (
    <GroupedEquipmentList<DurableEquipmentItem>
      categories={props.categories}
      collapsedCategoryIds={props.collapsedCategoryIds}
      emptyMessage="등록된 반복 장비가 없습니다."
      expandedItemIds={props.expandedItemIds}
      items={props.items}
      onToggleCategory={props.onToggleCategory}
      onToggleItem={props.onToggleItem}
      renderEditor={(item) => (
        <>
          <div className="form-grid">
            <FormField label="장비명">
              <input
                placeholder="장비명"
                value={item.name}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="모델명">
              <input
                placeholder="예: 패밀리 터널 4P"
                value={item.model ?? ""}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    model: event.target.value || undefined,
                  }))
                }
              />
            </FormField>
            <FormField label="카테고리">
              <EquipmentCategorySelect
                categories={props.categories}
                value={props.categoryDrafts[item.id] ?? item.category}
                onChange={(value) => props.onCategoryChange(item.id, value)}
              />
            </FormField>
            <FormField label="수량">
              <input
                type="number"
                min="1"
                placeholder="1"
                value={item.quantity}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    quantity: Number(event.target.value) || 1,
                  }))
                }
              />
            </FormField>
            <FormField label="상태">
              <select
                value={item.status}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    status: event.target.value as DurableEquipmentItem["status"],
                  }))
                }
              >
                {Object.entries(DURABLE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="구매 링크" full>
              <input
                placeholder="https://"
                value={item.purchase_link ?? ""}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    purchase_link: event.target.value || undefined,
                  }))
                }
              />
            </FormField>
          </div>
          <p className="equipment-helper-copy">
            장비명, 모델명, 구매 링크는 AI 메타데이터 검색의 기준으로 사용됩니다.
          </p>
          <DurableMetadataSection
            metadata={item.metadata}
            jobStatus={props.metadataJobStatuses[item.id]}
          />
          <div className="button-row">
            <button className="button" onClick={() => props.onSave(item.id)} type="button">
              저장
            </button>
            <button
              className="button"
              disabled={props.refreshingMetadataIds.includes(item.id)}
              onClick={() => props.onRefreshMetadata(item.id)}
              type="button"
            >
              {props.refreshingMetadataIds.includes(item.id)
                ? "메타데이터 수집 중..."
                : "메타데이터 재수집"}
            </button>
            <button className="button" onClick={() => props.onDelete(item.id)} type="button">
              삭제
            </button>
          </div>
        </>
      )}
      renderSummaryMeta={(item: DurableEquipmentItem) => ({
        metadata: getDurableMetadataSummaryStatusLabel(
          props.metadataJobStatuses[item.id]?.status,
        ),
        quantity: `수량 ${item.quantity}`,
        status: getStatusLabel(DURABLE_STATUS_LABELS, item.status),
      })}
      section={props.section}
    />
  );
}

function DurableMetadataSection(props: {
  metadata?: DurableEquipmentMetadata;
  jobStatus?: DurableMetadataJobStatusResponse;
}) {
  const metadata = props.metadata;
  const jobStatus = props.jobStatus;
  const jobBadgeLabel = getDurableMetadataCardBadgeLabel(jobStatus?.status, metadata);

  if (!metadata) {
    return (
      <section className="metadata-card">
        <div className="metadata-card__header">
          <strong>장비 메타데이터</strong>
          <span className="equipment-item-summary__badge">{jobBadgeLabel}</span>
        </div>
        <p className="metadata-card__copy">
          {isPendingDurableMetadataJobStatus(jobStatus?.status)
            ? "백그라운드에서 메타데이터를 수집 중입니다. 완료되면 이 카드가 자동으로 갱신됩니다."
            : jobStatus?.status === "failed"
              ? jobStatus.error?.message ??
                "메타데이터 수집이 실패했습니다. 장비 정보를 확인한 뒤 다시 실행해 주세요."
              : jobStatus?.status === "interrupted"
                ? jobStatus.error?.message ??
                  "이전 메타데이터 수집이 중단되었습니다. 다시 실행해 주세요."
                : "아직 수집된 메타데이터가 없습니다. 저장 후 자동 수집되거나 수동으로 재수집할 수 있습니다."}
        </p>
      </section>
    );
  }

  const sizeText = formatPackedSize(metadata);
  const sourceCount = metadata.sources.length;

  return (
    <section className="metadata-card">
      <div className="metadata-card__header">
        <strong>장비 메타데이터</strong>
        <span className="equipment-item-summary__badge">{jobBadgeLabel}</span>
      </div>
      <p className="metadata-card__copy">
        마지막 수집: {formatRelativeDate(metadata.searched_at)} / 검색 질의: {metadata.query}
      </p>
      {jobStatus?.status === "failed" || jobStatus?.status === "interrupted" ? (
        <p className="metadata-card__copy">
          {jobStatus.error?.message ??
            `${getDurableMetadataStatusLabel(jobStatus.status)} 상태입니다. 다시 수집해 주세요.`}
        </p>
      ) : null}
      {isPendingDurableMetadataJobStatus(jobStatus?.status) ? (
        <p className="metadata-card__copy">
          현재 저장된 메타데이터를 유지한 채 백그라운드에서 최신 정보로 갱신 중입니다.
        </p>
      ) : null}
      {metadata.summary ? <p className="metadata-card__copy">{metadata.summary}</p> : null}
      <div className="metadata-grid">
        <div className="metadata-grid__item">
          <span>공식명</span>
          <strong>{metadata.product?.official_name ?? "-"}</strong>
        </div>
        <div className="metadata-grid__item">
          <span>브랜드/모델</span>
          <strong>
            {[metadata.product?.brand, metadata.product?.model].filter(Boolean).join(" / ") ||
              "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>포장 크기</span>
          <strong>{sizeText ?? "-"}</strong>
        </div>
        <div className="metadata-grid__item">
          <span>무게</span>
          <strong>
            {typeof metadata.packing?.weight_kg === "number"
              ? `${metadata.packing.weight_kg} kg`
              : "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>설치 시간</span>
          <strong>
            {typeof metadata.planning?.setup_time_minutes === "number"
              ? `${metadata.planning.setup_time_minutes}분`
              : "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>추천 인원</span>
          <strong>
            {typeof metadata.planning?.recommended_people === "number"
              ? `${metadata.planning.recommended_people}명`
              : "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>수용 인원</span>
          <strong>
            {typeof metadata.planning?.capacity_people === "number"
              ? `${metadata.planning.capacity_people}명`
              : "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>출처</span>
          <strong>{sourceCount > 0 ? `${sourceCount}건` : "-"}</strong>
        </div>
      </div>
      {metadata.planning?.season_notes?.length ? (
        <div className="metadata-list">
          <span>계절 메모</span>
          <ul>
            {metadata.planning.season_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {metadata.planning?.weather_notes?.length ? (
        <div className="metadata-list">
          <span>날씨 메모</span>
          <ul>
            {metadata.planning.weather_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {metadata.sources.length ? (
        <div className="metadata-list">
          <span>참고 출처</span>
          <ul>
            {metadata.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} rel="noreferrer" target="_blank">
                  {source.title}
                </a>
                <span>{source.domain}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ConsumableList(props: {
  section: EquipmentSection;
  categoryDrafts: Record<string, string>;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: ConsumableEquipmentItem[];
  onToggleCategory: (categoryId: string) => void;
  onToggleItem: (itemId: string) => void;
  onChange: (
    itemId: string,
    updater: (item: ConsumableEquipmentItem) => ConsumableEquipmentItem,
  ) => void;
  onCategoryChange: (itemId: string, categoryId: string) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <GroupedEquipmentList<ConsumableEquipmentItem>
      categories={props.categories}
      collapsedCategoryIds={props.collapsedCategoryIds}
      emptyMessage="등록된 소모품이 없습니다."
      expandedItemIds={props.expandedItemIds}
      items={props.items}
      onToggleCategory={props.onToggleCategory}
      onToggleItem={props.onToggleItem}
      renderEditor={(item) => (
        <>
          <div className="form-grid">
            <FormField label="소모품명">
              <input
                placeholder="소모품명"
                value={item.name}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="카테고리">
              <EquipmentCategorySelect
                categories={props.categories}
                value={props.categoryDrafts[item.id] ?? item.category}
                onChange={(value) => props.onCategoryChange(item.id, value)}
              />
            </FormField>
            <FormField label="현재 수량">
              <input
                type="number"
                min="0"
                placeholder="0"
                value={item.quantity_on_hand}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    quantity_on_hand: Number(event.target.value) || 0,
                  }))
                }
              />
            </FormField>
            <FormField label="단위">
              <input
                placeholder="단위"
                value={item.unit}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    unit: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="부족 기준">
              <input
                type="number"
                min="0"
                placeholder="예: 2"
                value={item.low_stock_threshold ?? ""}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    low_stock_threshold: parseInteger(event.target.value),
                  }))
                }
              />
            </FormField>
          </div>
          <div className="button-row">
            <button className="button" onClick={() => props.onSave(item.id)} type="button">
              저장
            </button>
            <button className="button" onClick={() => props.onDelete(item.id)} type="button">
              삭제
            </button>
          </div>
        </>
      )}
      renderSummaryMeta={(item: ConsumableEquipmentItem) => ({
        quantity: `수량 ${item.quantity_on_hand}${item.unit ? ` ${item.unit}` : ""}`,
        status: getStatusLabel(
          CONSUMABLE_STATUS_LABELS,
          getConsumableStatus(item),
        ),
      })}
      section={props.section}
    />
  );
}

function PrecheckList(props: {
  section: EquipmentSection;
  categoryDrafts: Record<string, string>;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: PrecheckItem[];
  onToggleCategory: (categoryId: string) => void;
  onToggleItem: (itemId: string) => void;
  onChange: (itemId: string, updater: (item: PrecheckItem) => PrecheckItem) => void;
  onCategoryChange: (itemId: string, categoryId: string) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <GroupedEquipmentList<PrecheckItem>
      categories={props.categories}
      collapsedCategoryIds={props.collapsedCategoryIds}
      emptyMessage="등록된 점검 항목이 없습니다."
      expandedItemIds={props.expandedItemIds}
      items={props.items}
      onToggleCategory={props.onToggleCategory}
      onToggleItem={props.onToggleItem}
      renderEditor={(item) => (
        <>
          <div className="form-grid">
            <FormField label="점검 항목명">
              <input
                placeholder="점검 항목명"
                value={item.name}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="카테고리">
              <EquipmentCategorySelect
                categories={props.categories}
                value={props.categoryDrafts[item.id] ?? item.category}
                onChange={(value) => props.onCategoryChange(item.id, value)}
              />
            </FormField>
            <FormField label="상태" full>
              <select
                value={item.status}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    status: event.target.value as PrecheckItem["status"],
                  }))
                }
              >
                {Object.entries(PRECHECK_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="button-row">
            <button className="button" onClick={() => props.onSave(item.id)} type="button">
              저장
            </button>
            <button className="button" onClick={() => props.onDelete(item.id)} type="button">
              삭제
            </button>
          </div>
        </>
      )}
      renderSummaryMeta={(item: PrecheckItem) => ({
        status: getStatusLabel(PRECHECK_STATUS_LABELS, item.status),
      })}
      section={props.section}
    />
  );
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseInteger(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function joinCommaList(values?: string[]) {
  return values?.join(", ") ?? "";
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLineList(values?: string[]) {
  return values?.join("\n") ?? "";
}

function splitLineList(value: string) {
  return value
    .split("\n")
    .filter((item) => item.trim().length > 0);
}

function resolveCategorySelection(
  currentValue: string,
  categories: EquipmentCategory[],
): string {
  if (categories.some((item) => item.id === currentValue)) {
    return currentValue;
  }

  return categories[0]?.id ?? currentValue;
}

function buildEquipmentCategoryOptions(
  categories: EquipmentCategory[],
  currentValue?: string,
) {
  return mergeEquipmentCategories(
    categories,
    currentValue ? [currentValue] : [],
  );
}

function buildEquipmentCategoryGroups<T extends { category: string }>(
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

function buildEquipmentCategoryIdMap(
  categories: EquipmentCategoriesData,
): SectionTrackedIds {
  return {
    durable: categories.durable.map((item) => item.id),
    consumables: categories.consumables.map((item) => item.id),
    precheck: categories.precheck.map((item) => item.id),
  };
}

function buildVisibleEquipmentCategoryIdMap(
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

function buildEquipmentItemIdMap(catalog: EquipmentCatalog | null): SectionTrackedIds {
  if (!catalog) {
    return createEmptySectionTrackedIds();
  }

  return {
    durable: catalog.durable.items.map((item) => item.id),
    consumables: catalog.consumables.items.map((item) => item.id),
    precheck: catalog.precheck.items.map((item) => item.id),
  };
}

function mergeEquipmentCategories(
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

function sortEquipmentCategories(left: EquipmentCategory, right: EquipmentCategory) {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.label.localeCompare(right.label, "ko");
}

function appendSyncWarnings(base: string, warnings: string[]) {
  if (warnings.length === 0) {
    return base;
  }

  return `${base} / ${warnings.join(" / ")}`;
}

function toDurableEquipmentInput(item: DurableEquipmentItem): DurableEquipmentItemInput {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    model: item.model,
    purchase_link: item.purchase_link,
    category: item.category,
    quantity: item.quantity,
    capacity: item.capacity,
    season_support: item.season_support,
    tags: item.tags,
    status: item.status,
    notes: item.notes,
  };
}

function buildDurableMetadataFingerprint(
  item: Pick<DurableEquipmentItem, "name" | "model" | "purchase_link" | "category">,
) {
  return [item.name, item.model ?? "", item.purchase_link ?? "", item.category].join("::");
}

function buildDurableFingerprintMap(catalog: EquipmentCatalog) {
  return Object.fromEntries(
    catalog.durable.items.map((item) => [item.id, buildDurableMetadataFingerprint(item)]),
  );
}

function createDurableMetadataJobStatusMap(
  items: DurableMetadataJobStatusResponse[],
): DurableMetadataJobStatusMap {
  return Object.fromEntries(items.map((item) => [item.item_id, item]));
}

function isPendingDurableMetadataJobStatus(status?: DurableMetadataJobStatus) {
  return status === "queued" || status === "running";
}

function getDurableMetadataStatusLabel(status?: DurableMetadataJobStatus) {
  switch (status) {
    case "queued":
      return "대기 중";
    case "running":
      return "수집 중";
    case "failed":
      return "수집 실패";
    case "interrupted":
      return "수집 중단";
    default:
      return "미수집";
  }
}

function getDurableMetadataSummaryStatusLabel(status?: DurableMetadataJobStatus) {
  switch (status) {
    case "queued":
    case "running":
      return "메타 수집 중";
    case "failed":
      return "메타 실패";
    case "interrupted":
      return "메타 중단";
    default:
      return undefined;
  }
}

function getDurableMetadataCardBadgeLabel(
  status: DurableMetadataJobStatus | undefined,
  metadata?: DurableEquipmentMetadata,
) {
  if (status === "queued" || status === "running") {
    return "백그라운드 수집 중";
  }

  if (status === "failed") {
    return "재수집 실패";
  }

  if (status === "interrupted") {
    return "재수집 중단";
  }

  return metadata
    ? DURABLE_METADATA_STATUS_LABELS[metadata.lookup_status]
    : "미수집";
}

function buildDashboardAlerts(catalog: EquipmentCatalog | null) {
  if (!catalog) {
    return [];
  }

  const consumableAlerts = catalog.consumables.items
    .filter((item) => getConsumableStatus(item) !== "ok")
    .map(
      (item) =>
        `${item.name} ${item.quantity_on_hand}${item.unit ? ` ${item.unit}` : ""} / ${getStatusLabel(
          CONSUMABLE_STATUS_LABELS,
          getConsumableStatus(item),
        )}`,
    );

  const precheckAlerts = catalog.precheck.items
    .filter((item) => item.status !== "ok")
    .map((item) => `${item.name} / ${getStatusLabel(PRECHECK_STATUS_LABELS, item.status)}`);

  return [...consumableAlerts, ...precheckAlerts].slice(0, 6);
}

function formatCompactTripId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [year, month, day, ...rest] = value.split("-");

  if (!year || !month || !day || rest.length === 0) {
    return value;
  }

  return `${year}-${month}-${day} / ${rest.join("-")}`;
}

function formatPackedSize(metadata: DurableEquipmentMetadata) {
  const values = [
    metadata.packing?.width_cm,
    metadata.packing?.depth_cm,
    metadata.packing?.height_cm,
  ].filter((value): value is number => typeof value === "number");

  return values.length === 3 ? `${values.join(" x ")} cm` : null;
}

function formatRelativeDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ko-KR");
}

function readPersistedUiState(): PersistedUiState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(UI_STATE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;

    if (
      !parsed.activePage ||
      !PAGE_KEYS.includes(parsed.activePage) ||
      !parsed.equipmentSection ||
      !isEquipmentSection(parsed.equipmentSection)
    ) {
      return null;
    }

    return {
      activePage: parsed.activePage,
      selectedTripId:
        typeof parsed.selectedTripId === "string" ? parsed.selectedTripId : null,
      selectedHistoryId:
        typeof parsed.selectedHistoryId === "string" ? parsed.selectedHistoryId : null,
      equipmentSection: parsed.equipmentSection,
      dashboardPageTab: isDashboardPageTab(parsed.dashboardPageTab)
        ? parsed.dashboardPageTab
        : "overview",
      companionPageTab: isCompanionPageTab(parsed.companionPageTab)
        ? parsed.companionPageTab
        : "editor",
      vehiclePageTab: isVehiclePageTab(parsed.vehiclePageTab)
        ? parsed.vehiclePageTab
        : "editor",
      equipmentPageTab: isEquipmentPageTab(parsed.equipmentPageTab)
        ? parsed.equipmentPageTab
        : "list",
      categoryPageTab: isCategoryPageTab(parsed.categoryPageTab)
        ? parsed.categoryPageTab
        : "list",
      helpPageTab: isHelpPageTab(parsed.helpPageTab) ? parsed.helpPageTab : "files",
      planningPageTab: isPlanningPageTab(parsed.planningPageTab)
        ? parsed.planningPageTab
        : "editor",
      historyPageTab: isHistoryPageTab(parsed.historyPageTab)
        ? parsed.historyPageTab
        : "details",
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

function writePersistedUiState(state: PersistedUiState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write failures so the app remains usable.
  }
}

function isEquipmentSection(value: string): value is EquipmentSection {
  return value === "durable" || value === "consumables" || value === "precheck";
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

function toggleSectionTrackedId(
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

function syncCollapsedSectionTrackedIds(
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

function syncExpandedSectionTrackedIds(
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

function removeSectionTrackedId(
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

function ensureSectionIdTracked(
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

function setEquipmentCategorySelectionDraft(
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

function omitDraftLabel(drafts: Record<string, string>, categoryId: string) {
  const nextDrafts = { ...drafts };
  delete nextDrafts[categoryId];
  return nextDrafts;
}

function findEquipmentItem(
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

function getMissingCompanionIds(
  companionIds: string[],
  knownCompanionIds: string[],
) {
  const knownIds = new Set(knownCompanionIds);
  return [...new Set(companionIds.filter((item) => item && !knownIds.has(item)))];
}

function toggleSelectionId(currentIds: string[], targetId: string) {
  return currentIds.includes(targetId)
    ? currentIds.filter((item) => item !== targetId)
    : [...currentIds, targetId];
}

function resolveSelectedCompanions(
  companionIds: string[],
  companions: Companion[],
) {
  const companionMap = new Map(companions.map((item) => [item.id, item]));

  return companionIds.map(
    (companionId) =>
      companionMap.get(companionId) ?? createPlaceholderCompanion(companionId),
  );
}

function sortVehicles(left: Vehicle, right: Vehicle) {
  return left.name.localeCompare(right.name, "ko");
}

function buildVehicleOptions(
  vehicles: Vehicle[],
  currentVehicle?: TripDraft["vehicle"],
) {
  const merged = [...vehicles];

  if (
    currentVehicle?.id &&
    !merged.some((vehicle) => vehicle.id === currentVehicle.id)
  ) {
    merged.push({
      id: currentVehicle.id,
      name: currentVehicle.name ?? currentVehicle.id,
      description: currentVehicle.description,
      passenger_capacity: currentVehicle.passenger_capacity,
      load_capacity_kg: currentVehicle.load_capacity_kg,
      notes: currentVehicle.notes ?? [],
    });
  }

  return merged.sort(sortVehicles);
}

function buildTripVehicleSelection(
  vehicleId: string,
  vehicles: Vehicle[],
  currentVehicle?: TripDraft["vehicle"],
): TripDraft["vehicle"] {
  if (!vehicleId) {
    return undefined;
  }

  const matchedVehicle = buildVehicleOptions(vehicles, currentVehicle).find(
    (vehicle) => vehicle.id === vehicleId,
  );

  if (!matchedVehicle) {
    return currentVehicle?.id === vehicleId ? currentVehicle : { id: vehicleId };
  }

  return {
    id: matchedVehicle.id,
    name: matchedVehicle.name,
    description: matchedVehicle.description,
    passenger_capacity: matchedVehicle.passenger_capacity,
    load_capacity_kg: matchedVehicle.load_capacity_kg,
    notes: [...matchedVehicle.notes],
  };
}

function resolveSelectedVehicle(
  tripVehicle: TripDraft["vehicle"],
  vehicles: Vehicle[],
): Vehicle | null {
  if (!tripVehicle) {
    return null;
  }

  const matchedVehicle = tripVehicle.id
    ? vehicles.find((vehicle) => vehicle.id === tripVehicle.id) ?? null
    : null;

  if (!matchedVehicle && !tripVehicle.id && !tripVehicle.name) {
    return null;
  }

  return {
    id: tripVehicle.id ?? matchedVehicle?.id ?? "vehicle-snapshot",
    name: tripVehicle.name ?? matchedVehicle?.name ?? tripVehicle.id ?? "차량",
    description: tripVehicle.description ?? matchedVehicle?.description,
    passenger_capacity:
      tripVehicle.passenger_capacity ?? matchedVehicle?.passenger_capacity,
    load_capacity_kg:
      tripVehicle.load_capacity_kg ?? matchedVehicle?.load_capacity_kg,
    notes:
      tripVehicle.notes && tripVehicle.notes.length > 0
        ? tripVehicle.notes
        : matchedVehicle?.notes ?? [],
  };
}

function resolveHistoryCompanionSnapshots(
  history: HistoryRecord,
  companions: Companion[],
) {
  if (history.companion_snapshots.length > 0) {
    return history.companion_snapshots;
  }

  return resolveSelectedCompanions(history.companion_ids, companions);
}

function resolveHistoryVehicleSnapshot(
  history: HistoryRecord | null,
  vehicles: Vehicle[],
) {
  if (!history) {
    return null;
  }

  if (history.vehicle_snapshot) {
    return resolveSelectedVehicle(history.vehicle_snapshot, vehicles);
  }

  return resolveSelectedVehicle(history.trip_snapshot.vehicle, vehicles);
}

function sortCompanions(left: Companion, right: Companion) {
  return left.name.localeCompare(right.name, "ko");
}

function sortLinks(left: ExternalLink, right: ExternalLink) {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.name.localeCompare(right.name, "ko");
}

function createIdleAnalysisCategoryStatuses(): TripAnalysisCategoryStatusResponse[] {
  return ALL_TRIP_ANALYSIS_CATEGORIES.map((category) => ({
    category,
    label: TRIP_ANALYSIS_CATEGORY_METADATA[category].label,
    sections: TRIP_ANALYSIS_CATEGORY_METADATA[category].sections,
    status: "idle",
    has_result: false,
    requested_at: null,
    started_at: null,
    finished_at: null,
    collected_at: null,
  }));
}

function createIdleAnalysisStatus(tripId: string): AnalyzeTripResponse {
  return {
    trip_id: tripId,
    status: "idle",
    requested_at: null,
    started_at: null,
    finished_at: null,
    output_path: null,
    categories: createIdleAnalysisCategoryStatuses(),
    completed_category_count: 0,
    total_category_count: ALL_TRIP_ANALYSIS_CATEGORIES.length,
  };
}

function isPendingAnalysisStatus(status?: AnalyzeTripResponse["status"] | null) {
  return status === "queued" || status === "running";
}

function isPendingUserLearningStatus(
  status?: UserLearningJobStatusResponse["status"] | null,
) {
  return status === "queued" || status === "running";
}

function getAiJobRealtimeReconnectDelay(attemptCount: number) {
  if (attemptCount <= 0) {
    return 1000;
  }

  if (attemptCount === 1) {
    return 3000;
  }

  return 5000;
}

function getTripAnalysisStatusLabel(status: AnalyzeTripResponse["status"]) {
  return TRIP_ANALYSIS_STATUS_LABELS[status] ?? status;
}

function getStatusLabel(
  labels: Record<string, string>,
  status: string,
) {
  return labels[status] ?? status;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

function toValidationWarnings(error: unknown): string[] {
  const message = getErrorMessage(error);
  return message ? [message] : ["검증 결과를 가져오지 못했습니다."];
}

function confirmDeletion(message: string): boolean {
  return window.confirm(message);
}
