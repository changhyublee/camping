import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
} from "react";
import type {
  AiJobEvent,
  AnalyzeTripResponse,
  Companion,
  ConsumableEquipmentItem,
  ConsumableEquipmentItemInput,
  DurableMetadataJobStatus,
  DurableMetadataJobStatusResponse,
  DurableEquipmentItem,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentCategoriesData,
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
  EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
  EQUIPMENT_SECTION_LABELS,
  EXTERNAL_LINK_CATEGORY_LABELS,
  USER_LEARNING_STATUS_LABELS,
  getConsumableStatus,
} from "@camping/shared";
import { cloneEquipmentCategories } from "@camping/shared";
import { apiClient, ApiClientError, type AiJobEventSubscription } from "../api/client";
import {
  getAdjacentEquipmentSection,
  getDetailPanelId,
  getDetailTabId,
  getEquipmentSectionPanelId,
  getEquipmentSectionTabId,
} from "./tab-helpers";
import { getPathForPage, type PageKey } from "./navigation";
import {
  EQUIPMENT_SECTIONS,
  type CategoryDetailTab,
  type CategoryPageTab,
  type CompanionPageTab,
  type DashboardPageTab,
  type EquipmentDetailTab,
  type EquipmentPageTab,
  type HelpPageTab,
  type HistoryDetailTab,
  type HistoryPageTab,
  type LinkPageTab,
  type PlanningDetailTab,
  type PlanningPageTab,
  type VehiclePageTab,
  readPersistedUiState,
  writePersistedUiState,
} from "./ui-state";
import {
  appendSyncWarnings,
  formatCompactTripId,
  formatRelativeDate,
  getErrorMessage,
  joinLineList,
  parseInteger,
  parseNumber,
  splitCommaList,
  toValidationWarnings,
} from "./common-formatters";
import { confirmDeletion } from "./browser-helpers";
import {
  buildDashboardAlerts,
  buildDurableMetadataFingerprint,
  buildDurableFingerprintMap,
  buildEquipmentCategoryIdMap,
  buildEquipmentItemIdMap,
  buildVisibleEquipmentCategoryIdMap,
  createDurableMetadataJobStatusMap,
  ensureSectionIdTracked,
  findEquipmentItem,
  getDurableMetadataStatusLabel,
  isPendingDurableMetadataJobStatus,
  omitDraftLabel,
  removeSectionTrackedId,
  resolveCategorySelection,
  sortEquipmentCategories,
  setEquipmentCategorySelectionDraft,
  syncCollapsedSectionTrackedIds,
  syncExpandedSectionTrackedIds,
  toggleSectionTrackedId,
  toDurableEquipmentInput,
} from "./equipment-view-helpers";
import {
  buildTripVehicleSelection,
  buildVehicleOptions,
  createIdleAnalysisCategoryStatuses,
  createIdleAnalysisStatus,
  getAiJobRealtimeReconnectDelay,
  getMissingCompanionIds,
  getTripAnalysisStatusLabel,
  isPendingAnalysisStatus,
  isPendingUserLearningStatus,
  resolveHistoryCompanionSnapshots,
  resolveHistoryVehicleSnapshot,
  resolveSelectedVehicle,
  resolveSelectedCompanions,
  sortCompanions,
  sortLinks,
  sortVehicles,
  toggleSelectionId,
} from "./planning-history-helpers";
import {
  buildCompanionInput,
  buildHistoryRecordForSave,
  buildRetrospectiveInput,
  buildTripDraftForSave,
  buildVehicleInput,
  createCommaSeparatedInputs,
  createCompanionTextInputs,
  createEmptyCategoryDrafts,
  createEmptyEquipmentCategoryDraft,
  createEmptyCategoryLabelDrafts,
  createEmptyCompanion,
  createEmptyConsumableItem,
  createEmptyDurableItem,
  createEmptyEquipmentCategorySelectionDrafts,
  createEmptyLink,
  createEmptyPrecheckItem,
  createEmptyRetrospectiveDraft,
  createEmptySectionTrackedIds,
  createEmptyTripDraft,
  createEmptyVehicle,
  createHistoryEditorDraft,
  createIdleUserLearningStatus,
  toggleExpandedEquipmentSections,
} from "./view-model-drafts";
import {
  AiJobRealtimeMode,
  CategoryDrafts,
  CategoryLabelDrafts,
  CommaSeparatedInputs,
  CompanionTextInputs,
  DurableMetadataJobStatusMap,
  HistoryEditorDraft,
  OperationState,
  RetrospectiveDraft,
  SectionTrackedIds,
  EquipmentCategorySelectionDrafts,
} from "./view-model-types";

