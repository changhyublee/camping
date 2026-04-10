import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  AiJobEvent,
  AnalyzeTripResponse,
  ConsumableEquipmentItem,
  ConsumableEquipmentItemInput,
  DurableMetadataJobStatus,
  DurableMetadataJobStatusResponse,
  DurableEquipmentItem,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentCategoriesData,
  EquipmentSection,
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
  VehicleInput,
} from "@camping/shared";
import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  AGE_GROUP_LABELS,
  EQUIPMENT_SECTION_LABELS,
  EXTERNAL_LINK_CATEGORY_LABELS,
  USER_LEARNING_STATUS_LABELS,
  getConsumableStatus,
} from "@camping/shared";
import { cloneEquipmentCategories } from "@camping/shared";
import { apiClient, ApiClientError, type AiJobEventSubscription } from "../api/client";
import {
  buildActiveTabTargets,
  getAdjacentEquipmentSection,
  getEquipmentSectionTabId,
} from "./tab-helpers";
import { getPathForPage, type PageKey } from "./navigation";
import {
  EQUIPMENT_SECTIONS,
  readPersistedUiState,
  writePersistedUiState,
} from "./ui-state";
import {
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
  sortLinks,
  toggleSelectionId,
} from "./planning-history-helpers";
import {
  canCollectTripWeatherFromDraft,
  collectTripWeatherIntoDraft,
} from "./planning-weather-actions";
import {
  createCommaSeparatedInputs,
  createEmptyCategoryDrafts,
  createEmptyEquipmentCategoryDraft,
  createEmptyCategoryLabelDrafts,
  createEmptyConsumableItem,
  createEmptyDurableItem,
  createEmptyEquipmentCategorySelectionDrafts,
  createEmptyPrecheckItem,
  createEmptySectionTrackedIds,
  createIdleUserLearningStatus,
  toggleExpandedEquipmentSections,
} from "./view-model-drafts";
import { usePlanningState } from "./state/usePlanningState";
import { useEquipmentState } from "./state/useEquipmentState";
import { useHistoryState } from "./state/useHistoryState";
import { useReferenceDataState } from "./state/useReferenceDataState";
import { useUiShellState } from "./state/useUiShellState";
import {
  useMarkdownLayerBodyLockEffect,
  useMarkdownLayerResetEffect,
  useOperationStateAutoClearEffect,
  useUiStateSyncEffect,
} from "./effects/useUiStateEffects";
import {
  useSelectedHistoryLearningEffect,
  useSelectedHistoryResetEffect,
} from "./effects/useHistoryStateEffects";
import {
  useEquipmentCategorySyncEffect,
  useEquipmentVisibilitySyncEffect,
} from "./effects/useEquipmentStateEffects";
import { buildCompanionActions } from "../features/companions/actions";
import { buildVehicleActions } from "../features/vehicles/actions";
import { buildLinkActions } from "../features/links/actions";
import { buildHistoryActions } from "../features/history/actions";
import { buildPlanningActions } from "../features/planning/actions";
import { buildEquipmentActions } from "../features/equipment/actions";

