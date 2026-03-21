import type { TripData } from "@camping/shared";
import { StatusBanner } from "./StatusBanner";

type TripDetailCardProps = {
  trip: TripData | null;
  validationWarnings: string[];
  isLoading: boolean;
  isAnalyzing: boolean;
  saveOutput: boolean;
  onToggleSaveOutput: (checked: boolean) => void;
  onAnalyze: () => void;
};

function formatBool(value?: boolean) {
  if (value === true) return "가능";
  if (value === false) return "불가";
  return "미입력";
}

export function TripDetailCard({
  trip,
  validationWarnings,
  isLoading,
  isAnalyzing,
  saveOutput,
  onToggleSaveOutput,
  onAnalyze,
}: TripDetailCardProps) {
  return (
    <section className="panel">
      <div className="panel__eyebrow">Trip Detail</div>
      <div className="panel__header">
        <h2>요청 상세와 검증</h2>
      </div>

      {isLoading ? (
        <div className="empty-state">trip 상세를 불러오는 중...</div>
      ) : trip ? (
        <>
          <div className="trip-detail">
            <div className="trip-detail__row">
              <span>제목</span>
              <strong>{trip.title}</strong>
            </div>
            <div className="trip-detail__row">
              <span>일정</span>
              <strong>
                {trip.date?.start ?? "미입력"} ~ {trip.date?.end ?? "미입력"}
              </strong>
            </div>
            <div className="trip-detail__row">
              <span>장소</span>
              <strong>
                {trip.location?.campsite_name ?? "미입력"} /{" "}
                {trip.location?.region ?? "미입력"}
              </strong>
            </div>
            <div className="trip-detail__row">
              <span>동행자</span>
              <strong>{trip.party.companion_ids.join(", ")}</strong>
            </div>
            <div className="trip-detail__row">
              <span>전기 사용</span>
              <strong>{formatBool(trip.conditions?.electricity_available)}</strong>
            </div>
            <div className="trip-detail__row">
              <span>취사 가능</span>
              <strong>{formatBool(trip.conditions?.cooking_allowed)}</strong>
            </div>
          </div>

          {validationWarnings.length > 0 ? (
            <StatusBanner
              tone="warning"
              title="분석 경고"
              description="분석은 가능하지만 정확도나 범위 제한이 있다."
              items={validationWarnings}
            />
          ) : (
            <StatusBanner
              tone="success"
              title="검증 완료"
              description="현재 trip 입력은 v1 분석 기준을 만족한다."
            />
          )}

          <div className="action-row">
            <label className="checkbox-row">
              <input
                checked={saveOutput}
                onChange={(event) => onToggleSaveOutput(event.target.checked)}
                type="checkbox"
              />
              저장 후 실행
            </label>
            <button
              className="button button--primary"
              disabled={isAnalyzing}
              onClick={onAnalyze}
              type="button"
            >
              {isAnalyzing ? "분석 중..." : "분석 실행"}
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">왼쪽에서 trip을 선택해야 상세를 볼 수 있다.</div>
      )}
    </section>
  );
}