type MarkdownLayerState = {
  eyebrow: string;
  title: string;
  description: string;
  outputPath: string | null;
  markdown: string;
};

export function useAppViewModel(initialPage?: PageKey) {
  const [persistedUiState] = useState(() => readPersistedUiState());
  const [activePage, setActivePageState] = useState<PageKey>(
    initialPage ?? persistedUiState?.activePage ?? "dashboard",
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
    useState<CompanionPageTab>(persistedUiState?.companionPageTab ?? "list");
  const [vehiclePageTab, setVehiclePageTab] =
    useState<VehiclePageTab>(persistedUiState?.vehiclePageTab ?? "list");
  const [equipmentPageTab, setEquipmentPageTab] =
    useState<EquipmentPageTab>(persistedUiState?.equipmentPageTab ?? "list");
  const [categoryPageTab, setCategoryPageTab] =
    useState<CategoryPageTab>(persistedUiState?.categoryPageTab ?? "list");
  const [helpPageTab, setHelpPageTab] =
    useState<HelpPageTab>(persistedUiState?.helpPageTab ?? "files");
  const [planningPageTab, setPlanningPageTab] =
    useState<PlanningPageTab>(persistedUiState?.planningPageTab ?? "list");
  const [historyPageTab, setHistoryPageTab] =
    useState<HistoryPageTab>(persistedUiState?.historyPageTab ?? "list");
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
  const [aiJobRealtimeMode, setAiJobRealtimeMode] =
    useState<AiJobRealtimeMode>("inactive");
  const [commaInputs, setCommaInputs] = useState<CommaSeparatedInputs>(
    createCommaSeparatedInputs(),
  );
  const [companionTextInputs, setCompanionTextInputs] = useState<CompanionTextInputs>(
    createCompanionTextInputs(),
  );
  const [vehicleNoteInput, setVehicleNoteInput] = useState("");
  const [tripNoteInput, setTripNoteInput] = useState("");
  const [historyEditorResetVersion, setHistoryEditorResetVersion] = useState(0);
  const [retrospectiveResetVersion, setRetrospectiveResetVersion] = useState(0);
  const historyEditorDraftRef = useRef<HistoryEditorDraft>(createHistoryEditorDraft());
  const retrospectiveDraftRef = useRef<RetrospectiveDraft>(createEmptyRetrospectiveDraft());
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
  const setActivePage = useCallback(
    (
      page: PageKey,
      options?: {
        historyMode?: "push" | "replace";
        syncHistory?: boolean;
      },
    ) => {
      setActivePageState(page);

      if (typeof window === "undefined" || options?.syncHistory === false) {
        return;
      }

      const nextPath = getPathForPage(page);

      if (window.location.pathname === nextPath) {
        return;
      }

      if (options?.historyMode === "replace") {
        window.history.replaceState(null, "", nextPath);
        return;
      }

      window.history.pushState(null, "", nextPath);
    },
    [],
  );

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
        setTripNoteInput(joinLineList(tripResult.value.data.notes));
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
  const isUserLearningPending = isPendingUserLearningStatus(userLearningStatus.status);
  const shouldEnableAiJobRealtime =
    isAnalysisPending || hasPendingDurableMetadataJobs || isUserLearningPending;
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
    historyEditorDraftRef.current = createHistoryEditorDraft(selectedHistory);
    retrospectiveDraftRef.current = createEmptyRetrospectiveDraft();
    setRetrospectiveResetVersion((current) => current + 1);
    setHistoryEditorResetVersion((current) => current + 1);
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
    const clearReconnectTimer = () => {
      if (aiJobEventReconnectTimeoutRef.current !== null) {
        window.clearTimeout(aiJobEventReconnectTimeoutRef.current);
        aiJobEventReconnectTimeoutRef.current = null;
      }
    };
    const closeSubscription = () => {
      aiJobEventSubscriptionRef.current?.close();
      aiJobEventSubscriptionRef.current = null;
    };

    if (!shouldEnableAiJobRealtime) {
      clearReconnectTimer();
      closeSubscription();
      aiJobEventReconnectAttemptsRef.current = 0;
      aiJobEventHasConnectedRef.current = false;
      setAiJobRealtimeMode("inactive");
      return;
    }

    if (typeof EventSource === "undefined") {
      clearReconnectTimer();
      closeSubscription();
      setAiJobRealtimeMode("fallback");
      return;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      closeSubscription();
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

          closeSubscription();
          setAiJobRealtimeMode("fallback");
          const reconnectDelay = getAiJobRealtimeReconnectDelay(
            aiJobEventReconnectAttemptsRef.current,
          );
          aiJobEventReconnectAttemptsRef.current += 1;
          clearReconnectTimer();
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
      clearReconnectTimer();
      closeSubscription();
    };
  }, [shouldEnableAiJobRealtime]);

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
    setPlanningPageTab("editor");
    setIsCreatingTrip(true);
    setSelectedTripId(null);
    setTripDraft(nextDraft);
    setCommaInputs(createCommaSeparatedInputs(nextDraft));
    setTripNoteInput(joinLineList(nextDraft.notes));
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
    setPlanningPageTab("editor");
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
    const nextDraft = createEmptyCompanion(companionId);
    setEditingCompanionId(null);
    setCompanionDraft(nextDraft);
    setCompanionTextInputs(createCompanionTextInputs(nextDraft));
  }

  function beginEditCompanion(companion: Companion) {
    const nextDraft = {
      ...companion,
      health_notes: [...companion.health_notes],
      required_medications: [...companion.required_medications],
      traits: {
        cold_sensitive: companion.traits.cold_sensitive ?? false,
        heat_sensitive: companion.traits.heat_sensitive ?? false,
        rain_sensitive: companion.traits.rain_sensitive ?? false,
      },
    };
    setEditingCompanionId(companion.id);
    setCompanionDraft(nextDraft);
    setCompanionTextInputs(createCompanionTextInputs(nextDraft));
  }

  async function handleCreateCompanion() {
    try {
      const response = await apiClient.createCompanion(
        buildCompanionInput(companionDraft, companionTextInputs),
      );
      const nextCompanions = [...companions, response.item].sort(sortCompanions);

      setCompanions(nextCompanions);
      setCompanionDraft(createEmptyCompanion());
      setCompanionTextInputs(createCompanionTextInputs());
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
      const response = await apiClient.updateCompanion(
        editingCompanionId,
        buildCompanionInput(companionDraft, companionTextInputs),
      );
      setCompanions((current) =>
        current
          .map((item) => (item.id === response.item.id ? response.item : item))
          .sort(sortCompanions),
      );
      setCompanionDraft(createEmptyCompanion());
      setCompanionTextInputs(createCompanionTextInputs());
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
        setCompanionTextInputs(createCompanionTextInputs());
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
    const nextDraft = createEmptyVehicle();
    setEditingVehicleId(null);
    setVehicleDraft(nextDraft);
    setVehicleNoteInput(joinLineList(nextDraft.notes));
  }

  function beginEditVehicle(vehicle: Vehicle) {
    const nextDraft = {
      ...vehicle,
      notes: [...vehicle.notes],
    };
    setEditingVehicleId(vehicle.id);
    setVehicleDraft(nextDraft);
    setVehicleNoteInput(joinLineList(nextDraft.notes));
  }

  async function handleCreateVehicle() {
    try {
      const response = await apiClient.createVehicle(
        buildVehicleInput(vehicleDraft, vehicleNoteInput),
      );
      setVehicles((current) => [...current, response.item].sort(sortVehicles));
      setVehicleDraft(createEmptyVehicle());
      setVehicleNoteInput("");
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
      const response = await apiClient.updateVehicle(
        editingVehicleId,
        buildVehicleInput(vehicleDraft, vehicleNoteInput),
      );
      setVehicles((current) =>
        current
          .map((item) => (item.id === response.item.id ? response.item : item))
          .sort(sortVehicles),
      );
      setVehicleDraft(createEmptyVehicle());
      setVehicleNoteInput("");
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
        setVehicleNoteInput("");
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
        ? await apiClient.createTrip(buildTripDraftForSave(tripDraft, tripNoteInput))
        : await apiClient.updateTrip(
            selectedTripId ?? tripDraft.trip_id ?? "",
            buildTripDraftForSave(tripDraft, tripNoteInput),
          );

      const tripList = await apiClient.getTrips();
      setTrips(tripList.items);
      setSelectedTripId(response.trip_id);
      setIsCreatingTrip(false);
      setTripDraft(response.data);
      setCommaInputs(createCommaSeparatedInputs(response.data));
      setTripNoteInput(joinLineList(response.data.notes));
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
      setTripNoteInput("");
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
      setTripNoteInput("");
      setAnalysisOutput(null);
      setAnalysisStatus(null);
      analysisStatusRef.current = null;
      setAssistantResponse(null);
      setActivePage("history");
      setHistoryPageTab("details");
      setHistoryDetailTab("retrospective");
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

  async function handleSaveHistory(editorDraft: HistoryEditorDraft) {
    if (!selectedHistory) return;

    try {
      const response = await apiClient.updateHistory(
        selectedHistory.history_id,
        buildHistoryRecordForSave(selectedHistory, editorDraft),
      );
      setHistory((current) =>
        current.map((item) =>
          item.history_id === response.item.history_id ? response.item : item,
        ),
      );
      historyEditorDraftRef.current = createHistoryEditorDraft(response.item);
      setHistoryEditorResetVersion((current) => current + 1);
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

  async function handleAddRetrospective(draft: RetrospectiveDraft) {
    if (!selectedHistory) {
      return;
    }

    setSavingRetrospective(true);

    try {
      const response = await apiClient.addHistoryRetrospective(
        selectedHistory.history_id,
        buildRetrospectiveInput(draft),
      );

      setHistory((current) =>
        current.map((item) =>
          item.history_id === response.item.history_id ? response.item : item,
        ),
      );
      applyUserLearningStatus(response.learning_status);
      retrospectiveDraftRef.current = createEmptyRetrospectiveDraft();
      setRetrospectiveResetVersion((current) => current + 1);
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

  function handleSidebarPageChange(page: PageKey) {
    setActivePage(page);

    if (page === "dashboard") {
      setDashboardPageTab("overview");
      return;
    }

    if (page === "companions") {
      setCompanionPageTab("list");
      return;
    }

    if (page === "vehicles") {
      setVehiclePageTab("list");
      return;
    }

    if (page === "equipment") {
      setEquipmentPageTab("list");
      return;
    }

    if (page === "categories") {
      setCategoryPageTab("list");
      return;
    }

    if (page === "help") {
      setHelpPageTab("files");
      return;
    }

    if (page === "planning") {
      setPlanningPageTab("list");
      return;
    }

    if (page === "history") {
      setHistoryPageTab("list");
      return;
    }

    if (page === "links") {
      setLinkPageTab("list");
    }
  }


  return {
    activePage,
    activeCategoryDetailPanelId,
    activeCategoryDetailTabId,
    activeCategoryPagePanelId,
    activeCategoryPageTabId,
    activeCompanionPagePanelId,
    activeCompanionPageTabId,
    activeDashboardPagePanelId,
    activeDashboardPageTabId,
    activeEquipmentDetailPanelId,
    activeEquipmentDetailTabId,
    activeEquipmentPagePanelId,
    activeEquipmentPageTabId,
    activeEquipmentPanelId,
    activeEquipmentTabId,
    activeHelpPagePanelId,
    activeHelpPageTabId,
    activeHistoryDetailPanelId,
    activeHistoryDetailTabId,
    activeHistoryPagePanelId,
    activeHistoryPageTabId,
    activeLinkPagePanelId,
    activeLinkPageTabId,
    activePlanningDetailPanelId,
    activePlanningDetailTabId,
    activePlanningPagePanelId,
    activePlanningPageTabId,
    activeVehiclePagePanelId,
    activeVehiclePageTabId,
    analysisCategoryStatuses,
    analysisOutput,
    analysisStatus,
    assistantInput,
    assistantLoading,
    assistantResponse,
    appLoading,
    beginCreateTrip,
    buildTripVehicleSelection,
    buildVehicleOptions,
    beginCreateCompanion,
    beginCreateVehicle,
    beginEditCompanion,
    beginEditVehicle,
    currentAnalysisOutputPath,
    currentEquipmentCategories,
    currentEquipmentSectionLabel,
    currentHistoryLabel,
    currentTripLabel,
    currentUserLearningStatusLabel,
    categoryDetailTab,
    categoryDrafts,
    categoryLabelDrafts,
    categoryPageTab,
    clearAnalysisCategorySelection,
    collapsedCategoryEditors,
    collapsedEquipmentCategories,
    commaInputs,
    companionDraft,
    companionPageTab,
    companionTextInputs,
    companions,
    completedAnalysisCategoryCount,
    consumableDraft,
    creatingDataBackup,
    dashboardAlerts,
    dashboardMetrics,
    dashboardPageTab,
    detailLoading,
    durableDraft,
    durableMetadataJobStatuses,
    editingCompanionId,
    editingVehicleId,
    equipment,
    equipmentCategories,
    equipmentCategorySelectionDrafts,
    equipmentDetailTab,
    equipmentMetrics,
    equipmentPageTab,
    equipmentSection,
    expandedCategorySectionCount,
    expandedCategorySections,
    expandedEquipmentItems,
    formatCompactTripId,
    formatRelativeDate,
    getTripAnalysisStatusLabel,
    handleAddRetrospective,
    handleAnalyzeAll,
    handleAnalyzeSelected,
    handleApplyAssistantAction,
    handleArchiveTrip,
    handleAssistantSubmit,
    handleCancelAllAiJobs,
    handleChangeEquipmentItemCategory,
    handleCreateDataBackup,
    handleCreateEquipmentCategory,
    handleCreateEquipmentItem,
    handleCreateLink,
    handleCreateCompanion,
    handleCreateVehicle,
    handleDeleteEquipmentCategory,
    handleDeleteEquipmentItem,
    handleDeleteHistory,
    handleDeleteLink,
    handleDeleteCompanion,
    handleDeleteTrip,
    handleDeleteVehicle,
    handleEquipmentTabKeyDown,
    handleOpenAnalysisLayer,
    handleOpenHistoryOutput,
    handleOpenHistoryOutputLayer,
    handleRefreshAnalysisCategory,
    handleRefreshDurableMetadata,
    handleSaveEquipmentCategory,
    handleSaveEquipmentItem,
    handleSaveHistory,
    handleSaveLink,
    handleSaveTrip,
    handleSaveCompanion,
    handleSaveVehicle,
    handleSidebarPageChange,
    handleToggleCategoryEditor,
    handleToggleCategorySection,
    handleToggleEquipmentCategory,
    handleToggleEquipmentItem,
    helpPageTab,
    history,
    historyDetailTab,
    historyEditorDraftRef,
    historyEditorResetVersion,
    historyLearningError,
    historyLearningInsight,
    historyLearningLoading,
    historyOutput,
    historyOutputError,
    historyOutputLoading,
    historyPageTab,
    isCreatingTrip,
    isAnalysisPending,
    isPendingAnalysisStatus,
    isUserLearningPending,
    linkDraft,
    linkGroups,
    linkPageTab,
    links,
    loadError,
    markdownLayer,
    missingCompanionIds,
    operationState,
    parseInteger,
    parseNumber,
    planningDetailTab,
    planningPageTab,
    precheckDraft,
    refreshingDurableMetadataIds,
    resolveHistoryVehicleSnapshot: (item: HistoryRecord) =>
      resolveHistoryVehicleSnapshot(item, vehicles),
    retrospectiveDraftRef,
    retrospectiveResetVersion,
    savingRetrospective,
    savingTrip,
    selectedAnalysisCategories,
    selectedHistory,
    selectedHistoryCompanionSnapshots,
    selectedHistoryId,
    selectedHistoryRetrospectives,
    selectedHistoryVehicle,
    selectedTripId,
    selectedTripCompanions,
    selectedTripSummary,
    selectedTripVehicle,
    selectAllAnalysisCategories,
    selectTrip,
    setActivePage,
    setAssistantInput,
    setBannerState,
    setCategoryDetailTab,
    setCategoryDrafts,
    setCategoryLabelDrafts,
    setCategoryPageTab,
    setCommaInputs,
    setCompanionDraft,
    setCompanionPageTab,
    setCompanionTextInputs,
    setConsumableDraft,
    setDashboardPageTab,
    setDurableDraft,
    setEquipment,
    setEquipmentDetailTab,
    setEquipmentPageTab,
    setEquipmentSection,
    setHelpPageTab,
    setHistoryDetailTab,
    setHistoryPageTab,
    setLinkDraft,
    setLinkPageTab,
    setLinks,
    setMarkdownLayer,
    setOperationState,
    setPlanningDetailTab,
    setPlanningPageTab,
    setPrecheckDraft,
    setSelectedHistoryId,
    setTripNoteInput,
    setVehicleDraft,
    setVehicleNoteInput,
    setVehiclePageTab,
    splitCommaList,
    stoppingAllAiJobs,
    toggleAnalysisCategorySelection,
    toggleSelectionId,
    tripDraft,
    tripNoteInput,
    trips,
    updateTripDraft,
    userLearningProfile,
    userLearningStatus,
    validationWarnings,
    bannerState,
    vehicleDraft,
    vehicleNoteInput,
    vehiclePageTab,
    vehicles,
  };
}

export type AppViewModel = ReturnType<typeof useAppViewModel>;
