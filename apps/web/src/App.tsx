import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  AnalyzeTripResponse,
  ConsumableEquipmentItem,
  ConsumableEquipmentItemInput,
  DurableEquipmentItem,
  DurableEquipmentItemInput,
  EquipmentCatalog,
  EquipmentSection,
  ExternalLink,
  ExternalLinkCategory,
  ExternalLinkInput,
  HistoryRecord,
  PlanningAssistantAction,
  PlanningAssistantResponse,
  PrecheckItem,
  PrecheckItemInput,
  TripDraft,
  TripSummary,
} from "@camping/shared";
import { EXTERNAL_LINK_CATEGORY_LABELS } from "@camping/shared";
import { apiClient, ApiClientError } from "./api/client";
import { StatusBanner } from "./components/StatusBanner";

type PageKey = "dashboard" | "equipment" | "planning" | "history" | "links";

type OperationState = {
  title: string;
  tone: "success" | "warning" | "error";
  description: string;
};

export function App() {
  const [activePage, setActivePage] = useState<PageKey>("dashboard");
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
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
  const [equipmentSection, setEquipmentSection] =
    useState<EquipmentSection>("durable");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
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
  const [saveOutput, setSaveOutput] = useState(true);
  const [savingOutput, setSavingOutput] = useState(false);
  const [operationState, setOperationState] = useState<OperationState | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (isCreatingTrip || !selectedTripId) {
      if (!isCreatingTrip) {
        setTripDraft(null);
        setValidationWarnings([]);
      }
      return;
    }

    let active = true;
    setDetailLoading(true);
    setLoadError(null);

    void Promise.all([
      apiClient.getTrip(selectedTripId),
      apiClient.validateTrip(selectedTripId),
    ])
      .then(([tripResponse, validationResponse]) => {
        if (!active) return;
        setTripDraft(tripResponse.data);
        setValidationWarnings(validationResponse.warnings);
        setAnalysisResponse(null);
        setAssistantResponse(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(getErrorMessage(error));
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

  const tripCountLabel = useMemo(() => {
    if (isCreatingTrip) {
      return "새 캠핑 계획 작성 중";
    }

    if (!tripDraft) {
      return "등록된 캠핑 계획을 선택하거나 새로 만들 수 있습니다.";
    }

    return `${tripDraft.title} / ${
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
      const [tripResponse, equipmentResponse, historyResponse, linkResponse] =
        await Promise.all([
          apiClient.getTrips(),
          apiClient.getEquipment(),
          apiClient.getHistory(),
          apiClient.getLinks(),
        ]);

      setTrips(tripResponse.items);
      setEquipment(equipmentResponse);
      setHistory(historyResponse.items);
      setLinks(linkResponse.items);
      setSelectedTripId((current) => current ?? tripResponse.items?.[0]?.trip_id ?? null);
      setSelectedHistoryId(
        (current) => current ?? historyResponse.items?.[0]?.history_id ?? null,
      );
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setAppLoading(false);
    }
  }

  function beginCreateTrip() {
    setActivePage("planning");
    setIsCreatingTrip(true);
    setSelectedTripId(null);
    setTripDraft(createEmptyTripDraft());
    setValidationWarnings([]);
    setAnalysisResponse(null);
    setAssistantResponse(null);
    setOperationState(null);
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
      setOperationState({
        title: "캠핑 계획 저장 완료",
        tone: "success",
        description: `${response.data.title} 계획을 저장했습니다.`,
      });

      const validation = await apiClient.validateTrip(response.trip_id);
      setValidationWarnings(validation.warnings);
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

    try {
      await apiClient.deleteTrip(selectedTripId);
      const response = await apiClient.getTrips();
      setTrips(response.items);
      setSelectedTripId(response.items[0]?.trip_id ?? null);
      setTripDraft(null);
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

    setAnalyzing(true);
    setOperationState(null);

    try {
      const response = await apiClient.analyzeTrip({
        trip_id: selectedTripId,
        save_output: saveOutput,
      });
      setAnalysisResponse(response);

      if (response.output_path) {
        setOperationState({
          title: "분석 저장 완료",
          tone: "success",
          description: response.output_path,
        });
      }
    } catch (error) {
      setOperationState({
        title: "분석 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSaveOutput() {
    if (!selectedTripId || !analysisResponse?.markdown) return;

    setSavingOutput(true);

    try {
      const response = await apiClient.saveOutput({
        trip_id: selectedTripId,
        markdown: analysisResponse.markdown,
      });
      setAnalysisResponse((current) =>
        current
          ? {
              ...current,
              output_path: response.output_path,
              error: undefined,
            }
          : current,
      );
      setOperationState({
        title: "결과 저장 완료",
        tone: "success",
        description: response.output_path,
      });
    } catch (error) {
      setOperationState({
        title: "결과 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      setSavingOutput(false);
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

      setEquipment(await apiClient.getEquipment());
      setOperationState({
        title: "AI 제안 반영 완료",
        tone: "success",
        description: action.title,
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
        setDurableDraft(createEmptyDurableItem());
      }

      if (section === "consumables") {
        await apiClient.createEquipmentItem(section, consumableDraft);
        setConsumableDraft(createEmptyConsumableItem());
      }

      if (section === "precheck") {
        await apiClient.createEquipmentItem(section, precheckDraft);
        setPrecheckDraft(createEmptyPrecheckItem());
      }

      setEquipment(await apiClient.getEquipment());
      setOperationState({
        title: "장비 항목 추가 완료",
        tone: "success",
        description: `${section} 섹션에 새 항목을 추가했습니다.`,
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

      setEquipment(await apiClient.getEquipment());
      setOperationState({
        title: "장비 저장 완료",
        tone: "success",
        description: itemId,
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
    try {
      await apiClient.deleteEquipmentItem(section, itemId);
      setEquipment(await apiClient.getEquipment());
      setOperationState({
        title: "장비 삭제 완료",
        tone: "success",
        description: itemId,
      });
    } catch (error) {
      setOperationState({
        title: "장비 삭제 실패",
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

  async function handleDeleteHistory(historyId: string) {
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

      {operationState ? (
        <StatusBanner
          tone={operationState.tone}
          title={operationState.title}
          description={operationState.description}
        />
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
                    <input
                      placeholder="장비명"
                      value={durableDraft.name}
                      onChange={(event) =>
                        setDurableDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="카테고리"
                      value={durableDraft.category}
                      onChange={(event) =>
                        setDurableDraft((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="수량"
                      value={durableDraft.quantity}
                      onChange={(event) =>
                        setDurableDraft((current) => ({
                          ...current,
                          quantity: Number(event.target.value) || 1,
                        }))
                      }
                    />
                    <select
                      value={durableDraft.status}
                      onChange={(event) =>
                        setDurableDraft((current) => ({
                          ...current,
                          status: event.target.value as DurableEquipmentItem["status"],
                        }))
                      }
                    >
                      <option value="ok">ok</option>
                      <option value="low">low</option>
                      <option value="needs_check">needs_check</option>
                      <option value="needs_repair">needs_repair</option>
                    </select>
                    <button
                      className="button button--primary"
                      onClick={() => handleCreateEquipmentItem("durable")}
                      type="button"
                    >
                      반복 장비 추가
                    </button>
                  </div>
                ) : null}

                {equipmentSection === "consumables" ? (
                  <div className="form-grid">
                    <input
                      placeholder="소모품명"
                      value={consumableDraft.name}
                      onChange={(event) =>
                        setConsumableDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="카테고리"
                      value={consumableDraft.category}
                      onChange={(event) =>
                        setConsumableDraft((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="단위"
                      value={consumableDraft.unit}
                      onChange={(event) =>
                        setConsumableDraft((current) => ({
                          ...current,
                          unit: event.target.value,
                        }))
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="현재 수량"
                      value={consumableDraft.quantity_on_hand}
                      onChange={(event) =>
                        setConsumableDraft((current) => ({
                          ...current,
                          quantity_on_hand: Number(event.target.value) || 0,
                        }))
                      }
                    />
                    <button
                      className="button button--primary"
                      onClick={() => handleCreateEquipmentItem("consumables")}
                      type="button"
                    >
                      소모품 추가
                    </button>
                  </div>
                ) : null}

                {equipmentSection === "precheck" ? (
                  <div className="form-grid">
                    <input
                      placeholder="점검 항목명"
                      value={precheckDraft.name}
                      onChange={(event) =>
                        setPrecheckDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="카테고리"
                      value={precheckDraft.category}
                      onChange={(event) =>
                        setPrecheckDraft((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    />
                    <select
                      value={precheckDraft.status}
                      onChange={(event) =>
                        setPrecheckDraft((current) => ({
                          ...current,
                          status: event.target.value as PrecheckItem["status"],
                        }))
                      }
                    >
                      <option value="ok">ok</option>
                      <option value="needs_check">needs_check</option>
                      <option value="needs_repair">needs_repair</option>
                    </select>
                    <button
                      className="button button--primary"
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
                      <input
                        placeholder="계획 제목"
                        value={tripDraft.title}
                        onChange={(event) =>
                          updateTripDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
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
                      <input
                        placeholder="캠핑장 이름"
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
                      <input
                        placeholder="지역"
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
                      <input
                        placeholder="출발 지역"
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
                      <input
                        placeholder="동행자 ID, 콤마 구분"
                        value={joinCommaList(tripDraft.party?.companion_ids)}
                        onChange={(event) =>
                          updateTripDraft((current) => ({
                            ...current,
                            party: {
                              companion_ids: splitCommaList(event.target.value),
                            },
                          }))
                        }
                      />
                      <input
                        placeholder="차량 ID"
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
                      <input
                        type="number"
                        placeholder="적재량 kg"
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
                      <input
                        type="number"
                        placeholder="탑승 인원"
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
                      <input
                        placeholder="날씨 요약"
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
                      <input
                        placeholder="강수 정보"
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
                      <input
                        placeholder="요청 메뉴, 콤마 구분"
                        value={joinCommaList(tripDraft.meal_plan?.requested_dishes)}
                        onChange={(event) =>
                          updateTripDraft((current) => ({
                            ...current,
                            meal_plan: {
                              ...current.meal_plan,
                              use_ai_recommendation:
                                current.meal_plan?.use_ai_recommendation ?? true,
                              requested_dishes: splitCommaList(event.target.value),
                            },
                          }))
                        }
                      />
                      <input
                        placeholder="경유 희망지, 콤마 구분"
                        value={joinCommaList(tripDraft.travel_plan?.requested_stops)}
                        onChange={(event) =>
                          updateTripDraft((current) => ({
                            ...current,
                            travel_plan: {
                              ...current.travel_plan,
                              use_ai_recommendation:
                                current.travel_plan?.use_ai_recommendation ?? true,
                              requested_stops: splitCommaList(event.target.value),
                            },
                          }))
                        }
                      />
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
                      <label className="checkbox-row">
                        <input
                          checked={saveOutput}
                          onChange={(event) => setSaveOutput(event.target.checked)}
                          type="checkbox"
                        />
                        분석 후 결과 저장
                      </label>
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

                {selectedTripId ? (
                  <>
                    <div className="assistant-box">
                      <textarea
                        placeholder="예: 이번에는 비 예보가 있고 바베큐 위주로 준비하고 싶어"
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

                    {analysisResponse?.error?.code === "OUTPUT_SAVE_FAILED" ? (
                      <StatusBanner
                        tone="warning"
                        title="결과 생성 완료, 저장 실패"
                        description={analysisResponse.error.message}
                      />
                    ) : null}

                    {analysisResponse?.markdown ? (
                      <>
                        <div className="action-row action-row--end">
                          <button
                            className="button"
                            disabled={savingOutput}
                            onClick={handleSaveOutput}
                            type="button"
                          >
                            {savingOutput ? "저장 중..." : "결과 저장"}
                          </button>
                        </div>
                        <article className="markdown-pane">
                          <ReactMarkdown>{analysisResponse.markdown}</ReactMarkdown>
                        </article>
                      </>
                    ) : (
                      <div className="empty-state">
                        계획을 저장한 뒤 분석을 실행하면 결과가 여기에 표시됩니다.
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
                    <input
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
                    <input
                      type="number"
                      min="0"
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
                    <input value={selectedHistory.archived_at} readOnly />
                    <textarea
                      className="form-grid__full"
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
                    {links.map((link) => (
                      <div className="link-card" key={link.id}>
                        <input
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
                        <input
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
                        <textarea
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
                        <div className="button-row">
                          <a className="button" href={link.url} rel="noreferrer" target="_blank">
                            링크 열기
                          </a>
                          <button className="button" onClick={() => handleSaveLink(link)} type="button">
                            저장
                          </button>
                          <button className="button" onClick={() => handleDeleteLink(link.id)} type="button">
                            삭제
                          </button>
                        </div>
                      </div>
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
                  <input
                    placeholder="링크 이름"
                    value={linkDraft.name}
                    onChange={(event) =>
                      setLinkDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
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
                  <button className="button button--primary" onClick={handleCreateLink} type="button">
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
    title: "새 캠핑 계획",
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

function MetricCard(props: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function EquipmentList(props: {
  items: DurableEquipmentItem[];
  onChange: (itemId: string, updater: (item: DurableEquipmentItem) => DurableEquipmentItem) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <div className="stack-list">
      {props.items.map((item) => (
        <div className="edit-card" key={item.id}>
          <input
            value={item.name}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({ ...current, name: event.target.value }))
            }
          />
          <input
            value={item.category}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({
                ...current,
                category: event.target.value,
              }))
            }
          />
          <input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({
                ...current,
                quantity: Number(event.target.value) || 1,
              }))
            }
          />
          <select
            value={item.status}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({
                ...current,
                status: event.target.value as DurableEquipmentItem["status"],
              }))
            }
          >
            <option value="ok">ok</option>
            <option value="low">low</option>
            <option value="needs_check">needs_check</option>
            <option value="needs_repair">needs_repair</option>
          </select>
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
          <input
            value={item.name}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({ ...current, name: event.target.value }))
            }
          />
          <input
            value={item.category}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({
                ...current,
                category: event.target.value,
              }))
            }
          />
          <input
            type="number"
            min="0"
            value={item.quantity_on_hand}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({
                ...current,
                quantity_on_hand: Number(event.target.value) || 0,
              }))
            }
          />
          <input
            value={item.unit}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({ ...current, unit: event.target.value }))
            }
          />
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
  items: PrecheckItem[];
  onChange: (itemId: string, updater: (item: PrecheckItem) => PrecheckItem) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <div className="stack-list">
      {props.items.map((item) => (
        <div className="edit-card" key={item.id}>
          <input
            value={item.name}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({ ...current, name: event.target.value }))
            }
          />
          <input
            value={item.category}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({
                ...current,
                category: event.target.value,
              }))
            }
          />
          <select
            value={item.status}
            onChange={(event) =>
              props.onChange(item.id, (current) => ({
                ...current,
                status: event.target.value as PrecheckItem["status"],
              }))
            }
          >
            <option value="ok">ok</option>
            <option value="needs_check">needs_check</option>
            <option value="needs_repair">needs_repair</option>
          </select>
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
    .map((item) => item.trim())
    .filter(Boolean);
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
