import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement,
  ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import type {
  AnalyzeTripResponse,
  Companion,
  ConsumableEquipmentItem,
  ConsumableEquipmentItemInput,
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
  HistoryRecord,
  PlanningAssistantAction,
  PlanningAssistantResponse,
  PrecheckItem,
  PrecheckItemInput,
  TripDraft,
  TripSummary,
  Vehicle,
  VehicleInput,
} from "@camping/shared";
import {
  AGE_GROUP_LABELS,
  CONSUMABLE_STATUS_LABELS,
  DURABLE_METADATA_STATUS_LABELS,
  DURABLE_STATUS_LABELS,
  EQUIPMENT_CATEGORY_CODE_REQUIRED_MESSAGE,
  EQUIPMENT_SECTION_LABELS,
  EXTERNAL_LINK_CATEGORY_LABELS,
  PRECHECK_STATUS_LABELS,
} from "@camping/shared";
import { cloneEquipmentCategories } from "@camping/shared";
import { apiClient, ApiClientError } from "./api/client";
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
const UI_STATE_STORAGE_KEY = "camping.ui-state";

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

type PersistedUiState = {
  activePage: PageKey;
  selectedTripId: string | null;
  selectedHistoryId: string | null;
  equipmentSection: EquipmentSection;
};

type CategoryDrafts = Record<EquipmentSection, EquipmentCategoryCreateInput>;
type CategoryLabelDrafts = Record<EquipmentSection, Record<string, string>>;
type SectionTrackedIds = Record<EquipmentSection, string[]>;

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
  const [analysisResponse, setAnalysisResponse] =
    useState<AnalyzeTripResponse | null>(null);
  const [assistantResponse, setAssistantResponse] =
    useState<PlanningAssistantResponse | null>(null);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [equipment, setEquipment] = useState<EquipmentCatalog | null>(null);
  const [equipmentCategories, setEquipmentCategories] =
    useState<EquipmentCategoriesData>(cloneEquipmentCategories());
  const [equipmentSection, setEquipmentSection] =
    useState<EquipmentSection>(persistedUiState?.equipmentSection ?? "durable");
  const [collapsedEquipmentCategories, setCollapsedEquipmentCategories] =
    useState<SectionTrackedIds>(createEmptySectionTrackedIds());
  const [expandedEquipmentItems, setExpandedEquipmentItems] =
    useState<SectionTrackedIds>(createEmptySectionTrackedIds());
  const [refreshingDurableMetadataIds, setRefreshingDurableMetadataIds] =
    useState<string[]>([]);
  const [categoryDrafts, setCategoryDrafts] =
    useState<CategoryDrafts>(createEmptyCategoryDrafts());
  const [categoryLabelDrafts, setCategoryLabelDrafts] =
    useState<CategoryLabelDrafts>(createEmptyCategoryLabelDrafts());
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
    persistedUiState?.selectedHistoryId ?? null,
  );
  const [historyOutput, setHistoryOutput] = useState<GetOutputResponse | null>(null);
  const [historyOutputLoading, setHistoryOutputLoading] = useState(false);
  const [historyOutputError, setHistoryOutputError] = useState<string | null>(null);
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [bannerState, setBannerState] = useState<OperationState | null>(null);
  const [operationState, setOperationState] = useState<OperationState | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commaInputs, setCommaInputs] = useState<CommaSeparatedInputs>(
    createCommaSeparatedInputs(),
  );
  const selectedHistoryIdRef = useRef<string | null>(null);
  const historyOutputRequestIdRef = useRef(0);
  const planningOutputRequestIdRef = useRef(0);
  const durableSearchFingerprintRef = useRef<Record<string, string>>({});

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    writePersistedUiState({
      activePage,
      selectedTripId,
      selectedHistoryId,
      equipmentSection,
    });
  }, [activePage, equipmentSection, selectedHistoryId, selectedTripId]);

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
    if (isCreatingTrip || !selectedTripId) {
      if (!isCreatingTrip) {
        setTripDraft(null);
        setValidationWarnings([]);
        setCommaInputs(createCommaSeparatedInputs());
        setAnalysisResponse(null);
        setAnalyzing(false);
        planningOutputRequestIdRef.current += 1;
      }
      return;
    }

    let active = true;
    const requestId = planningOutputRequestIdRef.current + 1;

    planningOutputRequestIdRef.current = requestId;
    setDetailLoading(true);
    setLoadError(null);
    setTripDraft(null);
    setValidationWarnings([]);
    setCommaInputs(createCommaSeparatedInputs());
    setAnalysisResponse(null);
    setAssistantResponse(null);
    setAnalyzing(false);

    void Promise.allSettled([
      apiClient.getTrip(selectedTripId),
      apiClient.validateTrip(selectedTripId),
    ])
      .then(([tripResult, validationResult]) => {
        if (!active) return;

        if (tripResult.status === "rejected") {
          setTripDraft(null);
          setValidationWarnings([]);
          setAnalysisResponse(null);
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

        if (planningOutputRequestIdRef.current !== requestId) {
          return;
        }

        void apiClient
          .getOutput(selectedTripId)
          .then((response) => {
            if (!active || planningOutputRequestIdRef.current !== requestId) {
              return;
            }

            setAnalysisResponse({
              trip_id: response.trip_id,
              status: "completed",
              warnings: [],
              markdown: response.markdown,
              output_path: response.output_path,
            });
          })
          .catch(() => {
            if (!active || planningOutputRequestIdRef.current !== requestId) {
              return;
            }
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
  const activeEquipmentTabId = getEquipmentSectionTabId(equipmentSection);
  const activeEquipmentPanelId = getEquipmentSectionPanelId(equipmentSection);
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
    selectedHistoryIdRef.current = selectedHistoryId;
    setHistoryOutput(null);
    setHistoryOutputError(null);
    setHistoryOutputLoading(false);
  }, [selectedHistoryId]);

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
        (item) =>
          item.status === "low" ||
          item.status === "empty" ||
          item.quantity_on_hand <= (item.low_stock_threshold ?? 0),
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
  const activePageLead = {
    dashboard: "예정 계획과 점검 경고를 먼저 훑고 다음 작업으로 바로 이동하는 운영 허브입니다.",
    planning: "trip 원본 입력, AI 보조, 최종 분석 결과를 단계별로 다루는 핵심 작업 화면입니다.",
    history: "완료된 계획과 저장된 결과 Markdown을 다시 열어보는 기록 보관 화면입니다.",
    companions: "캠핑 인원 프로필을 미리 정리하고 계획 화면에서는 선택만 하도록 분리한 화면입니다.",
    vehicles: "차량 정보를 미리 관리해 캠핑 계획에서는 차량 선택과 요약 확인만 하도록 정리한 화면입니다.",
    equipment: "보유 장비, 소모품, 출발 전 점검을 읽기 쉬운 목록으로 정리하는 화면입니다.",
    links: "날씨, 장소, 맛집 같은 참고 링크를 카테고리별로 정리하는 화면입니다.",
    categories: "장비 카테고리 기준을 정리하고 운영용 백업을 실행하는 화면입니다.",
    help: "주 작업 파일과 생성 결과처럼 운영 중 참고할 보조 설명만 따로 모아 둔 화면입니다.",
  } satisfies Record<PageKey, string>;

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
        historyResponse,
        linkResponse,
      ] = await Promise.allSettled([
        apiClient.getCompanions(),
        apiClient.getVehicles(),
        apiClient.getTrips(),
        apiClient.getEquipment(),
        apiClient.getEquipmentCategories(),
        apiClient.getHistory(),
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
      setEquipmentCategories(
        equipmentCategoryResponse.status === "fulfilled"
          ? equipmentCategoryResponse.value
          : cloneEquipmentCategories(),
      );
      setCategoryLabelDrafts(createEmptyCategoryLabelDrafts());
      setHistory(historyResponse.value.items);
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

  async function refreshEquipmentState() {
    const [catalogResponse, categoriesResponse] = await Promise.allSettled([
      apiClient.getEquipment(),
      apiClient.getEquipmentCategories(),
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

    return warnings;
  }

  function setDurableMetadataRefreshing(itemId: string, refreshing: boolean) {
    setRefreshingDurableMetadataIds((current) =>
      refreshing
        ? current.includes(itemId)
          ? current
          : [...current, itemId]
        : current.filter((candidate) => candidate !== itemId),
    );
  }

  async function refreshDurableMetadata(
    itemId: string,
    options: { manual: boolean },
  ) {
    setDurableMetadataRefreshing(itemId, true);

    try {
      const response = await apiClient.refreshDurableEquipmentMetadata(itemId);
      durableSearchFingerprintRef.current = {
        ...durableSearchFingerprintRef.current,
        [itemId]: buildDurableMetadataFingerprint(response.item),
      };
      setEquipment((current) =>
        current
          ? {
              ...current,
              durable: {
                ...current.durable,
                items: current.durable.items.map((item) =>
                  item.id === itemId ? response.item : item,
                ),
              },
            }
          : current,
      );

      return { warning: null as string | null };
    } catch (error) {
      const warning = `장비 메타데이터 수집 실패: ${getErrorMessage(error)}`;

      if (options.manual) {
        throw error;
      }

      return { warning };
    } finally {
      setDurableMetadataRefreshing(itemId, false);
    }
  }

  async function maybeAutoRefreshDurableMetadata(item: DurableEquipmentItem) {
    const savedFingerprint = durableSearchFingerprintRef.current[item.id];

    if (
      savedFingerprint === buildDurableMetadataFingerprint(item) &&
      item.metadata
    ) {
      return null;
    }

    const result = await refreshDurableMetadata(item.id, { manual: false });
    return result.warning;
  }

  function beginCreateTrip() {
    const nextDraft = createEmptyTripDraft();

    setActivePage("planning");
    setIsCreatingTrip(true);
    setSelectedTripId(null);
    setTripDraft(nextDraft);
    setCommaInputs(createCommaSeparatedInputs(nextDraft));
    setValidationWarnings([]);
    setAnalysisResponse(null);
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

      try {
        const validation = await apiClient.validateTrip(response.trip_id);
        setValidationWarnings(validation.warnings);
        setOperationState({
          title: "캠핑 계획 저장 완료",
          tone: validation.warnings.length > 0 ? "warning" : "success",
          description:
            validation.warnings.length > 0
              ? `${savedDescription} 검증 경고를 확인하세요.`
              : savedDescription,
        });
      } catch (error) {
        setValidationWarnings(toValidationWarnings(error));
        setOperationState({
          title: "캠핑 계획 저장 완료",
          tone: "warning",
          description: `${savedDescription} 검증 경고를 확인하세요.`,
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
      setAnalysisResponse(null);
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
      setAnalysisResponse(null);
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

  async function handleAnalyze() {
    if (!selectedTripId) return;

    const requestId = planningOutputRequestIdRef.current + 1;

    planningOutputRequestIdRef.current = requestId;
    setAnalyzing(true);
    setOperationState(null);

    try {
      const response = await apiClient.analyzeTrip({
        trip_id: selectedTripId,
        save_output: true,
      });

      if (planningOutputRequestIdRef.current !== requestId) {
        return;
      }

      setAnalysisResponse(response);

      if (response.output_path) {
        setOperationState({
          title: "분석 저장 완료",
          tone: "success",
          description: response.output_path,
        });
      }
    } catch (error) {
      if (planningOutputRequestIdRef.current !== requestId) {
        return;
      }

      setOperationState({
        title: "분석 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      if (planningOutputRequestIdRef.current === requestId) {
        setAnalyzing(false);
      }
    }
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
          await apiClient.createEquipmentItem("durable", payload);
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

      const syncWarnings = await refreshEquipmentState();
      setOperationState({
        title: "AI 제안 반영 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(action.title, syncWarnings),
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

      if (section === "durable") {
        const response = await apiClient.createEquipmentItem(section, durableDraft);
        const metadataWarning = await maybeAutoRefreshDurableMetadata(
          response.item as DurableEquipmentItem,
        );
        if (metadataWarning) {
          additionalWarnings.push(metadataWarning);
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
          `${section} 섹션에 새 항목을 추가했습니다.`,
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

      if (section === "durable") {
        const item = equipment.durable.items.find((candidate) => candidate.id === itemId);
        if (item) {
          await apiClient.updateEquipmentItem(section, itemId, toDurableEquipmentInput(item));
          const metadataWarning = await maybeAutoRefreshDurableMetadata(item);
          if (metadataWarning) {
            additionalWarnings.push(metadataWarning);
          }
        }
      }

      if (section === "consumables") {
        const item = equipment.consumables.items.find(
          (candidate) => candidate.id === itemId,
        );
        if (item) {
          await apiClient.updateEquipmentItem(section, itemId, item);
        }
      }

      if (section === "precheck") {
        const item = equipment.precheck.items.find(
          (candidate) => candidate.id === itemId,
        );
        if (item) {
          await apiClient.updateEquipmentItem(section, itemId, item);
        }
      }

      const syncWarnings = [
        ...(await refreshEquipmentState()),
        ...additionalWarnings,
      ];
      setOperationState({
        title: "장비 저장 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(itemId, syncWarnings),
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

    try {
      if (currentItem) {
        await apiClient.updateEquipmentItem(
          "durable",
          itemId,
          toDurableEquipmentInput(currentItem),
        );
      }

      await refreshDurableMetadata(itemId, { manual: true });
      const syncWarnings = await refreshEquipmentState();
      setOperationState({
        title: "장비 메타데이터 재수집 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(itemId, syncWarnings),
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
    setEquipment((current) => {
      if (!current) {
        return current;
      }

      if (section === "durable") {
        return {
          ...current,
          durable: {
            ...current.durable,
            items: current.durable.items.map((item) =>
              item.id === itemId ? { ...item, category: categoryId } : item,
            ),
          },
        };
      }

      if (section === "consumables") {
        return {
          ...current,
          consumables: {
            ...current.consumables,
            items: current.consumables.items.map((item) =>
              item.id === itemId ? { ...item, category: categoryId } : item,
            ),
          },
        };
      }

      return {
        ...current,
        precheck: {
          ...current.precheck,
          items: current.precheck.items.map((item) =>
            item.id === itemId ? { ...item, category: categoryId } : item,
          ),
        },
      };
    });
    setCollapsedEquipmentCategories((current) =>
      removeSectionTrackedId(current, section, categoryId),
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

  function renderNavButton(
    page: PageKey,
    description: string,
    meta: string,
  ) {
    const isActive = activePage === page;

    return (
      <button
        aria-current={isActive ? "page" : undefined}
        aria-label={PAGE_LABELS[page]}
        className={navButtonClass(isActive)}
        onClick={() => setActivePage(page)}
        type="button"
      >
        <span className="nav-button__title">{PAGE_LABELS[page]}</span>
        <span className="nav-button__description">{description}</span>
        <span aria-hidden="true" className="nav-button__meta">
          {meta}
        </span>
      </button>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero hero--global">
        <div className="hero__copy">
          <div className="hero__eyebrow">Camp Console</div>
          <h1>캠핑 운영 콘솔</h1>
          <p>{activePageLead[activePage]}</p>
          <div className="hero__tags" aria-label="현재 앱 요약">
            <span className="hero-tag">현재 메뉴 {PAGE_LABELS[activePage]}</span>
            <span className="hero-tag">선택 계획 {currentTripLabel}</span>
            <span className="hero-tag">예정 {dashboardMetrics.trips}건</span>
            <span className="hero-tag">경고 {dashboardMetrics.alerts}건</span>
          </div>
        </div>
        <div className="hero__meta-grid">
          <article className="hero__meta">
            <div className="hero__meta-label">현재 초점</div>
            <strong>{PAGE_LABELS[activePage]}</strong>
            <span>계획 {currentTripLabel}</span>
            <span>히스토리 {currentHistoryLabel}</span>
          </article>
          <article className="hero__meta">
            <div className="hero__meta-label">현재 계획 기준</div>
            <strong>{selectedTripCompanions.length}명 선택</strong>
            <span>차량 {selectedTripVehicle?.name ?? "미선택"}</span>
            <span>검증 경고 {validationWarnings.length}건</span>
          </article>
        </div>
      </header>

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
                  <span className="nav-section__title">{group.title}</span>
                  <span className="nav-section__copy">{group.description}</span>
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
                          analysisResponse?.output_path ? "연결됨" : "대기"
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
                <div className="page-intro__meta">
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

              <section className="dashboard-grid">
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

                <section className="panel">
                  <div className="panel__eyebrow">예정 계획</div>
                  <div className="panel__header">
                    <h2>곧 실행할 계획</h2>
                  </div>
                  {trips.length === 0 ? (
                    <div className="empty-state">아직 등록된 캠핑 계획이 없습니다.</div>
                  ) : (
                    <div className="stack-list">
                      {trips.slice(0, 4).map((trip) => (
                        <button
                          key={trip.trip_id}
                          className="list-card"
                          onClick={() => selectTrip(trip.trip_id)}
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
                  <div className="panel__eyebrow">최근 기록</div>
                  <div className="panel__header">
                    <h2>최근 히스토리</h2>
                  </div>
                  {history.length === 0 ? (
                    <div className="empty-state">아직 아카이브된 캠핑 히스토리가 없습니다.</div>
                  ) : (
                    <div className="stack-list">
                      {history.slice(0, 4).map((item) => (
                        <button
                          key={item.history_id}
                          className="list-card"
                          onClick={() => {
                            setActivePage("history");
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

              <section className="page-grid page-grid--two">
                <section className="panel">
                  <div className="panel__eyebrow">인원 목록</div>
                  <div className="panel__header">
                    <h2>등록된 사람</h2>
                    <span className="pill">{companions.length}명</span>
                  </div>
                  <div className="stack-list">
                    <button className="button" onClick={() => beginCreateCompanion()} type="button">
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
                          onClick={() => beginEditCompanion(companion)}
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

              <section className="page-grid page-grid--two">
                <section className="panel">
                  <div className="panel__eyebrow">차량 목록</div>
                  <div className="panel__header">
                    <h2>등록된 차량</h2>
                    <span className="pill">{vehicles.length}대</span>
                  </div>
                  <div className="stack-list">
                    <button className="button" onClick={beginCreateVehicle} type="button">
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
                          onClick={() => beginEditVehicle(vehicle)}
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

              <section
                aria-labelledby={activeEquipmentTabId}
                className="equipment-tab-panel equipment-workspace"
                id={activeEquipmentPanelId}
                role="tabpanel"
              >
                <section className="panel">
                  <div className="panel__eyebrow">목록</div>
                  <div className="panel__header">
                    <h2>{`${currentEquipmentSectionLabel} 목록`}</h2>
                  </div>

                  {equipmentSection === "durable" ? (
                    <EquipmentList
                      section="durable"
                      categories={equipmentCategories.durable}
                      collapsedCategoryIds={collapsedEquipmentCategories.durable}
                      expandedItemIds={expandedEquipmentItems.durable}
                      items={equipment?.durable.items ?? []}
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

                <div className="equipment-side-stack">
                  <section className="panel">
                    <div className="panel__eyebrow">현재 섹션</div>
                    <div className="panel__header">
                      <h2>{currentEquipmentSectionLabel} 작업 요약</h2>
                    </div>
                    <p className="panel__copy">
                      현재 섹션의 카테고리 수는 {currentEquipmentCategories.length}개이며,
                      선택한 항목을 펼쳐 수정한 뒤 오른쪽 입력 카드에서 새 항목을 바로
                      추가할 수 있습니다.
                    </p>
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
                  </section>

                  <section className="panel">
                    <div className="panel__eyebrow">항목 추가</div>
                    <div className="panel__header">
                      <h2>{`${currentEquipmentSectionLabel} 추가`}</h2>
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
                        <FormField label="상태">
                          <select
                            value={consumableDraft.status}
                            onChange={(event) =>
                              setConsumableDraft((current) => ({
                                ...current,
                                status: event.target.value as ConsumableEquipmentItem["status"],
                              }))
                            }
                          >
                            {Object.entries(CONSUMABLE_STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
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
                  </section>
                </div>
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
                    <span>현재 섹션</span>
                    <strong>{currentEquipmentSectionLabel}</strong>
                  </div>
                  <div className="meta-chip">
                    <span>카테고리 수</span>
                    <strong>{currentEquipmentCategories.length}개</strong>
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

              <section className="page-grid page-grid--categories">
                <section className="panel">
                  <div className="panel__eyebrow">카테고리</div>
                  <div className="panel__header">
                    <h2>장비 카테고리 관리</h2>
                    <span className="pill">{currentEquipmentCategories.length}개</span>
                  </div>
                  <p className="panel__copy">
                    장비 화면에서는 여기서 정한 카테고리만 선택합니다. 카테고리 코드는 내부
                    식별값으로 유지하고, 표시 이름만 사용자 문맥에 맞게 조정합니다.
                  </p>
                  <div className="segmented-row">
                    <button
                      className={segmentClass(equipmentSection === "durable")}
                      onClick={() => setEquipmentSection("durable")}
                      type="button"
                    >
                      반복 장비
                    </button>
                    <button
                      className={segmentClass(equipmentSection === "consumables")}
                      onClick={() => setEquipmentSection("consumables")}
                      type="button"
                    >
                      소모품
                    </button>
                    <button
                      className={segmentClass(equipmentSection === "precheck")}
                      onClick={() => setEquipmentSection("precheck")}
                      type="button"
                    >
                      출발 전 점검
                    </button>
                  </div>
                  {currentEquipmentCategories.length === 0 ? (
                    <div className="empty-state">이 섹션에 등록된 카테고리가 없습니다.</div>
                  ) : (
                    <div className="stack-list">
                      {currentEquipmentCategories.map((category) => (
                        <article className="edit-card" key={category.id}>
                          <div className="panel__header">
                            <h3>
                              {categoryLabelDrafts[equipmentSection][category.id] ??
                                category.label}
                            </h3>
                            <code>{category.id}</code>
                          </div>
                          <div className="form-grid">
                            <FormField label="표시 이름">
                              <input
                                placeholder="카테고리 표시 이름"
                                value={
                                  categoryLabelDrafts[equipmentSection][category.id] ??
                                  category.label
                                }
                                onChange={(event) =>
                                  setCategoryLabelDrafts((current) => ({
                                    ...current,
                                    [equipmentSection]: {
                                      ...current[equipmentSection],
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
                                  equipmentSection,
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
                                  equipmentSection,
                                  category.id,
                                )
                              }
                              type="button"
                            >
                              삭제
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <div className="stack-list categories-side-stack">
                  <section className="panel">
                    <div className="panel__eyebrow">로컬 백업</div>
                    <div className="panel__header">
                      <h2>로컬 운영 데이터 백업</h2>
                    </div>
                    <p className="panel__copy">
                      현재 camping-data 폴더 상태를 camping-backups 아래에 시점별로 수동
                      백업합니다. 큰 수정 전에 현재 상태를 남길 때 사용합니다.
                    </p>
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
                  </section>

                  <section className="panel">
                    <div className="panel__eyebrow">관리 원칙</div>
                    <div className="panel__header">
                      <h2>관리 원칙</h2>
                    </div>
                    <ul className="detail-list">
                      <li>표시 이름은 사용자가 보는 라벨입니다.</li>
                      <li>카테고리 코드는 영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 허용됩니다.</li>
                      <li>이미 사용 중이거나 마지막 남은 카테고리는 삭제가 제한됩니다.</li>
                    </ul>
                  </section>

                  <section className="panel">
                    <div className="panel__eyebrow">새 카테고리</div>
                    <div className="panel__header">
                      <h2>새 카테고리 추가</h2>
                    </div>
                    <p className="panel__copy">
                      카테고리 코드는 자동 생성하지 않습니다. 영문 소문자, 숫자,
                      하이픈(-), 밑줄(_) 형식으로 직접 입력합니다.
                    </p>
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
                  </section>
                </div>
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
                <div className="page-intro__meta">
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
                    <strong>{analysisResponse?.output_path ?? "분석 실행 후 생성"}</strong>
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

              <section className="page-grid page-grid--two">
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
                        {analysisResponse?.output_path ?? "분석 실행 후 생성"}
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

                <div className="stack-list">
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

              <section className="page-grid page-grid--planning">
                <section className="panel">
                <div className="panel__eyebrow">계획 목록</div>
                <div className="panel__header">
                  <h2>캠핑 계획 목록</h2>
                  <span className="pill">{trips.length}건</span>
                </div>
                <div className="stack-list">
                  <button className="button" onClick={beginCreateTrip} type="button">
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
                      onClick={() => selectTrip(trip.trip_id)}
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
                          <button className="button" onClick={handleArchiveTrip} type="button">
                            히스토리로 이동
                          </button>
                        ) : null}
                        {!isCreatingTrip ? (
                          <button className="button" onClick={handleDeleteTrip} type="button">
                            계획 삭제
                          </button>
                        ) : null}
                        {!isCreatingTrip ? (
                          <button
                            className="button button--primary"
                            disabled={analyzing}
                            onClick={handleAnalyze}
                            type="button"
                          >
                            {analyzing ? "분석 중..." : "분석 실행"}
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

                <div className="planning-side-stack">
                  <section className="panel">
                    <div className="panel__eyebrow">AI 보조</div>
                    <div className="panel__header">
                      <h2>AI 보조</h2>
                    </div>
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
                  </section>

                  <section className="panel">
                    <div className="panel__eyebrow">분석 결과</div>
                    <div className="panel__header">
                      <h2>분석 결과</h2>
                    </div>
                    <div className="action-card action-card--soft">
                      <strong>분석 결과는 최종 정리할 때 확인</strong>
                      <p>
                        계획과 장비 점검이 끝난 뒤 분석을 실행하면 준비물, 체크리스트,
                        식단, 이동 추천, 다음 캠핑 추천이 Markdown으로 정리됩니다.
                      </p>
                    </div>

                    {selectedTripId ? (
                      <>
                        <div className="section-label section-label--analysis">
                          <strong>분석 결과</strong>
                          <p>
                            입력과 점검이 끝났다면 분석 실행을 눌러 이번 캠핑의 최종
                            정리본을 확인합니다.
                          </p>
                        </div>

                        {analysisResponse?.error?.code === "OUTPUT_SAVE_FAILED" ? (
                          <StatusBanner
                            tone="warning"
                            title="결과 생성 완료, 저장 실패"
                            description={analysisResponse.error.message}
                          />
                        ) : null}

                        {analysisResponse?.markdown ? (
                          <article className="markdown-pane">
                            <ReactMarkdown>{analysisResponse.markdown}</ReactMarkdown>
                          </article>
                        ) : (
                          <div className="empty-state">
                            계획 저장 후 분석 실행을 누르면 추천 장비, 개인 준비물, 출발 전
                            체크리스트, 식단, 이동/주변 추천, 다음 캠핑 추천 결과가 여기에
                            표시됩니다.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="empty-state">
                        분석은 저장된 계획에서만 실행할 수 있습니다.
                      </div>
                    )}
                  </section>
                </div>
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
                </div>
              </section>

              <section className="page-grid page-grid--two">
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
                        onClick={() => setSelectedHistoryId(item.history_id)}
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

              <section className="panel">
                <div className="panel__eyebrow">기록 상세</div>
                <div className="panel__header">
                  <h2>히스토리 상세</h2>
                </div>
                {selectedHistory ? (
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
                    <div className="form-grid__full summary-grid summary-grid--compact">
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
                    </div>
                    <div className="form-grid__full history-output-card">
                      <div className="history-output-card__header">
                        <div>
                          <strong>저장된 분석 결과</strong>
                          <p>
                            {selectedHistory.output_path
                              ? "아카이브 당시 저장된 Markdown 결과를 다시 열 수 있습니다."
                              : "이 히스토리에는 저장된 분석 결과 경로가 없습니다."}
                          </p>
                        </div>
                        <button
                          className="button"
                          disabled={!selectedHistory.output_path || historyOutputLoading}
                          onClick={handleOpenHistoryOutput}
                          type="button"
                        >
                          {historyOutputLoading ? "불러오는 중..." : "결과 열기"}
                        </button>
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
                    </div>
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
                  </div>
                ) : (
                  <div className="empty-state">왼쪽에서 히스토리를 선택하세요.</div>
                )}
                </section>
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
                <div className="page-intro__meta">
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

              <section className="page-grid page-grid--two">
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
              </section>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function navButtonClass(active: boolean) {
  return `nav-button${active ? " nav-button--active" : ""}`;
}

function segmentClass(active: boolean) {
  return `segment-button${active ? " segment-button--active" : ""}`;
}

function equipmentTabClass(active: boolean) {
  return `equipment-tab${active ? " equipment-tab--active" : ""}`;
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
    status: "ok",
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
                <strong>{group.categoryLabel}</strong>
                <span>{group.items.length}개 항목</span>
              </span>
              <span className="equipment-category-toggle__state">
                {isCollapsed ? "펼치기" : "접기"}
              </span>
            </button>

            {!isCollapsed ? (
              <div className="equipment-item-list" id={categoryPanelId}>
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
                        <strong>{item.name}</strong>
                        <span className="equipment-item-summary__meta">
                          {summary.quantity ? (
                            <span className="equipment-item-summary__badge">
                              {summary.quantity}
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
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function EquipmentList(props: {
  section: EquipmentSection;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: DurableEquipmentItem[];
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
                value={item.category}
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
          <DurableMetadataSection metadata={item.metadata} />
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
        quantity: `수량 ${item.quantity}`,
        status: getStatusLabel(DURABLE_STATUS_LABELS, item.status),
      })}
      section={props.section}
    />
  );
}

function DurableMetadataSection(props: {
  metadata?: DurableEquipmentMetadata;
}) {
  const metadata = props.metadata;

  if (!metadata) {
    return (
      <section className="metadata-card">
        <div className="metadata-card__header">
          <strong>장비 메타데이터</strong>
          <span className="equipment-item-summary__badge">미수집</span>
        </div>
        <p className="metadata-card__copy">
          아직 수집된 메타데이터가 없습니다. 저장 후 자동 수집되거나 수동으로 재수집할 수 있습니다.
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
        <span className="equipment-item-summary__badge">
          {DURABLE_METADATA_STATUS_LABELS[metadata.lookup_status]}
        </span>
      </div>
      <p className="metadata-card__copy">
        마지막 수집: {formatRelativeDate(metadata.searched_at)} / 검색 질의: {metadata.query}
      </p>
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
                value={item.category}
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
            <FormField label="상태">
              <select
                value={item.status}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    status: event.target.value as ConsumableEquipmentItem["status"],
                  }))
                }
              >
                {Object.entries(CONSUMABLE_STATUS_LABELS).map(([value, label]) => (
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
      renderSummaryMeta={(item: ConsumableEquipmentItem) => ({
        quantity: `수량 ${item.quantity_on_hand}${item.unit ? ` ${item.unit}` : ""}`,
        status: getStatusLabel(CONSUMABLE_STATUS_LABELS, item.status),
      })}
      section={props.section}
    />
  );
}

function PrecheckList(props: {
  section: EquipmentSection;
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
                value={item.category}
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

function buildDashboardAlerts(catalog: EquipmentCatalog | null) {
  if (!catalog) {
    return [];
  }

  const consumableAlerts = catalog.consumables.items
    .filter(
      (item) =>
        item.status === "low" ||
        item.status === "empty" ||
        item.quantity_on_hand <= (item.low_stock_threshold ?? -1),
    )
    .map(
      (item) =>
        `${item.name} ${item.quantity_on_hand}${item.unit ? ` ${item.unit}` : ""} / ${getStatusLabel(
          CONSUMABLE_STATUS_LABELS,
          item.status,
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
