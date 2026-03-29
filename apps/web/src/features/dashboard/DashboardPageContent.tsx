import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import { DASHBOARD_PAGE_TABS, DASHBOARD_PAGE_TAB_LABELS } from "../../app/ui-state";
import { MetricCard } from "../shared/ui";

export function DashboardPageContent(props: { view: AppViewModel }) {
  const {
    dashboardAlerts,
    dashboardMetrics,
    dashboardPageTab,
    history,
    linkGroups,
    selectedTripSummary,
    setActivePage,
    setDashboardPageTab,
    setEquipmentPageTab,
    setHistoryPageTab,
    setLinkPageTab,
    setPlanningPageTab,
    setSelectedHistoryId,
    trips,
    activeDashboardPagePanelId,
    activeDashboardPageTabId,
    selectTrip,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro page-intro--dashboard panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">운영 허브</div>
          <h2>대시보드</h2>
          <p className="panel__copy">
            오늘 필요한 상태만 먼저 훑고, 계획 작성이나 장비 점검 같은 다음 작업으로
            바로 넘어갈 수 있게 정리했습니다.
          </p>
        </div>
        <div className="page-intro__meta page-intro__meta--three">
          <div className="meta-chip">
            <span>현재 선택 계획</span>
            <strong>{selectedTripSummary?.title ?? "없음"}</strong>
          </div>
          <div className="meta-chip">
            <span>경고 항목</span>
            <strong>{dashboardAlerts.length}건</strong>
          </div>
          <div className="meta-chip">
            <span>링크 그룹</span>
            <strong>{linkGroups.length}개</strong>
          </div>
        </div>
      </section>

      <div aria-label="대시보드 보기" className="detail-tabs" role="tablist">
        {DASHBOARD_PAGE_TABS.map((tab) => {
          const isActive = dashboardPageTab === tab;

          return (
            <button
              key={tab}
              aria-controls={isActive ? getDetailPanelId("dashboard-page", tab) : undefined}
              aria-selected={isActive}
              className={detailTabClass(isActive)}
              id={getDetailTabId("dashboard-page", tab)}
              onClick={() => setDashboardPageTab(tab)}
              onKeyDown={(event) =>
                handleDetailTabKeyDown(
                  event,
                  DASHBOARD_PAGE_TABS,
                  tab,
                  setDashboardPageTab,
                  "dashboard-page",
                )
              }
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              {DASHBOARD_PAGE_TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby={activeDashboardPageTabId}
        className="detail-tab-panel"
        id={activeDashboardPagePanelId}
        role="tabpanel"
      >
        {dashboardPageTab === "overview" ? (
          <>
            <section className="panel dashboard-grid__feature">
              <div className="panel__eyebrow">운영 요약</div>
              <div className="panel__header">
                <h2>운영 현황</h2>
              </div>
              <div className="metric-grid metric-grid--feature">
                <MetricCard label="예정 계획" value={`${dashboardMetrics.trips}건`} />
                <MetricCard label="히스토리" value={`${dashboardMetrics.history}건`} />
                <MetricCard label="점검/재고 경고" value={`${dashboardMetrics.alerts}건`} />
                <MetricCard label="외부 링크" value={`${dashboardMetrics.links}건`} />
              </div>
            </section>

            <div className="panel-stack">
              <section className="panel">
                <div className="panel__eyebrow">예정 계획</div>
                <div className="panel__header">
                  <h2>곧 실행할 계획</h2>
                </div>
                {trips.length === 0 ? (
                  <div className="empty-state empty-state--compact">
                    아직 등록된 캠핑 계획이 없습니다.
                  </div>
                ) : (
                  <div className="stack-list">
                    {trips.slice(0, 4).map((trip) => (
                      <button
                        key={trip.trip_id}
                        className="list-card"
                        onClick={() => {
                          setActivePage("planning");
                          setPlanningPageTab("editor");
                          selectTrip(trip.trip_id);
                        }}
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
                <div className="panel__eyebrow">점검 경고</div>
                <div className="panel__header">
                  <h2>점검 경고</h2>
                </div>
                {dashboardAlerts.length === 0 ? (
                  <div className="empty-state empty-state--compact">
                    현재 확인이 필요한 장비 경고가 없습니다.
                  </div>
                ) : (
                  <ul className="detail-list">
                    {dashboardAlerts.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}

        {dashboardPageTab === "links" ? (
          <div className="panel-stack">
            <section className="panel">
              <div className="panel__eyebrow">최근 기록</div>
              <div className="panel__header">
                <h2>최근 히스토리</h2>
              </div>
              {history.length === 0 ? (
                <div className="empty-state empty-state--compact">
                  아직 아카이브된 캠핑 히스토리가 없습니다.
                </div>
              ) : (
                <div className="stack-list">
                  {history.slice(0, 4).map((item) => (
                    <button
                      key={item.history_id}
                      className="list-card"
                      onClick={() => {
                        setActivePage("history");
                        setHistoryPageTab("details");
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

            <section className="panel">
              <div className="panel__eyebrow">링크 현황</div>
              <div className="panel__header">
                <h2>외부 링크 요약</h2>
              </div>
              {linkGroups.length === 0 ? (
                <div className="empty-state empty-state--compact">
                  등록된 외부 링크가 없습니다.
                </div>
              ) : (
                <div className="stack-list">
                  {linkGroups.slice(0, 4).map((group) => (
                    <article className="summary-card" key={group.category}>
                      <strong>{group.label}</strong>
                      <span>{group.items.length}개 링크</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {dashboardPageTab === "actions" ? (
          <div className="panel-stack">
            <section className="panel">
              <div className="panel__eyebrow">빠른 작업</div>
              <div className="panel__header">
                <h2>빠른 이동</h2>
              </div>
              <div className="stack-list">
                <button
                  className="list-card"
                  onClick={() => {
                    setActivePage("planning");
                    setPlanningPageTab("list");
                  }}
                  type="button"
                >
                  <strong>캠핑 계획 열기</strong>
                  <span>저장된 계획을 편집하거나 분석을 다시 실행합니다.</span>
                </button>
                <button
                  className="list-card"
                  onClick={() => {
                    setActivePage("equipment");
                    setEquipmentPageTab("list");
                  }}
                  type="button"
                >
                  <strong>장비 점검으로 이동</strong>
                  <span>재고와 출발 전 점검 상태를 바로 수정합니다.</span>
                </button>
                <button
                  className="list-card"
                  onClick={() => {
                    setActivePage("links");
                    setLinkPageTab("list");
                  }}
                  type="button"
                >
                  <strong>외부 링크 정리</strong>
                  <span>날씨, 장소, 맛집 링크를 카테고리별로 관리합니다.</span>
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </section>
  );
}
