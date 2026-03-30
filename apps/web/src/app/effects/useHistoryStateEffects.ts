import { useEffect } from "react";
import { apiClient } from "../../api/client";
import type {
  GetOutputResponse,
  HistoryLearningInsight,
  HistoryRecord,
} from "@camping/shared";
import { getErrorMessage } from "../common-formatters";
import {
  createEmptyRetrospectiveDraft,
  createHistoryEditorDraft,
} from "../view-model-drafts";
import type { HistoryEditorDraft, RetrospectiveDraft } from "../view-model-types";

export function useSelectedHistoryLearningEffect(input: {
  selectedHistoryId: string | null;
  selectedHistory: HistoryRecord | null;
  selectedHistoryIdRef: React.MutableRefObject<string | null>;
  historyLearningRequestIdRef: React.MutableRefObject<number>;
  setHistoryLearningInsight: React.Dispatch<
    React.SetStateAction<HistoryLearningInsight | null>
  >;
  setHistoryLearningError: React.Dispatch<React.SetStateAction<string | null>>;
  setHistoryLearningLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  useEffect(() => {
    if (
      !input.selectedHistoryId ||
      !input.selectedHistory ||
      input.selectedHistory.retrospectives.length === 0
    ) {
      input.setHistoryLearningInsight(null);
      input.setHistoryLearningError(null);
      input.setHistoryLearningLoading(false);
      return;
    }

    const requestId = input.historyLearningRequestIdRef.current + 1;
    input.historyLearningRequestIdRef.current = requestId;
    input.setHistoryLearningLoading(true);
    input.setHistoryLearningError(null);

    void apiClient
      .getHistoryLearning(input.selectedHistoryId)
      .then((response) => {
        if (
          input.selectedHistoryIdRef.current !== input.selectedHistoryId ||
          input.historyLearningRequestIdRef.current !== requestId
        ) {
          return;
        }

        input.setHistoryLearningInsight(response.item);
      })
      .catch((error) => {
        if (
          input.selectedHistoryIdRef.current !== input.selectedHistoryId ||
          input.historyLearningRequestIdRef.current !== requestId
        ) {
          return;
        }

        input.setHistoryLearningInsight(null);
        input.setHistoryLearningError(getErrorMessage(error));
      })
      .finally(() => {
        if (
          input.selectedHistoryIdRef.current !== input.selectedHistoryId ||
          input.historyLearningRequestIdRef.current !== requestId
        ) {
          return;
        }

        input.setHistoryLearningLoading(false);
      });
  }, [
    input.historyLearningRequestIdRef,
    input.selectedHistory,
    input.selectedHistoryId,
    input.selectedHistoryIdRef,
    input.setHistoryLearningError,
    input.setHistoryLearningInsight,
    input.setHistoryLearningLoading,
  ]);
}

export function useSelectedHistoryResetEffect(input: {
  selectedHistoryId: string | null;
  selectedHistory: HistoryRecord | null;
  selectedHistoryIdRef: React.MutableRefObject<string | null>;
  historyLearningRequestIdRef: React.MutableRefObject<number>;
  historyEditorDraftRef: React.MutableRefObject<HistoryEditorDraft>;
  retrospectiveDraftRef: React.MutableRefObject<RetrospectiveDraft>;
  setRetrospectiveResetVersion: React.Dispatch<React.SetStateAction<number>>;
  setHistoryEditorResetVersion: React.Dispatch<React.SetStateAction<number>>;
  setHistoryLearningInsight: React.Dispatch<
    React.SetStateAction<HistoryLearningInsight | null>
  >;
  setHistoryLearningError: React.Dispatch<React.SetStateAction<string | null>>;
  setHistoryLearningLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setHistoryOutput: React.Dispatch<React.SetStateAction<GetOutputResponse | null>>;
  setHistoryOutputError: React.Dispatch<React.SetStateAction<string | null>>;
  setHistoryOutputLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  useEffect(() => {
    input.selectedHistoryIdRef.current = input.selectedHistoryId;
    input.historyLearningRequestIdRef.current += 1;
    input.historyEditorDraftRef.current = createHistoryEditorDraft(input.selectedHistory);
    input.retrospectiveDraftRef.current = createEmptyRetrospectiveDraft();
    input.setRetrospectiveResetVersion((current) => current + 1);
    input.setHistoryEditorResetVersion((current) => current + 1);
    input.setHistoryLearningInsight(null);
    input.setHistoryLearningError(null);
    input.setHistoryLearningLoading(false);
    input.setHistoryOutput(null);
    input.setHistoryOutputError(null);
    input.setHistoryOutputLoading(false);
  }, [
    input.historyEditorDraftRef,
    input.historyLearningRequestIdRef,
    input.retrospectiveDraftRef,
    input.selectedHistory,
    input.selectedHistoryId,
    input.selectedHistoryIdRef,
    input.setHistoryEditorResetVersion,
    input.setHistoryLearningError,
    input.setHistoryLearningInsight,
    input.setHistoryLearningLoading,
    input.setHistoryOutput,
    input.setHistoryOutputError,
    input.setHistoryOutputLoading,
    input.setRetrospectiveResetVersion,
  ]);
}
