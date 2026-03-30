import { useState } from "react";
import type { PersistedUiState } from "../ui-state";
import type { AiJobRealtimeMode, OperationState } from "../view-model-types";

export type MarkdownLayerState = {
  eyebrow: string;
  title: string;
  description: string;
  outputPath: string | null;
  markdown: string;
};

export function useUiShellState(persistedUiState: PersistedUiState | null) {
  const [dashboardPageTab, setDashboardPageTab] = useState(
    persistedUiState?.dashboardPageTab ?? "overview",
  );
  const [helpPageTab, setHelpPageTab] = useState(
    persistedUiState?.helpPageTab ?? "files",
  );
  const [markdownLayer, setMarkdownLayer] = useState<MarkdownLayerState | null>(null);
  const [appLoading, setAppLoading] = useState(true);
  const [creatingDataBackup, setCreatingDataBackup] = useState(false);
  const [stoppingAllAiJobs, setStoppingAllAiJobs] = useState(false);
  const [bannerState, setBannerState] = useState<OperationState | null>(null);
  const [operationState, setOperationState] = useState<OperationState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiJobRealtimeMode, setAiJobRealtimeMode] =
    useState<AiJobRealtimeMode>("inactive");

  return {
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
  };
}