export function useAppViewModel(initialPage?: PageKey) {
  const [persistedUiState] = useState(() => readPersistedUiState());
  const [activePage, setActivePageState] = useState<PageKey>(
    initialPage ?? persistedUiState?.activePage ?? "dashboard",
  );
  const referenceDataState = useReferenceDataState(persistedUiState);
  const {
    companions,
    setCompanions,
    companionDraft,
    setCompanionDraft,
    editingCompanionId,
    setEditingCompanionId,
    vehicles,
    setVehicles,
    vehicleDraft,
    setVehicleDraft,
    editingVehicleId,
    setEditingVehicleId,
    links,
    setLinks,
    linkDraft,
    setLinkDraft,
    companionPageTab,
    setCompanionPageTab,
    vehiclePageTab,
    setVehiclePageTab,
    linkPageTab,
    setLinkPageTab,
    companionTextInputs,
    setCompanionTextInputs,
    vehicleNoteInput,
    setVehicleNoteInput,
  } = referenceDataState;
  const planningState = usePlanningState(persistedUiState);
  const {
    trips,
    setTrips,
    selectedTripId,
    setSelectedTripId,
    tripDraft,
    setTripDraft,
    isCreatingTrip,
    setIsCreatingTrip,
    validationWarnings,
    setValidationWarnings,
    analysisOutput,
    setAnalysisOutput,
    analysisStatus,
    setAnalysisStatus,
    selectedAnalysisCategories,
    setSelectedAnalysisCategories,
    assistantResponse,
    setAssistantResponse,
    assistantInput,
    setAssistantInput,
    assistantLoading,
    setAssistantLoading,
    planningPageTab,
    setPlanningPageTab,
    planningDetailTab,
    setPlanningDetailTab,
    detailLoading,
    setDetailLoading,
    savingTrip,
    setSavingTrip,
    collectingTripWeather,
    setCollectingTripWeather,
    expectedWeatherEditedSinceLoad,
    setExpectedWeatherEditedSinceLoad,
    sendingAnalysisEmail,
    setSendingAnalysisEmail,
    commaInputs,
    setCommaInputs,
    tripNoteInput,
    setTripNoteInput,
    selectedTripIdRef,
    planningLoadRequestIdRef,
    analysisStatusRef,
    isCreatingTripRef,
  } = planningState;
  const equipmentState = useEquipmentState(persistedUiState);
  const {
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
  } = equipmentState;
  const historyState = useHistoryState(persistedUiState);
  const {
    history,
    setHistory,
    selectedHistoryId,
    setSelectedHistoryId,
    historyPageTab,
    setHistoryPageTab,
    historyDetailTab,
    setHistoryDetailTab,
    savingRetrospective,
    setSavingRetrospective,
    historyLearningInsight,
    setHistoryLearningInsight,
    historyLearningLoading,
    setHistoryLearningLoading,
    historyLearningError,
    setHistoryLearningError,
    userLearningProfile,
    setUserLearningProfile,
    userLearningStatus,
    setUserLearningStatus,
    historyOutput,
    setHistoryOutput,
    historyOutputLoading,
    setHistoryOutputLoading,
    historyOutputError,
    setHistoryOutputError,
    historyEditorResetVersion,
    setHistoryEditorResetVersion,
    retrospectiveResetVersion,
    setRetrospectiveResetVersion,
    historyEditorDraftRef,
    retrospectiveDraftRef,
    selectedHistoryIdRef,
    historyLearningRequestIdRef,
    historyOutputRequestIdRef,
    userLearningStatusRef,
  } = historyState;
  const uiShellState = useUiShellState(persistedUiState);
  const {
    dashboardPageTab,
    setDashboardPageTab,
    helpPageTab,
    setHelpPageTab,
    markdownLayer,
    setMarkdownLayer,
    appLoading,
    setAppLoading,
    creatingDataBackup,
    setCreatingDataBackup,
    stoppingAllAiJobs,
    setStoppingAllAiJobs,
    bannerState,
    setBannerState,
    operationState,
    setOperationState,
    loadError,
    setLoadError,
    aiJobRealtimeMode,
    setAiJobRealtimeMode,
  } = uiShellState;
  const aiJobEventSubscriptionRef = useRef<AiJobEventSubscription | null>(null);
  const aiJobEventReconnectTimeoutRef = useRef<number | null>(null);
  const aiJobEventReconnectAttemptsRef = useRef(0);
  const aiJobEventHasConnectedRef = useRef(false);
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

  useUiStateSyncEffect({
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
  useOperationStateAutoClearEffect(operationState, setOperationState);

  useEffect(() => {
    if (isCreatingTrip || !selectedTripId) {
      if (!isCreatingTrip) {
        setTripDraft(null);
        setExpectedWeatherEditedSinceLoad(false);
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
    setExpectedWeatherEditedSinceLoad(false);
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
        setExpectedWeatherEditedSinceLoad(false);
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
  const {
    activeEquipmentTabId,
    activeEquipmentPanelId,
    activeDashboardPageTabId,
    activeDashboardPagePanelId,
    activeCompanionPageTabId,
    activeCompanionPagePanelId,
    activeVehiclePageTabId,
    activeVehiclePagePanelId,
    activeEquipmentPageTabId,
    activeEquipmentPagePanelId,
    activeCategoryPageTabId,
    activeCategoryPagePanelId,
    activeHelpPageTabId,
    activeHelpPagePanelId,
    activePlanningPageTabId,
    activePlanningPagePanelId,
    activeHistoryPageTabId,
    activeHistoryPagePanelId,
    activeLinkPageTabId,
    activeLinkPagePanelId,
    activePlanningDetailTabId,
    activePlanningDetailPanelId,
    activeHistoryDetailTabId,
    activeHistoryDetailPanelId,
    activeEquipmentDetailTabId,
    activeEquipmentDetailPanelId,
    activeCategoryDetailTabId,
    activeCategoryDetailPanelId,
  } = buildActiveTabTargets({
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
  const selectedTripCompanions = useMemo(
    () => resolveSelectedCompanions(tripDraft?.party?.companion_ids ?? [], companions),
    [companions, tripDraft?.party?.companion_ids],
  );
  const selectedTripVehicle = useMemo(
    () => resolveSelectedVehicle(tripDraft?.vehicle, vehicles),
    [tripDraft?.vehicle, vehicles],
  );
  const selectedTripEmailRecipientIds = useMemo(
    () => tripDraft?.notifications?.email_recipient_companion_ids ?? [],
    [tripDraft?.notifications?.email_recipient_companion_ids],
  );
  const selectedTripEmailRecipients = useMemo(() => {
    const selectedRecipientIdSet = new Set(selectedTripEmailRecipientIds);

    return selectedTripCompanions.filter(
      (companion) =>
        selectedRecipientIdSet.has(companion.id) &&
        typeof companion.email === "string" &&
        companion.email.trim().length > 0,
    );
  }, [selectedTripCompanions, selectedTripEmailRecipientIds]);
  const hasInvalidSelectedTripEmailRecipients = useMemo(() => {
    const selectedCompanionMap = new Map(
      selectedTripCompanions.map((companion) => [companion.id, companion]),
    );

    return selectedTripEmailRecipientIds.some((companionId) => {
      const companion = selectedCompanionMap.get(companionId);
      return !companion || !companion.email?.trim();
    });
  }, [selectedTripCompanions, selectedTripEmailRecipientIds]);
  const isAnalysisReadyForEmail =
    !isAnalysisPending &&
    analysisCategoryStatuses.length > 0 &&
    completedAnalysisCategoryCount === analysisCategoryStatuses.length;
  const canSendAnalysisEmail =
    !isCreatingTrip &&
    !sendingAnalysisEmail &&
    isAnalysisReadyForEmail &&
    selectedTripEmailRecipientIds.length > 0 &&
    !hasInvalidSelectedTripEmailRecipients;
  const canCollectTripWeather =
    !collectingTripWeather && canCollectTripWeatherFromDraft(tripDraft);

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

  useSelectedHistoryLearningEffect({
    selectedHistoryId,
    selectedHistory,
    selectedHistoryIdRef,
    historyLearningRequestIdRef,
    setHistoryLearningInsight,
    setHistoryLearningError,
    setHistoryLearningLoading,
  });
  useSelectedHistoryResetEffect({
    selectedHistoryId,
    selectedHistory,
    selectedHistoryIdRef,
    historyLearningRequestIdRef,
    historyEditorDraftRef,
    retrospectiveDraftRef,
    setRetrospectiveResetVersion,
    setHistoryEditorResetVersion,
    setHistoryLearningInsight,
    setHistoryLearningError,
    setHistoryLearningLoading,
    setHistoryOutput,
    setHistoryOutputError,
    setHistoryOutputLoading,
  });

  useEffect(() => {
    setSelectedAnalysisCategories([...ALL_TRIP_ANALYSIS_CATEGORIES]);
  }, [isCreatingTrip, selectedTripId]);

  useMarkdownLayerResetEffect({
    activePage,
    isCreatingTrip,
    selectedHistoryId,
    selectedTripId,
    setMarkdownLayer,
  });
  useMarkdownLayerBodyLockEffect(markdownLayer, setMarkdownLayer);

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

  useEquipmentCategorySyncEffect({
    equipmentCategories,
    setDurableDraft,
    setConsumableDraft,
    setPrecheckDraft,
  });
  useEquipmentVisibilitySyncEffect({
    equipment,
    equipmentCategories,
    previousEquipmentGroupIdsRef,
    previousCategoryEditorIdsRef,
    previousEquipmentItemIdsRef,
    setCollapsedEquipmentCategories,
    setCollapsedCategoryEditors,
    setExpandedEquipmentItems,
  });

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

  async function handleCollectTripWeather() {
    if (!tripDraft || collectingTripWeather) {
      return;
    }

    await collectTripWeatherIntoDraft({
      setCollectingTripWeather,
      setExpectedWeatherEditedSinceLoad,
      setOperationState,
      setTripDraft,
      tripDraft,
    });
  }

  const {
    beginCreateTrip,
    handleAnalyzeAll,
    handleAnalyzeSelected,
    handleApplyAssistantAction,
    handleArchiveTrip,
    handleAssistantSubmit,
    handleDeleteTrip,
    handleOpenAnalysisLayer,
    handleRefreshAnalysisCategory,
    handleSendAnalysisEmail,
    handleSaveTrip,
    selectTrip,
  } = buildPlanningActions({
    analysisOutput,
    analysisStatusRef,
    assistantInput,
    equipment,
    isAnalysisPending,
    isCreatingTrip,
    loadPlanningOutput,
    maybeAutoRefreshDurableMetadata,
    planningLoadRequestIdRef,
    refreshEquipmentState,
    selectedAnalysisCategories,
    selectedTripId,
    setActivePage,
    setAnalysisOutput,
    setAnalysisStatus,
    setAssistantInput,
    setAssistantLoading,
    setAssistantResponse,
    setCommaInputs,
    setExpectedWeatherEditedSinceLoad,
    setHistory,
    setHistoryDetailTab,
    setHistoryPageTab,
    setIsCreatingTrip,
    setLoadError,
    setMarkdownLayer,
    setOperationState,
    setPlanningPageTab,
    setSavingTrip,
    setSendingAnalysisEmail,
    setSelectedHistoryId,
    setSelectedTripId,
    setTripDraft,
    setTripNoteInput,
    setTrips,
    setValidationWarnings,
    sendingAnalysisEmail,
    tripDraft,
    tripNoteInput,
    expectedWeatherEditedSinceLoad,
    applyAnalysisStatus,
  });

  const {
    beginCreateCompanion,
    beginEditCompanion,
    handleCreateCompanion,
    handleDeleteCompanion,
    handleSaveCompanion,
  } = buildCompanionActions({
    companionDraft,
    companionTextInputs,
    companions,
    editingCompanionId,
    setCompanionDraft,
    setCompanionTextInputs,
    setCompanions,
    setEditingCompanionId,
    setOperationState,
    tripDraft,
    updateTripDraft,
  });

  const {
    beginCreateVehicle,
    beginEditVehicle,
    handleCreateVehicle,
    handleDeleteVehicle,
    handleSaveVehicle,
  } = buildVehicleActions({
    editingVehicleId,
    setEditingVehicleId,
    setOperationState,
    setVehicleDraft,
    setVehicleNoteInput,
    setVehicles,
    tripDraft,
    updateTripDraft,
    vehicleDraft,
    vehicleNoteInput,
  });

  const {
    handleAddRetrospective,
    handleDeleteHistory,
    handleOpenHistoryOutput,
    handleOpenHistoryOutputLayer,
    handleSaveHistory,
  } = buildHistoryActions({
    applyUserLearningStatus,
    historyEditorDraftRef,
    historyOutput,
    historyOutputRequestIdRef,
    retrospectiveDraftRef,
    selectedHistory,
    selectedHistoryIdRef,
    setHistory,
    setHistoryEditorResetVersion,
    setHistoryLearningError,
    setHistoryOutput,
    setHistoryOutputError,
    setHistoryOutputLoading,
    setMarkdownLayer,
    setOperationState,
    setRetrospectiveResetVersion,
    setSavingRetrospective,
    setSelectedHistoryId,
  });

  const { handleCreateLink, handleDeleteLink, handleSaveLink } = buildLinkActions({
    linkDraft,
    setLinkDraft,
    setLinks,
    setOperationState,
  });

  const {
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
  } = buildEquipmentActions({
    categoryDrafts,
    categoryLabelDrafts,
    collapsedEquipmentCategories,
    consumableDraft,
    durableDraft,
    equipment,
    equipmentCategories,
    equipmentCategorySelectionDrafts,
    maybeAutoRefreshDurableMetadata,
    precheckDraft,
    previousEquipmentGroupIdsRef,
    refreshDurableMetadata,
    refreshEquipmentState,
    setCategoryDrafts,
    setCategoryLabelDrafts,
    setCollapsedCategoryEditors,
    setCollapsedEquipmentCategories,
    setConsumableDraft,
    setDurableDraft,
    setEquipmentCategories,
    setEquipmentCategorySelectionDrafts,
    setEquipmentSection,
    setExpandedCategorySections,
    setExpandedEquipmentItems,
    setOperationState,
    setPrecheckDraft,
  });

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
    ...referenceDataState,
    ...planningState,
    ...equipmentState,
    ...historyState,
    ...uiShellState,
    analysisCategoryStatuses,
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
    canCollectTripWeather,
    canSendAnalysisEmail,
    clearAnalysisCategorySelection,
    collectingTripWeather,
    completedAnalysisCategoryCount,
    dashboardAlerts,
    dashboardMetrics,
    equipmentMetrics,
    expandedCategorySectionCount,
    formatCompactTripId,
    formatRelativeDate,
    getTripAnalysisStatusLabel,
    handleAddRetrospective,
    handleAnalyzeAll,
    handleAnalyzeSelected,
    handleApplyAssistantAction,
    handleArchiveTrip,
    handleAssistantSubmit,
    handleCollectTripWeather,
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
    handleSendAnalysisEmail,
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
    isAnalysisPending,
    isAnalysisReadyForEmail,
    isPendingAnalysisStatus,
    isUserLearningPending,
    linkGroups,
    missingCompanionIds,
    parseInteger,
    parseNumber,
    refreshingDurableMetadataIds,
    resolveHistoryVehicleSnapshot: (item: HistoryRecord) =>
      resolveHistoryVehicleSnapshot(item, vehicles),
    selectedHistory,
    selectedHistoryCompanionSnapshots,
    selectedHistoryRetrospectives,
    selectedHistoryVehicle,
    selectedTripEmailRecipientIds,
    selectedTripEmailRecipients,
    selectedTripCompanions,
    selectedTripSummary,
    selectedTripVehicle,
    sendingAnalysisEmail,
    selectAllAnalysisCategories,
    selectTrip,
    setActivePage,
    splitCommaList,
    toggleAnalysisCategorySelection,
    toggleSelectionId,
    updateTripDraft,
  };
}

export type AppViewModel = ReturnType<typeof useAppViewModel>;
