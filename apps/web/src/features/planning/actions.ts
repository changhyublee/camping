import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type {
  AnalyzeTripResponse,
  ConsumableEquipmentItem,
  DurableEquipmentItem,
  EquipmentCatalog,
  GetOutputResponse,
  HistoryRecord,
  PlanningAssistantAction,
  PlanningAssistantResponse,
  PrecheckItem,
  TripAnalysisCategory,
  TripDraft,
  TripSummary,
} from "@camping/shared";
import { ALL_TRIP_ANALYSIS_CATEGORIES } from "@camping/shared";
import { apiClient, ApiClientError } from "../../api/client";
import { confirmDeletion } from "../../app/browser-helpers";
import { sendTripAnalysisEmailFromDraft } from "../../app/planning-email-actions";
import { mergeLatestExpectedWeatherIntoDraft } from "../../app/planning-save-helpers";
import { hasMeaningfulExpectedWeather } from "../../app/planning-weather-actions";
import {
  appendSyncWarnings,
  getErrorMessage,
  joinLineList,
  toValidationWarnings,
} from "../../app/common-formatters";
import {
  findEquipmentItem,
  toDurableEquipmentInput,
} from "../../app/equipment-view-helpers";
import {
  buildTripDraftForSave,
  createCommaSeparatedInputs,
  createEmptyTripDraft,
} from "../../app/view-model-drafts";
import type {
  CommaSeparatedInputs,
  OperationState,
} from "../../app/view-model-types";
import type {
  HistoryDetailTab,
  HistoryPageTab,
  PlanningPageTab,
} from "../../app/ui-state";
import type { MarkdownLayerState } from "../../app/state/useUiShellState";
import type { PageKey } from "../../app/navigation";

type BuildPlanningActionsInput = {
  analysisOutput: GetOutputResponse | null;
  analysisStatusRef: MutableRefObject<AnalyzeTripResponse | null>;
  assistantInput: string;
  equipment: EquipmentCatalog | null;
  isAnalysisPending: boolean;
  isCreatingTrip: boolean;
  loadPlanningOutput: (
    tripId: string,
    requestId: number,
    options?: { preserveCurrent?: boolean },
  ) => Promise<GetOutputResponse | null>;
  maybeAutoRefreshDurableMetadata: (
    item: DurableEquipmentItem,
  ) => Promise<{ started: boolean; warning: string | null }>;
  planningLoadRequestIdRef: MutableRefObject<number>;
  refreshEquipmentState: (options?: {
    syncMetadataStatuses?: boolean;
  }) => Promise<string[]>;
  selectedAnalysisCategories: TripAnalysisCategory[];
  selectedTripId: string | null;
  setActivePage: (page: PageKey) => void;
  setAnalysisOutput: Dispatch<SetStateAction<GetOutputResponse | null>>;
  setAnalysisStatus: Dispatch<SetStateAction<AnalyzeTripResponse | null>>;
  setAssistantInput: Dispatch<SetStateAction<string>>;
  setAssistantLoading: Dispatch<SetStateAction<boolean>>;
  setAssistantResponse: Dispatch<SetStateAction<PlanningAssistantResponse | null>>;
  setCommaInputs: Dispatch<SetStateAction<CommaSeparatedInputs>>;
  setExpectedWeatherEditedSinceLoad: Dispatch<SetStateAction<boolean>>;
  setHistory: Dispatch<SetStateAction<HistoryRecord[]>>;
  setHistoryDetailTab: Dispatch<SetStateAction<HistoryDetailTab>>;
  setHistoryPageTab: Dispatch<SetStateAction<HistoryPageTab>>;
  setIsCreatingTrip: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setMarkdownLayer: Dispatch<SetStateAction<MarkdownLayerState | null>>;
  setOperationState: Dispatch<SetStateAction<OperationState | null>>;
  setPlanningPageTab: Dispatch<SetStateAction<PlanningPageTab>>;
  setSavingTrip: Dispatch<SetStateAction<boolean>>;
  setSendingAnalysisEmail: Dispatch<SetStateAction<boolean>>;
  setSelectedTripId: Dispatch<SetStateAction<string | null>>;
  setSelectedHistoryId: Dispatch<SetStateAction<string | null>>;
  setTripDraft: Dispatch<SetStateAction<TripDraft | null>>;
  setTripNoteInput: Dispatch<SetStateAction<string>>;
  setTrips: Dispatch<SetStateAction<TripSummary[]>>;
  setValidationWarnings: Dispatch<SetStateAction<string[]>>;
  sendingAnalysisEmail: boolean;
  tripDraft: TripDraft | null;
  tripNoteInput: string;
  expectedWeatherEditedSinceLoad: boolean;
  applyAnalysisStatus: (status: AnalyzeTripResponse | null) => void;
};

