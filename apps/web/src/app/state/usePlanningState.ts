import { useEffect, useRef, useState } from "react";
import type {
  AnalyzeTripResponse,
  GetOutputResponse,
  PlanningAssistantResponse,
  TripDraft,
  TripAnalysisCategory,
  TripSummary,
} from "@camping/shared";
import { ALL_TRIP_ANALYSIS_CATEGORIES } from "@camping/shared";
import type { PersistedUiState } from "../ui-state";
import type { CommaSeparatedInputs } from "../view-model-types";
import { createCommaSeparatedInputs } from "../view-model-drafts";

export function usePlanningState(persistedUiState: PersistedUiState | null) {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(
    persistedUiState?.selectedTripId ?? null,
  );
  const [tripDraft, setTripDraft] = useState<TripDraft | null>(null);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [analysisOutput, setAnalysisOutput] = useState<GetOutputResponse | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalyzeTripResponse | null>(null);
  const [selectedAnalysisCategories, setSelectedAnalysisCategories] = useState<
    TripAnalysisCategory[]
  >([...ALL_TRIP_ANALYSIS_CATEGORIES]);
  const [assistantResponse, setAssistantResponse] =
    useState<PlanningAssistantResponse | null>(null);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [planningPageTab, setPlanningPageTab] = useState(
    persistedUiState?.planningPageTab ?? "list",
  );
  const [planningDetailTab, setPlanningDetailTab] = useState(
    persistedUiState?.planningDetailTab ?? "analysis",
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [commaInputs, setCommaInputs] = useState<CommaSeparatedInputs>(
    createCommaSeparatedInputs(),
  );
  const [tripNoteInput, setTripNoteInput] = useState("");
  const selectedTripIdRef = useRef<string | null>(persistedUiState?.selectedTripId ?? null);
  const planningLoadRequestIdRef = useRef(0);
  const analysisStatusRef = useRef<AnalyzeTripResponse | null>(null);
  const isCreatingTripRef = useRef(false);

  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
  }, [selectedTripId]);

  useEffect(() => {
    isCreatingTripRef.current = isCreatingTrip;
  }, [isCreatingTrip]);

  useEffect(() => {
    analysisStatusRef.current = analysisStatus;
  }, [analysisStatus]);

  return {
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
    commaInputs,
    setCommaInputs,
    tripNoteInput,
    setTripNoteInput,
    selectedTripIdRef,
    planningLoadRequestIdRef,
    analysisStatusRef,
    isCreatingTripRef,
  };
}
