import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type {
  GetOutputResponse,
  HistoryRecord,
} from "@camping/shared";
import { apiClient } from "../../api/client";
import { confirmDeletion } from "../../app/browser-helpers";
import { getErrorMessage } from "../../app/common-formatters";
import {
  buildHistoryRecordForSave,
  buildRetrospectiveInput,
  createEmptyRetrospectiveDraft,
  createHistoryEditorDraft,
} from "../../app/view-model-drafts";
import type {
  HistoryEditorDraft,
  OperationState,
  RetrospectiveDraft,
} from "../../app/view-model-types";
import type { MarkdownLayerState } from "../../app/state/useUiShellState";

type BuildHistoryActionsInput = {
  selectedHistory: HistoryRecord | null;
  setHistory: Dispatch<SetStateAction<HistoryRecord[]>>;
  setHistoryEditorResetVersion: Dispatch<SetStateAction<number>>;
  setHistoryOutput: Dispatch<SetStateAction<GetOutputResponse | null>>;
  setHistoryOutputError: Dispatch<SetStateAction<string | null>>;
  setHistoryOutputLoading: Dispatch<SetStateAction<boolean>>;
  setHistoryLearningError: Dispatch<SetStateAction<string | null>>;
  setMarkdownLayer: Dispatch<SetStateAction<MarkdownLayerState | null>>;
  setOperationState: Dispatch<SetStateAction<OperationState | null>>;
  setRetrospectiveResetVersion: Dispatch<SetStateAction<number>>;
  setSavingRetrospective: Dispatch<SetStateAction<boolean>>;
  setSelectedHistoryId: Dispatch<SetStateAction<string | null>>;
  applyUserLearningStatus: (status: import("@camping/shared").UserLearningJobStatusResponse) => void;
  historyEditorDraftRef: MutableRefObject<HistoryEditorDraft>;
  historyOutput: GetOutputResponse | null;
  historyOutputRequestIdRef: MutableRefObject<number>;
  retrospectiveDraftRef: MutableRefObject<RetrospectiveDraft>;
  selectedHistoryIdRef: MutableRefObject<string | null>;
};

export function buildHistoryActions(input: BuildHistoryActionsInput) {
  async function handleSaveHistory(editorDraft: HistoryEditorDraft) {
    if (!input.selectedHistory) {
      return;
    }

    try {
      const response = await apiClient.updateHistory(
        input.selectedHistory.history_id,
        buildHistoryRecordForSave(input.selectedHistory, editorDraft),
      );
      input.setHistory((current) =>
        current.map((item) =>
          item.history_id === response.item.history_id ? response.item : item,
        ),
      );
      input.historyEditorDraftRef.current = createHistoryEditorDraft(response.item);
      input.setHistoryEditorResetVersion((current) => current + 1);
      input.setOperationState({
        title: "히스토리 저장 완료",
        tone: "success",
        description: response.item.title,
      });
    } catch (error) {
      input.setOperationState({
        title: "히스토리 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleAddRetrospective(draft: RetrospectiveDraft) {
    if (!input.selectedHistory) {
      return;
    }

    input.setSavingRetrospective(true);

    try {
      const response = await apiClient.addHistoryRetrospective(
        input.selectedHistory.history_id,
        buildRetrospectiveInput(draft),
      );

      input.setHistory((current) =>
        current.map((item) =>
          item.history_id === response.item.history_id ? response.item : item,
        ),
      );
      input.applyUserLearningStatus(response.learning_status);
      input.retrospectiveDraftRef.current = createEmptyRetrospectiveDraft();
      input.setRetrospectiveResetVersion((current) => current + 1);
      input.setHistoryLearningError(null);
      input.setOperationState({
        title: "후기 저장 완료",
        tone: "success",
        description: "회고를 저장했고 개인화 학습 업데이트를 시작했습니다.",
      });
    } catch (error) {
      input.setOperationState({
        title: "후기 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    } finally {
      input.setSavingRetrospective(false);
    }
  }

  async function handleOpenHistoryOutput() {
    if (!input.selectedHistory?.output_path) {
      return;
    }

    const requestedHistoryId = input.selectedHistory.history_id;
    const requestId = input.historyOutputRequestIdRef.current + 1;

    input.historyOutputRequestIdRef.current = requestId;
    input.setHistoryOutputLoading(true);
    input.setHistoryOutputError(null);

    try {
      const response = await apiClient.getOutput(input.selectedHistory.source_trip_id);

      if (
        input.selectedHistoryIdRef.current !== requestedHistoryId ||
        input.historyOutputRequestIdRef.current !== requestId
      ) {
        return;
      }

      input.setHistoryOutput(response);
      input.setOperationState({
        title: "히스토리 결과 불러오기 완료",
        tone: "success",
        description: response.output_path,
      });
    } catch (error) {
      if (
        input.selectedHistoryIdRef.current !== requestedHistoryId ||
        input.historyOutputRequestIdRef.current !== requestId
      ) {
        return;
      }

      input.setHistoryOutput(null);
      const message = getErrorMessage(error);
      input.setHistoryOutputError(message);
      input.setOperationState({
        title: "히스토리 결과 불러오기 실패",
        tone: "error",
        description: message,
      });
    } finally {
      if (
        input.selectedHistoryIdRef.current !== requestedHistoryId ||
        input.historyOutputRequestIdRef.current !== requestId
      ) {
        return;
      }

      input.setHistoryOutputLoading(false);
    }
  }

  function handleOpenHistoryOutputLayer() {
    if (!input.historyOutput?.markdown) {
      return;
    }

    input.setMarkdownLayer({
      eyebrow: "히스토리 결과 레이어",
      title: `${input.selectedHistory?.title ?? "보관 기록"} 저장 결과`,
      description:
        "아카이브 당시 저장된 Markdown 결과를 넓은 폭으로 다시 확인하는 보기입니다.",
      outputPath: input.historyOutput.output_path,
      markdown: input.historyOutput.markdown,
    });
  }

  async function handleDeleteHistory(historyId: string) {
    if (!confirmDeletion(`캠핑 히스토리를 삭제할까요?\n${historyId}`)) {
      return;
    }

    try {
      await apiClient.deleteHistory(historyId);
      const response = await apiClient.getHistory();
      input.setHistory(response.items);
      input.setSelectedHistoryId(response.items[0]?.history_id ?? null);
      input.setOperationState({
        title: "히스토리 삭제 완료",
        tone: "success",
        description: historyId,
      });
    } catch (error) {
      input.setOperationState({
        title: "히스토리 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  return {
    handleAddRetrospective,
    handleDeleteHistory,
    handleOpenHistoryOutput,
    handleOpenHistoryOutputLayer,
    handleSaveHistory,
  };
}
