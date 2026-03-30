import { useEffect, useRef, useState } from "react";
import type {
  GetOutputResponse,
  HistoryLearningInsight,
  HistoryRecord,
  UserLearningJobStatusResponse,
  UserLearningProfile,
} from "@camping/shared";
import type { PersistedUiState } from "../ui-state";
import type { HistoryEditorDraft, RetrospectiveDraft } from "../view-model-types";
import {
  createEmptyRetrospectiveDraft,
  createHistoryEditorDraft,
  createIdleUserLearningStatus,
} from "../view-model-drafts";

export function useHistoryState(persistedUiState: PersistedUiState | null) {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
    persistedUiState?.selectedHistoryId ?? null,
  );
  const [historyPageTab, setHistoryPageTab] = useState(
    persistedUiState?.historyPageTab ?? "list",
  );
  const [historyDetailTab, setHistoryDetailTab] = useState(
    persistedUiState?.historyDetailTab ?? "overview",
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
  const [historyEditorResetVersion, setHistoryEditorResetVersion] = useState(0);
  const [retrospectiveResetVersion, setRetrospectiveResetVersion] = useState(0);
  const historyEditorDraftRef = useRef<HistoryEditorDraft>(createHistoryEditorDraft());
  const retrospectiveDraftRef = useRef<RetrospectiveDraft>(
    createEmptyRetrospectiveDraft(),
  );
  const selectedHistoryIdRef = useRef<string | null>(null);
  const historyLearningRequestIdRef = useRef(0);
  const historyOutputRequestIdRef = useRef(0);
  const userLearningStatusRef = useRef<UserLearningJobStatusResponse>(
    createIdleUserLearningStatus(),
  );

  useEffect(() => {
    userLearningStatusRef.current = userLearningStatus;
  }, [userLearningStatus]);

  return {
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
  };
}
