import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type {
  AnalyzeTripResponse,
  Companion,
  ConsumableEquipmentItem,
  ConsumableEquipmentItemInput,
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
} from "@camping/shared";
import {
  AGE_GROUP_LABELS,
  CONSUMABLE_STATUS_LABELS,
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
  | "equipment"
  | "planning"
  | "history"
  | "links"
  | "management";

const PAGE_KEYS: PageKey[] = [
  "dashboard",
  "equipment",
  "planning",
  "history",
  "links",
  "management",
];
const UI_STATE_STORAGE_KEY = "camping.ui-state";

type OperationState = {
  title: string;
  tone: "success" | "warning" | "error";
  description: string;
  items?: string[];
};

type CommaSeparatedInputs = {
  companionIds: string;
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

export function App() {
  const [persistedUiState] = useState(() => readPersistedUiState());
  const [activePage, setActivePage] = useState<PageKey>(
    persistedUiState?.activePage ?? "dashboard",
  );
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [companionDraft, setCompanionDraft] =
    useState<Companion>(createEmptyCompanion());
  const [editingCompanionId, setEditingCompanionId] = useState<string | null>(null);
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

  const missingCompanionIds = useMemo(
    () =>
      getMissingCompanionIds(
        tripDraft?.party?.companion_ids ?? [],
        companions.map((item) => item.id),
      ),
    [companions, tripDraft?.party?.companion_ids],
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

  const tripCountLabel = useMemo(() => {
    if (isCreatingTrip) {
      return "새 캠핑 계획 작성 중";
    }

    if (!tripDraft) {
      return "등록된 캠핑 계획을 선택하거나 새로 만들 수 있습니다.";
    }

    return `${tripDraft.title.trim() || "새 캠핑 계획"} / ${
      selectedTripId ?? "저장 전 초안"
    } / 동행 ${tripDraft.party?.companion_ids.length ?? 0}명`;
  }, [isCreatingTrip, selectedTripId, tripDraft]);

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
      alerts: lowStockCount,
      links: links.length,
    };
  }, [equipment, history.length, links.length, trips.length]);

  async function loadInitialData() {
    setAppLoading(true);
    setLoadError(null);

    try {
      const [
        companionResponse,
        tripResponse,
        equipmentResponse,
        equipmentCategoryResponse,
        historyResponse,
        linkResponse,
      ] = await Promise.allSettled([
        apiClient.getCompanions(),
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

  async function ensureCompanionProfiles(companionIds: string[]) {
    const missingIds = getMissingCompanionIds(
      companionIds,
      companions.map((item) => item.id),
    );

    if (missingIds.length === 0) {
      return [];
    }

    const createdIds: string[] = [];

    for (const companionId of missingIds) {
      try {
        await apiClient.createCompanion(createPlaceholderCompanion(companionId));
        createdIds.push(companionId);
      } catch (error) {
        if (error instanceof ApiClientError && error.code === "CONFLICT") {
          continue;
        }

        throw error;
      }
    }

    const response = await apiClient.getCompanions();
    setCompanions(response.items);

    return createdIds;
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

  async function handleSaveTrip() {
    if (!tripDraft) return;

    setSavingTrip(true);
    setOperationState(null);

    try {
      const response = isCreatingTrip
        ? await apiClient.createTrip(tripDraft)
        : await apiClient.updateTrip(selectedTripId ?? tripDraft.trip_id ?? "", tripDraft);
      let autoCreatedCompanions: string[] = [];
      let companionProfileError: string | null = null;

      try {
        autoCreatedCompanions = await ensureCompanionProfiles(
          response.data.party.companion_ids,
        );
      } catch (error) {
        companionProfileError = getErrorMessage(error);
      }

      const tripList = await apiClient.getTrips();
      setTrips(tripList.items);
      setSelectedTripId(response.trip_id);
      setIsCreatingTrip(false);
      setTripDraft(response.data);
      setCommaInputs(createCommaSeparatedInputs(response.data));
      const savedDescription = `${response.data.title} 계획을 저장했습니다.`;
      const companionDescription =
        autoCreatedCompanions.length > 0
          ? ` 등록되지 않은 동행자 ID(${autoCreatedCompanions.join(", ")})를 기본 프로필로 추가했습니다. 이름과 연령대를 확인하세요.`
          : "";
      const companionErrorDescription = companionProfileError
        ? ` 동행자 기본 프로필 자동 추가에 실패했습니다: ${companionProfileError}`
        : "";

      try {
        const validation = await apiClient.validateTrip(response.trip_id);
        setValidationWarnings(validation.warnings);
        setOperationState({
          title: "캠핑 계획 저장 완료",
          tone:
            validation.warnings.length > 0 ||
            autoCreatedCompanions.length > 0 ||
            Boolean(companionProfileError)
              ? "warning"
              : "success",
          description:
            validation.warnings.length > 0
              ? `${savedDescription}${companionDescription}${companionErrorDescription} 검증 경고를 확인하세요.`
              : `${savedDescription}${companionDescription}${companionErrorDescription}`,
        });
      } catch (error) {
        setValidationWarnings([
          ...toValidationWarnings(error),
          ...(companionProfileError
            ? [`동행자 기본 프로필 자동 추가 실패: ${companionProfileError}`]
            : []),
        ]);
        setOperationState({
          title: "캠핑 계획 저장 완료",
          tone: "warning",
          description: `${savedDescription}${companionDescription}${companionErrorDescription} 검증 경고를 확인하세요.`,
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
      if (section === "durable") {
        await apiClient.createEquipmentItem(section, durableDraft);
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

      const syncWarnings = await refreshEquipmentState();
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
      if (section === "durable") {
        const item = equipment.durable.items.find((candidate) => candidate.id === itemId);
        if (item) {
          await apiClient.updateEquipmentItem(section, itemId, item);
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

      const syncWarnings = await refreshEquipmentState();
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

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero__copy">
          <div className="hero__eyebrow">Local-first Camping Manager</div>
          <h1>장비, 일정, 히스토리, 링크를 한 번에 관리하는 로컬 캠핑 도구</h1>
          <p>{tripCountLabel}</p>
        </div>
        <div className="hero__meta">
          <div className="hero__meta-label">핵심 경로</div>
          <code>.camping-data/trips/&lt;trip-id&gt;.yaml</code>
          <code>.camping-data/history/&lt;history-id&gt;.yaml</code>
          <code>.camping-data/links.yaml</code>
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
        <aside className="side-nav panel">
          <div className="panel__eyebrow">Menu</div>
          <nav className="nav-list">
            <button
              className={navButtonClass(activePage === "dashboard")}
              onClick={() => setActivePage("dashboard")}
              type="button"
            >
              대시보드
            </button>
            <button
              className={navButtonClass(activePage === "equipment")}
              onClick={() => setActivePage("equipment")}
              type="button"
            >
              장비 관리
            </button>
            <button
              className={navButtonClass(activePage === "planning")}
              onClick={() => setActivePage("planning")}
              type="button"
            >
              캠핑 계획
            </button>
            <button
              className={navButtonClass(activePage === "history")}
              onClick={() => setActivePage("history")}
              type="button"
            >
              캠핑 히스토리
            </button>
            <button
              className={navButtonClass(activePage === "links")}
              onClick={() => setActivePage("links")}
              type="button"
            >
              외부 링크
            </button>
            <button
              className={navButtonClass(activePage === "management")}
              onClick={() => setActivePage("management")}
              type="button"
            >
              관리 설정
            </button>
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
            <section className="page-grid">
              <section className="panel">
                <div className="panel__eyebrow">Overview</div>
                <div className="panel__header">
                  <h2>운영 현황</h2>
                </div>
                <div className="metric-grid">
                  <MetricCard label="예정 계획" value={`${dashboardMetrics.trips}건`} />
                  <MetricCard label="히스토리" value={`${dashboardMetrics.history}건`} />
                  <MetricCard label="점검/재고 경고" value={`${dashboardMetrics.alerts}건`} />
                  <MetricCard label="외부 링크" value={`${dashboardMetrics.links}건`} />
                </div>
              </section>

              <section className="panel">
                <div className="panel__eyebrow">Upcoming</div>
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
                <div className="panel__eyebrow">Recent</div>
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
            </section>
          ) : null}

          {!appLoading && activePage === "equipment" ? (
            <section className="page-grid page-grid--two">
              <section className="panel">
                <div className="panel__eyebrow">Equipment</div>
                <div className="panel__header">
                  <h2>장비 섹션</h2>
                </div>
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

                {equipmentSection === "durable" ? (
                  <EquipmentList
                    categories={equipmentCategories.durable}
                    items={equipment?.durable.items ?? []}
                    onDelete={(itemId) => handleDeleteEquipmentItem("durable", itemId)}
                    onSave={(itemId) => handleSaveEquipmentItem("durable", itemId)}
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
                    categories={equipmentCategories.consumables}
                    items={equipment?.consumables.items ?? []}
                    onDelete={(itemId) =>
                      handleDeleteEquipmentItem("consumables", itemId)
                    }
                    onSave={(itemId) =>
                      handleSaveEquipmentItem("consumables", itemId)
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
                    categories={equipmentCategories.precheck}
                    items={equipment?.precheck.items ?? []}
                    onDelete={(itemId) => handleDeleteEquipmentItem("precheck", itemId)}
                    onSave={(itemId) => handleSaveEquipmentItem("precheck", itemId)}
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

              <section className="panel">
                <div className="panel__eyebrow">Create</div>
                <div className="panel__header">
                  <h2>새 항목 추가</h2>
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
            </section>
          ) : null}

          {!appLoading && activePage === "management" ? (
            <section className="page-grid page-grid--two">
              <section className="panel">
                <div className="panel__eyebrow">Categories</div>
                <div className="panel__header">
                  <h2>장비 카테고리 관리</h2>
                  <span className="pill">{currentEquipmentCategories.length}개</span>
                </div>
                <p className="panel__copy">
                  장비 섹션별 카테고리를 여기서 관리합니다. 장비 화면에서는 이 목록만
                  선택할 수 있고, 카테고리 코드는 내부 식별값으로 유지됩니다.
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

              <section className="panel">
                <div className="panel__eyebrow">Create</div>
                <div className="panel__header">
                  <h2>새 카테고리 추가</h2>
                </div>
                <p className="panel__copy">
                  카테고리 코드는 자동 생성하지 않습니다. 영문 소문자, 숫자, `-`, `_`
                  형식으로 직접 입력합니다.
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
            </section>
          ) : null}

          {!appLoading && activePage === "planning" ? (
            <section className="page-grid page-grid--planning">
              <section className="panel">
                <div className="panel__eyebrow">Plans</div>
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
                <div className="panel__eyebrow">Editor</div>
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
                      <FormField label="동행자 ID">
                        <input
                          placeholder="콤마로 구분 (예: self, child-1)"
                          value={commaInputs.companionIds}
                          onChange={(event) => {
                            setCommaInputs((current) => ({
                              ...current,
                              companionIds: event.target.value,
                            }));
                            updateTripDraft((current) => ({
                              ...current,
                              party: {
                                companion_ids: splitCommaList(event.target.value),
                              },
                            }));
                          }}
                        />
                      </FormField>
                      <FormField label="차량 ID">
                        <input
                          placeholder="예: carnival-01"
                          value={tripDraft.vehicle?.id ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              vehicle: {
                                ...current.vehicle,
                                id: event.target.value || undefined,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="적재량 (kg)">
                        <input
                          type="number"
                          placeholder="예: 150"
                          value={tripDraft.vehicle?.load_capacity_kg ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              vehicle: {
                                ...current.vehicle,
                                load_capacity_kg: parseNumber(event.target.value),
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="탑승 인원">
                        <input
                          type="number"
                          placeholder="예: 4"
                          value={tripDraft.vehicle?.passenger_capacity ?? ""}
                          onChange={(event) =>
                            updateTripDraft((current) => ({
                              ...current,
                              vehicle: {
                                ...current.vehicle,
                                passenger_capacity: parseInteger(event.target.value),
                              },
                            }))
                          }
                        />
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
                          placeholder="메모를 줄 단위로 입력"
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

                    <section className="companion-panel">
                      <div className="panel__header">
                        <h3>동행자 관리</h3>
                        <span className="pill">{companions.length}명 등록됨</span>
                      </div>
                      <p className="panel__copy">
                        계획에는 동행자 ID를 입력하고, 없는 ID는 여기서 바로 추가하거나 저장 시
                        기본 프로필로 자동 등록할 수 있습니다. ID는 소문자 kebab-case를
                        사용합니다.
                      </p>

                      {companions.length > 0 ? (
                        <div className="stack-list">
                          {companions.map((companion) => {
                            const included =
                              tripDraft.party?.companion_ids.includes(companion.id) ?? false;

                            return (
                              <article className="edit-card" key={companion.id}>
                                <div className="companion-card__header">
                                  <div>
                                    <strong>
                                      {companion.name} <code>{companion.id}</code>
                                    </strong>
                                    <p>
                                      {AGE_GROUP_LABELS[companion.age_group]}
                                      {companion.birth_year
                                        ? ` / ${companion.birth_year}년생`
                                        : ""}
                                      {included ? " / 현재 계획에 포함됨" : ""}
                                    </p>
                                  </div>
                                  <div className="button-row">
                                    <button
                                      className="button"
                                      onClick={() => {
                                        setCommaInputs((current) => ({
                                          ...current,
                                          companionIds: joinCommaList(
                                            mergeCompanionIds(
                                              tripDraft.party?.companion_ids ?? [],
                                              companion.id,
                                            ),
                                          ),
                                        }));
                                        updateTripDraft((current) => ({
                                          ...current,
                                          party: {
                                            companion_ids: mergeCompanionIds(
                                              current.party?.companion_ids ?? [],
                                              companion.id,
                                            ),
                                          },
                                        }));
                                      }}
                                      type="button"
                                    >
                                      계획에 추가
                                    </button>
                                    <button
                                      className="button"
                                      onClick={() => beginEditCompanion(companion)}
                                      type="button"
                                    >
                                      편집
                                    </button>
                                    <button
                                      className="button"
                                      onClick={() => handleDeleteCompanion(companion.id)}
                                      type="button"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state empty-state--compact">
                          등록된 동행자가 없습니다. 아래에서 첫 동행자를 추가하세요.
                        </div>
                      )}

                      {missingCompanionIds.length > 0 ? (
                        <div className="edit-card">
                          <strong>미등록 동행자 ID</strong>
                          <p className="companion-card__copy">
                            {missingCompanionIds.join(", ")} 가 아직 등록되지 않았습니다.
                          </p>
                          <div className="button-row">
                            {missingCompanionIds.map((companionId) => (
                              <button
                                className="button"
                                key={companionId}
                                onClick={() =>
                                  void handleCreateCompanion(
                                    createPlaceholderCompanion(companionId),
                                  )
                                }
                                type="button"
                              >
                                {companionId} 기본값으로 추가
                              </button>
                            ))}
                            <button
                              className="button"
                              onClick={() => beginCreateCompanion(missingCompanionIds[0])}
                              type="button"
                            >
                              수동으로 상세 입력
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="edit-card">
                        <div className="panel__header">
                          <h3>{editingCompanionId ? "동행자 수정" : "동행자 추가"}</h3>
                        </div>
                        <div className="form-grid">
                          <FormField label="동행자 ID">
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
                              placeholder="줄 단위로 입력"
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
                              placeholder="줄 단위로 입력"
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
                            {editingCompanionId ? "동행자 저장" : "동행자 추가"}
                          </button>
                          <button
                            className="button"
                            onClick={() => beginCreateCompanion()}
                            type="button"
                          >
                            새 입력으로 초기화
                          </button>
                        </div>
                      </div>
                    </section>

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

              <section className="panel">
                <div className="panel__eyebrow">AI Assist</div>
                <div className="panel__header">
                  <h2>AI 보조와 분석 결과</h2>
                </div>
                <div className="stack-list usage-guide-list">
                  <div className="action-card">
                    <strong>AI 보조는 저장 후 질문할 때 사용</strong>
                    <p>
                      분석 전에 빠진 정보, 장비 보강 포인트, 먼저 수정할 항목을 확인할 때
                      사용합니다.
                    </p>
                  </div>
                  <div className="action-card">
                    <strong>분석 결과는 최종 정리할 때 확인</strong>
                    <p>
                      계획과 장비 점검이 끝난 뒤 분석을 실행하면 준비물, 체크리스트,
                      식단, 이동 추천, 다음 캠핑 추천이 Markdown으로 정리됩니다.
                    </p>
                  </div>
                </div>

                {selectedTripId ? (
                  <>
                    <div className="section-label">
                      <strong>AI 보조</strong>
                      <p>저장된 계획을 기준으로 먼저 물어보고, 필요한 제안만 직접 반영합니다.</p>
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

                    <div className="section-label section-label--analysis">
                      <strong>분석 결과</strong>
                      <p>
                        입력과 점검이 끝났다면 분석 실행을 눌러 이번 캠핑의 최종 정리본을
                        확인합니다.
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
                    AI 보조와 분석은 저장된 계획에서만 실행할 수 있습니다.
                  </div>
                )}
              </section>
            </section>
          ) : null}

          {!appLoading && activePage === "history" ? (
            <section className="page-grid page-grid--two">
              <section className="panel">
                <div className="panel__eyebrow">History</div>
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
                          {item.attendee_count ?? item.companion_ids.length}명
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel__eyebrow">Detail</div>
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
                        placeholder="히스토리 메모를 줄 단위로 입력"
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
          ) : null}

          {!appLoading && activePage === "links" ? (
            <section className="page-grid page-grid--two">
              <section className="panel">
                <div className="panel__eyebrow">Links</div>
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
                <div className="panel__eyebrow">Add Link</div>
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

function createCommaSeparatedInputs(draft?: TripDraft | null): CommaSeparatedInputs {
  return {
    companionIds: joinCommaList(draft?.party?.companion_ids),
    requestedDishes: joinCommaList(draft?.meal_plan?.requested_dishes),
    requestedStops: joinCommaList(draft?.travel_plan?.requested_stops),
  };
}

function FormField(props: { children: ReactNode; full?: boolean; label: string }) {
  return (
    <div className={props.full ? "field form-grid__full" : "field"}>
      <span className="field__label">{props.label}</span>
      {props.children}
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

function EquipmentList(props: {
  categories: EquipmentCategory[];
  items: DurableEquipmentItem[];
  onChange: (itemId: string, updater: (item: DurableEquipmentItem) => DurableEquipmentItem) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <div className="stack-list">
      {props.items.map((item) => (
        <div className="edit-card" key={item.id}>
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
            <FormField label="카테고리">
              <EquipmentCategorySelect
                categories={props.categories}
                value={item.category}
                onChange={(value) =>
                  props.onChange(item.id, (current) => ({
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
          </div>
          <div className="button-row">
            <button className="button" onClick={() => props.onSave(item.id)} type="button">
              저장
            </button>
            <button className="button" onClick={() => props.onDelete(item.id)} type="button">
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConsumableList(props: {
  categories: EquipmentCategory[];
  items: ConsumableEquipmentItem[];
  onChange: (
    itemId: string,
    updater: (item: ConsumableEquipmentItem) => ConsumableEquipmentItem,
  ) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <div className="stack-list">
      {props.items.map((item) => (
        <div className="edit-card" key={item.id}>
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
                onChange={(value) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    category: value,
                  }))
                }
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
        </div>
      ))}
    </div>
  );
}

function PrecheckList(props: {
  categories: EquipmentCategory[];
  items: PrecheckItem[];
  onChange: (itemId: string, updater: (item: PrecheckItem) => PrecheckItem) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <div className="stack-list">
      {props.items.map((item) => (
        <div className="edit-card" key={item.id}>
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
                onChange={(value) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    category: value,
                  }))
                }
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
        </div>
      ))}
    </div>
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
  const merged = [...categories];

  if (currentValue && !merged.some((item) => item.id === currentValue)) {
    merged.push({
      id: currentValue,
      label: currentValue,
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

function mergeCompanionIds(currentIds: string[], companionId: string) {
  return [...new Set([...currentIds, companionId])];
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
