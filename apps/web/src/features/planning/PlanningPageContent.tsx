import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import {
  PLANNING_PAGE_TABS,
  PLANNING_PAGE_TAB_LABELS,
} from "../../app/ui-state";
import { PlanningDetailsPanel, PlanningEditorPanel } from "./PlanningPanels";

export function PlanningPageContent(props: { view: AppViewModel }) {
  const {
    activePlanningPagePanelId,
    activePlanningPageTabId,
    beginCreateTrip,
    currentUserLearningStatusLabel,
    isCreatingTrip,
    planningPageTab,
    selectedTripCompanions,
    selectedTripId,
    selectedTripVehicle,
    selectTrip,
    setPlanningPageTab,
    trips,
    validationWarnings,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">실행 흐름</div>
          <h2>캠핑 계획</h2>
          <p className="panel__copy">
            계획 원본 입력, AI 보조, 분석 결과를 한 흐름 안에서 이어서 다룹니다.
          </p>
        </div>
        <div className="page-intro__meta">
          <div className="meta-chip">
            <span>선택된 계획</span>
            <strong>{props.view.formatCompactTripId(selectedTripId) ?? "새 초안"}</strong>
          </div>
          <div className="meta-chip">
            <span>검증 경고</span>
            <strong>{validationWarnings.length}건</strong>
          </div>
          <div className="meta-chip">
            <span>선택 동행자</span>
            <strong>{selectedTripCompanions.length}명</strong>
          </div>
          <div className="meta-chip">
            <span>선택 차량</span>
            <strong>{selectedTripVehicle?.name ?? "미선택"}</strong>
          </div>
        </div>
      </section>

      <div aria-label="캠핑 계획 보기" className="detail-tabs" role="tablist">
        {PLANNING_PAGE_TABS.map((tab) => {
          const isActive = planningPageTab === tab;

          return (
            <button
              key={tab}
              aria-controls={isActive ? getDetailPanelId("planning-page", tab) : undefined}
              aria-selected={isActive}
              className={detailTabClass(isActive)}
              id={getDetailTabId("planning-page", tab)}
              onClick={() => setPlanningPageTab(tab)}
              onKeyDown={(event) =>
                handleDetailTabKeyDown(
                  event,
                  PLANNING_PAGE_TABS,
                  tab,
                  setPlanningPageTab,
                  "planning-page",
                )
              }
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              {PLANNING_PAGE_TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby={activePlanningPageTabId}
        className="detail-tab-panel"
        id={activePlanningPagePanelId}
        role="tabpanel"
      >
        {planningPageTab === "list" ? (
          <section className="panel">
            <div className="panel__eyebrow">계획 목록</div>
            <div className="panel__header">
              <h2>캠핑 계획 목록</h2>
              <span className="pill">{trips.length}건</span>
            </div>
            <div className="stack-list">
              <button
                className="button"
                onClick={() => {
                  beginCreateTrip();
                  setPlanningPageTab("editor");
                }}
                type="button"
              >
                새 계획 작성
              </button>
              {trips.map((trip) => (
                <button
                  key={trip.trip_id}
                  className={`list-card${
                    selectedTripId === trip.trip_id && !isCreatingTrip ? " list-card--active" : ""
                  }`}
                  onClick={() => {
                    selectTrip(trip.trip_id);
                    setPlanningPageTab("editor");
                  }}
                  type="button"
                >
                  <strong>{trip.title}</strong>
                  <span>{trip.start_date ?? "날짜 미입력"} / {trip.region ?? "지역 미입력"}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {planningPageTab === "editor" ? <PlanningEditorPanel view={props.view} /> : null}
        {planningPageTab === "details" ? <PlanningDetailsPanel view={props.view} /> : null}
      </section>
    </section>
  );
}