export function buildPlanningActions(input: BuildPlanningActionsInput) {
  function beginCreateTrip() {
    const nextDraft = createEmptyTripDraft();

    input.setActivePage("planning");
    input.setPlanningPageTab("editor");
    input.setIsCreatingTrip(true);
    input.setSelectedTripId(null);
    input.setTripDraft(nextDraft);
    input.setExpectedWeatherEditedSinceLoad(false);
    input.setCommaInputs(createCommaSeparatedInputs(nextDraft));
    input.setTripNoteInput(joinLineList(nextDraft.notes));
    input.setValidationWarnings([]);
    input.setAnalysisOutput(null);
    input.setAnalysisStatus(null);
    input.analysisStatusRef.current = null;
    input.setAssistantResponse(null);
    input.setOperationState(null);
    input.setLoadError(null);
  }

  function selectTrip(tripId: string) {
    input.setActivePage("planning");
    input.setPlanningPageTab("editor");
    input.setIsCreatingTrip(false);
    input.setSelectedTripId(tripId);
    input.setOperationState(null);
  }

  async function handleSaveTrip() {
    if (!input.tripDraft) {
      return;
    }

    input.setSavingTrip(true);
    input.setOperationState(null);

    try {
      const draftForSave = input.isCreatingTrip
        ? buildTripDraftForSave(input.tripDraft, input.tripNoteInput)
        : await mergeLatestExpectedWeatherIntoDraft(
            input.selectedTripId ?? input.tripDraft.trip_id ?? "",
            buildTripDraftForSave(input.tripDraft, input.tripNoteInput),
            input.expectedWeatherEditedSinceLoad,
          );
      const response = input.isCreatingTrip
        ? await apiClient.createTrip(draftForSave)
        : await apiClient.updateTrip(
            input.selectedTripId ?? input.tripDraft.trip_id ?? "",
            draftForSave,
          );

      const tripList = await apiClient.getTrips();
      input.setTrips(tripList.items);
      input.setSelectedTripId(response.trip_id);
      input.setIsCreatingTrip(false);
      input.setTripDraft(response.data);
      input.setExpectedWeatherEditedSinceLoad(false);
      input.setCommaInputs(createCommaSeparatedInputs(response.data));
      input.setTripNoteInput(joinLineList(response.data.notes));
      const savedDescription = `${response.data.title} 계획을 저장했습니다.`;
      const autoWeatherNotice =
        !hasMeaningfulExpectedWeather(response.data.conditions?.expected_weather) &&
        response.data.location?.region &&
        (response.data.date?.start || response.data.date?.end)
          ? " 날씨 입력이 비어 있어 Open-Meteo 기반 자동 수집을 백그라운드에서 시작했습니다."
          : "";
      const backgroundAnalysisNotice = input.isAnalysisPending
        ? " 현재 분석에는 방금 저장한 변경이 반영되지 않습니다. 완료 후 다시 실행하세요."
        : "";

      try {
        const validation = await apiClient.validateTrip(response.trip_id);
        input.setValidationWarnings(validation.warnings);
        input.setOperationState({
          title: "캠핑 계획 저장 완료",
          tone:
            validation.warnings.length > 0 || input.isAnalysisPending
              ? "warning"
              : "success",
          description:
            validation.warnings.length > 0
              ? `${savedDescription} 검증 경고를 확인하세요.${autoWeatherNotice}${backgroundAnalysisNotice}`
              : `${savedDescription}${autoWeatherNotice}${backgroundAnalysisNotice}`,
        });
      } catch (error) {
        input.setValidationWarnings(toValidationWarnings(error));
        input.setOperationState({
          title: "캠핑 계획 저장 완료",
          tone: "warning",
          description: `${savedDescription} 검증 경고를 확인하세요.${autoWeatherNotice}${backgroundAnalysisNotice}`,
        });
      }
    } catch (error) {
      input.setOperationState({
        title: "캠핑 계획 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      input.setSavingTrip(false);
    }
  }

  async function handleSendAnalysisEmail() {
    if (!input.selectedTripId || !input.tripDraft || input.sendingAnalysisEmail) {
      return;
    }
    await sendTripAnalysisEmailFromDraft({
      selectedTripId: input.selectedTripId,
      sendingAnalysisEmail: input.sendingAnalysisEmail,
      setCommaInputs: input.setCommaInputs,
      setOperationState: input.setOperationState,
      setSendingAnalysisEmail: input.setSendingAnalysisEmail,
      setTripDraft: input.setTripDraft,
      setTripNoteInput: input.setTripNoteInput,
      setTrips: input.setTrips,
      tripDraft: input.tripDraft,
      tripNoteInput: input.tripNoteInput,
    });
  }

  async function handleDeleteTrip() {
    if (!input.selectedTripId) {
      return;
    }
    if (!confirmDeletion(`캠핑 계획을 삭제할까요?\n${input.selectedTripId}`)) {
      return;
    }

    try {
      await apiClient.deleteTrip(input.selectedTripId);
      const response = await apiClient.getTrips();
      input.setTrips(response.items);
      input.setSelectedTripId(response.items[0]?.trip_id ?? null);
      input.setTripDraft(null);
      input.setCommaInputs(createCommaSeparatedInputs());
      input.setTripNoteInput("");
      input.setAnalysisOutput(null);
      input.setAnalysisStatus(null);
      input.analysisStatusRef.current = null;
      input.setAssistantResponse(null);
      input.setOperationState({
        title: "캠핑 계획 삭제 완료",
        tone: "success",
        description: `${input.selectedTripId} 계획을 삭제했습니다.`,
      });
    } catch (error) {
      input.setOperationState({
        title: "캠핑 계획 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleArchiveTrip() {
    if (!input.selectedTripId) {
      return;
    }

    try {
      const response = await apiClient.archiveTrip(input.selectedTripId);
      const [tripResponse, historyResponse] = await Promise.all([
        apiClient.getTrips(),
        apiClient.getHistory(),
      ]);

      input.setTrips(tripResponse.items);
      input.setHistory(historyResponse.items);
      input.setSelectedTripId(tripResponse.items[0]?.trip_id ?? null);
      input.setSelectedHistoryId(response.item.history_id);
      input.setTripDraft(null);
      input.setCommaInputs(createCommaSeparatedInputs());
      input.setTripNoteInput("");
      input.setAnalysisOutput(null);
      input.setAnalysisStatus(null);
      input.analysisStatusRef.current = null;
      input.setAssistantResponse(null);
      input.setActivePage("history");
      input.setHistoryPageTab("details");
      input.setHistoryDetailTab("retrospective");
      input.setOperationState({
        title: "히스토리 아카이브 완료",
        tone: "success",
        description: `${response.item.title} 계획을 히스토리로 이동했습니다.`,
      });
    } catch (error) {
      input.setOperationState({
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
    if (!input.selectedTripId || categories.length === 0) {
      return;
    }

    const tripId = input.selectedTripId;
    const requestId = input.planningLoadRequestIdRef.current;
    input.setOperationState(null);

    try {
      const response = await apiClient.analyzeTrip({
        trip_id: tripId,
        categories,
        force_refresh: options.forceRefresh,
        save_output: true,
      });

      if (input.planningLoadRequestIdRef.current !== requestId) {
        return;
      }

      input.applyAnalysisStatus(response);

      if (response.status === "completed") {
        await input.loadPlanningOutput(tripId, requestId, { preserveCurrent: true });
        input.setOperationState({
          title: options.successTitle,
          tone: "success",
          description: response.output_path ?? options.successDescription,
        });
      } else if (response.status === "failed") {
        input.setOperationState({
          title: "분석 실패",
          tone: "error",
          description:
            response.error?.message ?? "백그라운드 분석 작업이 실패했습니다.",
        });
      } else if (response.status === "interrupted") {
        input.setOperationState({
          title: "분석 중단",
          tone: "warning",
          description:
            response.error?.message ??
            "이전 분석 작업이 중단되었습니다. 다시 실행해 주세요.",
        });
      } else {
        input.setOperationState({
          title: options.successTitle,
          tone: "success",
          description: options.successDescription,
        });
      }
    } catch (error) {
      if (input.planningLoadRequestIdRef.current !== requestId) {
        return;
      }

      input.setOperationState({
        title: "분석 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleAnalyzeSelected() {
    await requestAnalysisRun(input.selectedAnalysisCategories, {
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
    if (!input.analysisOutput?.markdown) {
      return;
    }

    input.setMarkdownLayer({
      eyebrow: "계획 분석 레이어",
      title: `${input.tripDraft?.title ?? "현재 계획"} 분석 결과`,
      description:
        "본문 폭을 넓혀 이번 캠핑의 최종 Markdown 정리본을 다시 읽는 전용 보기입니다.",
      outputPath: input.analysisOutput.output_path,
      markdown: input.analysisOutput.markdown,
    });
  }

  async function handleAssistantSubmit() {
    if (!input.selectedTripId || !input.assistantInput.trim()) {
      return;
    }

    input.setAssistantLoading(true);

    try {
      const response = await apiClient.assistTrip(
        input.selectedTripId,
        input.assistantInput,
      );
      input.setAssistantResponse(response);
      input.setOperationState({
        title: "AI 보조 응답 완료",
        tone: "success",
        description: "폼에서 반영할 항목과 장비 액션 제안을 확인하세요.",
      });
      input.setAssistantInput("");
    } catch (error) {
      input.setOperationState({
        title: "AI 보조 응답 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      input.setAssistantLoading(false);
    }
  }

  async function handleApplyAssistantAction(action: PlanningAssistantAction) {
    try {
      const additionalWarnings: string[] = [];
      let metadataCollectionStarted = false;

      if (action.action === "increase_quantity" && action.item_id) {
        const currentItem = findEquipmentItem(input.equipment, action.section, action.item_id);

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
        const currentItem = findEquipmentItem(input.equipment, action.section, action.item_id);

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
          const metadataRefreshResult = await input.maybeAutoRefreshDurableMetadata(
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
        ...(await input.refreshEquipmentState()),
        ...additionalWarnings,
      ];
      input.setOperationState({
        title: "AI 제안 반영 완료",
        tone: syncWarnings.length > 0 ? "warning" : "success",
        description: appendSyncWarnings(
          `${action.title}${metadataCollectionStarted ? " 메타데이터 수집은 백그라운드에서 계속됩니다." : ""}`,
          syncWarnings,
        ),
      });
    } catch (error) {
      input.setOperationState({
        title: "AI 제안 반영 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  return {
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
  };
}
