import { useEffect, useMemo, useState } from "react";
import type { AnalyzeTripResponse, TripData, TripSummary } from "@camping/shared";
import { apiClient, ApiClientError } from "./api/client";
import { ResultPane } from "./components/ResultPane";
import { StatusBanner } from "./components/StatusBanner";
import { TripDetailCard } from "./components/TripDetailCard";
import { TripList } from "./components/TripList";

export function App() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveOutput, setSaveOutput] = useState(true);
  const [analysisResponse, setAnalysisResponse] =
    useState<AnalyzeTripResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadTrips() {
      setListLoading(true);
      setLoadError(null);

      try {
        const response = await apiClient.getTrips();

        if (!active) return;

        setTrips(response.items);
        setSelectedTripId((current) => current ?? response.items[0]?.trip_id ?? null);
      } catch (error) {
        if (!active) return;

        setLoadError(getErrorMessage(error));
      } finally {
        if (active) {
          setListLoading(false);
        }
      }
    }

    loadTrips();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTripId) {
      setSelectedTrip(null);
      setValidationWarnings([]);
      return;
    }

    const tripId = selectedTripId;
    let active = true;

    async function loadTripContext() {
      setDetailLoading(true);
      setLoadError(null);
      setAnalysisError(null);
      setSaveMessage(null);
      setAnalysisResponse(null);

      try {
        const [tripResponse, validationResponse] = await Promise.all([
          apiClient.getTrip(tripId),
          apiClient.validateTrip(tripId),
        ]);

        if (!active) return;

        setSelectedTrip(tripResponse.data);
        setValidationWarnings(validationResponse.warnings);
      } catch (error) {
        if (!active) return;

        setLoadError(getErrorMessage(error));
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    }

    loadTripContext();

    return () => {
      active = false;
    };
  }, [selectedTripId]);

  const tripSubtitle = useMemo(() => {
    if (!selectedTrip) {
      return "trip을 선택하면 요청 조건과 결과를 한 화면에서 확인할 수 있다.";
    }

    return `${selectedTrip.title} / ${selectedTrip.trip_id}`;
  }, [selectedTrip]);

  async function handleAnalyze() {
    if (!selectedTripId) return;

    setAnalyzing(true);
    setAnalysisError(null);
    setSaveMessage(null);

    try {
      const response = await apiClient.analyzeTrip({
        trip_id: selectedTripId,
        save_output: saveOutput,
      });
      setAnalysisResponse(response);

      if (response.output_path) {
        setSaveMessage(`결과를 ${response.output_path} 에 저장했다.`);
      }
    } catch (error) {
      setAnalysisError(getErrorMessage(error));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!analysisResponse?.markdown || !selectedTripId) return;

    setSaving(true);
    setSaveMessage(null);

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
            }
          : current,
      );
      setSaveMessage(`결과를 ${response.output_path} 에 저장했다.`);
    } catch (error) {
      setAnalysisError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero__copy">
          <div className="hero__eyebrow">Local-first Camping Planner</div>
          <h1>trip 파일 중심으로 바로 분석하는 로컬 캠핑 도구</h1>
          <p>{tripSubtitle}</p>
        </div>
        <div className="hero__meta">
          <div className="hero__meta-label">실행 경로</div>
          <code>.camping-data/trips/&lt;trip-id&gt;.yaml</code>
          <code>.camping-data/outputs/&lt;trip-id&gt;-plan.md</code>
        </div>
      </header>

      {loadError ? (
        <StatusBanner tone="error" title="초기 로딩 실패" description={loadError} />
      ) : null}

      <main className="workspace-grid">
        <TripList
          isLoading={listLoading}
          items={trips}
          onSelect={setSelectedTripId}
          selectedTripId={selectedTripId}
        />
        <TripDetailCard
          isAnalyzing={analyzing}
          isLoading={detailLoading}
          onAnalyze={handleAnalyze}
          onToggleSaveOutput={setSaveOutput}
          saveOutput={saveOutput}
          trip={selectedTrip}
          validationWarnings={validationWarnings}
        />
        <ResultPane
          errorMessage={analysisError}
          isAnalyzing={analyzing}
          isSaving={saving}
          onSave={handleSave}
          response={analysisResponse}
          saveMessage={saveMessage}
        />
      </main>
    </div>
  );
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
