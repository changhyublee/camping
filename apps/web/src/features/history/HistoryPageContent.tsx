import ReactMarkdown from "react-markdown";
import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import {
  HISTORY_DETAIL_TABS,
  HISTORY_DETAIL_TAB_LABELS,
  HISTORY_PAGE_TABS,
  HISTORY_PAGE_TAB_LABELS,
} from "../../app/ui-state";
import { StatusBanner } from "../../components/StatusBanner";
import { HistoryNotesEditorPanel, HistoryOverviewPanel, RetrospectiveEditorPanel } from "./panels";
import { AGE_GROUP_LABELS } from "@camping/shared";

export function HistoryPageContent(props: { view: AppViewModel }) {
  const {
    activeHistoryDetailPanelId,
    activeHistoryDetailTabId,
    activeHistoryPagePanelId,
    activeHistoryPageTabId,
    currentUserLearningStatusLabel,
    formatRelativeDate,
    handleAddRetrospective,
    handleDeleteHistory,
    handleOpenHistoryOutput,
    handleOpenHistoryOutputLayer,
    handleSaveHistory,
    history,
    historyDetailTab,
    historyEditorDraftRef,
    historyEditorResetVersion,
    historyLearningError,
    historyLearningInsight,
    historyLearningLoading,
    historyOutput,
    historyOutputError,
    historyOutputLoading,
    historyPageTab,
    isUserLearningPending,
    retrospectiveDraftRef,
    retrospectiveResetVersion,
    savingRetrospective,
    selectedHistory,
    selectedHistoryCompanionSnapshots,
    selectedHistoryId,
    selectedHistoryRetrospectives,
    selectedHistoryVehicle,
    setHistoryDetailTab,
    setHistoryPageTab,
    setSelectedHistoryId,
    userLearningProfile,
    userLearningStatus,
    resolveHistoryVehicleSnapshot,
    equipment,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">아카이브</div>
          <h2>캠핑 히스토리</h2>
          <p className="panel__copy">
            실제로 다녀온 캠핑 스냅샷, 후기, 누적 학습 결과를 한곳에서 정리합니다.
          </p>
        </div>
        <div className="page-intro__meta">
          <div className="meta-chip">
            <span>총 히스토리</span>
            <strong>{history.length}건</strong>
          </div>
          <div className="meta-chip">
            <span>차량 기록</span>
            <strong>{selectedHistoryVehicle?.name ?? "없음"}</strong>
          </div>
          <div className="meta-chip">
            <span>회고 엔트리</span>
            <strong>{selectedHistory?.retrospectives.length ?? 0}건</strong>
          </div>
          <div className="meta-chip">
            <span>학습 상태</span>
            <strong>{currentUserLearningStatusLabel}</strong>
          </div>
        </div>
      </section>

      <div aria-label="캠핑 히스토리 보기" className="detail-tabs" role="tablist">
        {HISTORY_PAGE_TABS.map((tab) => {
          const isActive = historyPageTab === tab;

          return (
            <button
              key={tab}
              aria-controls={isActive ? getDetailPanelId("history-page", tab) : undefined}
              aria-selected={isActive}
              className={detailTabClass(isActive)}
              id={getDetailTabId("history-page", tab)}
              onClick={() => setHistoryPageTab(tab)}
              onKeyDown={(event) =>
                handleDetailTabKeyDown(
                  event,
                  HISTORY_PAGE_TABS,
                  tab,
                  setHistoryPageTab,
                  "history-page",
                )
              }
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              {HISTORY_PAGE_TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby={activeHistoryPageTabId}
        className="detail-tab-panel"
        id={activeHistoryPagePanelId}
        role="tabpanel"
      >
        {historyPageTab === "list" ? (
          <section className="panel">
            <div className="panel__eyebrow">기록 목록</div>
            <div className="panel__header">
              <h2>캠핑 히스토리 목록</h2>
            </div>
            {history.length === 0 ? (
              <div className="empty-state">아직 아카이브된 히스토리가 없습니다.</div>
            ) : (
              <div className="stack-list">
                {history.map((item) => (
                  <button
                    key={item.history_id}
                    className={`list-card${
                      selectedHistoryId === item.history_id ? " list-card--active" : ""
                    }`}
                    onClick={() => {
                      setSelectedHistoryId(item.history_id);
                      setHistoryPageTab("details");
                    }}
                    type="button"
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {item.date?.start ?? "날짜 미입력"} / {item.location?.region ?? "지역 미입력"} /{" "}
                      {item.attendee_count ?? item.companion_ids.length}명 /{" "}
                      {resolveHistoryVehicleSnapshot(item)?.name ?? "차량 미기록"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {historyPageTab === "details" ? (
          <section className="panel">
            <div className="panel__eyebrow">기록 상세</div>
            <div className="panel__header">
              <h2>히스토리 상세</h2>
            </div>
            {selectedHistory ? (
              <div className="detail-shell">
                <div className="summary-grid summary-grid--compact detail-summary-grid">
                  {selectedHistoryCompanionSnapshots.length > 0 ? (
                    selectedHistoryCompanionSnapshots.map((companion) => (
                      <article className="summary-card" key={companion.id}>
                        <span>{companion.id}</span>
                        <strong>{companion.name}</strong>
                        <p className="panel__copy">
                          {AGE_GROUP_LABELS[companion.age_group]}
                          {companion.required_medications[0]
                            ? ` / 복용약 ${companion.required_medications[0]}`
                            : ""}
                        </p>
                      </article>
                    ))
                  ) : (
                    <article className="summary-card">
                      <span>동행자</span>
                      <strong>기록 없음</strong>
                    </article>
                  )}
                  <article className="summary-card">
                    <span>차량</span>
                    <strong>{selectedHistoryVehicle?.name ?? "기록 없음"}</strong>
                    <p className="panel__copy">
                      {selectedHistoryVehicle
                        ? `탑승 ${selectedHistoryVehicle.passenger_capacity ?? "미입력"}명 / 적재 ${
                            selectedHistoryVehicle.load_capacity_kg ?? "미입력"
                          }kg`
                        : "당시 사용 차량 정보가 기록되지 않았습니다."}
                    </p>
                  </article>
                  <article className="summary-card">
                    <span>회고 누적</span>
                    <strong>{selectedHistory.retrospectives.length}건</strong>
                    <p className="panel__copy">
                      사용 후기와 실제 행동을 누적 저장해 다음 계획에 자동 반영합니다.
                    </p>
                  </article>
                  <article className="summary-card">
                    <span>개인화 학습</span>
                    <strong>{currentUserLearningStatusLabel}</strong>
                    <p className="panel__copy">
                      {userLearningProfile
                        ? `전역 프로필 ${userLearningProfile.source_history_ids.length}건 / 회고 ${userLearningProfile.source_entry_count}건 반영`
                        : "아직 전역 개인화 프로필이 없습니다."}
                    </p>
                  </article>
                </div>

                {isUserLearningPending ? (
                  <StatusBanner
                    tone="info"
                    title="학습 업데이트 중"
                    description="회고를 바탕으로 이번 캠핑 학습과 전역 개인화 프로필을 다시 합성하고 있습니다."
                  />
                ) : null}
                {userLearningStatus.status === "failed" ? (
                  <StatusBanner
                    tone="error"
                    title="개인화 학습 실패"
                    description={
                      userLearningStatus.error?.message ??
                      "회고 기반 학습 결과를 다시 만들지 못했습니다."
                    }
                  />
                ) : null}

                <div aria-label="히스토리 상세 보기" className="detail-tabs" role="tablist">
                  {HISTORY_DETAIL_TABS.map((tab) => {
                    const isActive = historyDetailTab === tab;

                    return (
                      <button
                        key={tab}
                        aria-controls={isActive ? getDetailPanelId("history-detail", tab) : undefined}
                        aria-selected={isActive}
                        className={detailTabClass(isActive)}
                        id={getDetailTabId("history-detail", tab)}
                        onClick={() => setHistoryDetailTab(tab)}
                        onKeyDown={(event) =>
                          handleDetailTabKeyDown(
                            event,
                            HISTORY_DETAIL_TABS,
                            tab,
                            setHistoryDetailTab,
                            "history-detail",
                          )
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        {HISTORY_DETAIL_TAB_LABELS[tab]}
                      </button>
                    );
                  })}
                </div>

                <section
                  aria-labelledby={activeHistoryDetailTabId}
                  className="detail-tab-panel"
                  id={activeHistoryDetailPanelId}
                  role="tabpanel"
                >
                  {historyDetailTab === "overview" ? (
                    <HistoryOverviewPanel
                      draftRef={historyEditorDraftRef}
                      history={selectedHistory}
                      historyLearningInsight={historyLearningInsight}
                      onSave={handleSaveHistory}
                      resetVersion={historyEditorResetVersion}
                      userLearningProfile={userLearningProfile}
                    />
                  ) : null}

                  {historyDetailTab === "retrospective" ? (
                    <RetrospectiveEditorPanel
                      draftRef={retrospectiveDraftRef}
                      durableItems={equipment?.durable.items ?? []}
                      onSubmit={handleAddRetrospective}
                      resetVersion={retrospectiveResetVersion}
                      saving={savingRetrospective}
                    />
                  ) : null}

                  {historyDetailTab === "learning" ? (
                    <div className="detail-section-stack">
                      <section className="detail-section-card">
                        <div className="panel__eyebrow">회고 학습 결과</div>
                        {historyLearningLoading ? (
                          <div className="empty-state empty-state--compact">학습 결과를 불러오는 중입니다.</div>
                        ) : historyLearningError ? (
                          <StatusBanner
                            tone="warning"
                            title="이번 캠핑 학습 결과를 다시 읽지 못했습니다."
                            description={historyLearningError}
                          />
                        ) : historyLearningInsight ? (
                          <div className="stack-list">
                            <div className="action-card">
                              <strong>요약</strong>
                              <p>{historyLearningInsight.summary}</p>
                            </div>
                            {historyLearningInsight.behavior_patterns[0] ? (
                              <div className="action-card">
                                <strong>행동 패턴</strong>
                                <p>{historyLearningInsight.behavior_patterns.join(" / ")}</p>
                              </div>
                            ) : null}
                            {historyLearningInsight.equipment_hints[0] ? (
                              <div className="action-card">
                                <strong>장비 힌트</strong>
                                <p>{historyLearningInsight.equipment_hints.join(" / ")}</p>
                              </div>
                            ) : null}
                            {historyLearningInsight.meal_hints[0] ? (
                              <div className="action-card">
                                <strong>식단 힌트</strong>
                                <p>{historyLearningInsight.meal_hints.join(" / ")}</p>
                              </div>
                            ) : null}
                            {historyLearningInsight.route_hints[0] ? (
                              <div className="action-card">
                                <strong>이동 힌트</strong>
                                <p>{historyLearningInsight.route_hints.join(" / ")}</p>
                              </div>
                            ) : null}
                            {historyLearningInsight.campsite_hints[0] ? (
                              <div className="action-card">
                                <strong>현장 힌트</strong>
                                <p>{historyLearningInsight.campsite_hints.join(" / ")}</p>
                              </div>
                            ) : null}
                            {historyLearningInsight.next_trip_focus[0] ? (
                              <div className="action-card">
                                <strong>다음 계획 포커스</strong>
                                <p>{historyLearningInsight.next_trip_focus.join(" / ")}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="empty-state empty-state--compact">아직 이번 캠핑 학습 결과가 없습니다.</div>
                        )}
                      </section>

                      <section className="detail-section-card">
                        <div className="panel__eyebrow">전역 개인화 학습 요약</div>
                        {userLearningProfile ? (
                          <div className="stack-list">
                            <div className="action-card">
                              <strong>요약</strong>
                              <p>{userLearningProfile.summary}</p>
                            </div>
                            {userLearningProfile.behavior_patterns[0] ? (
                              <div className="action-card">
                                <strong>행동 패턴</strong>
                                <p>{userLearningProfile.behavior_patterns.join(" / ")}</p>
                              </div>
                            ) : null}
                            {userLearningProfile.equipment_hints[0] ? (
                              <div className="action-card">
                                <strong>장비 힌트</strong>
                                <p>{userLearningProfile.equipment_hints.join(" / ")}</p>
                              </div>
                            ) : null}
                            {userLearningProfile.meal_hints[0] ? (
                              <div className="action-card">
                                <strong>식단 힌트</strong>
                                <p>{userLearningProfile.meal_hints.join(" / ")}</p>
                              </div>
                            ) : null}
                            {userLearningProfile.route_hints[0] ? (
                              <div className="action-card">
                                <strong>이동 힌트</strong>
                                <p>{userLearningProfile.route_hints.join(" / ")}</p>
                              </div>
                            ) : null}
                            {userLearningProfile.campsite_hints[0] ? (
                              <div className="action-card">
                                <strong>현장 힌트</strong>
                                <p>{userLearningProfile.campsite_hints.join(" / ")}</p>
                              </div>
                            ) : null}
                            {userLearningProfile.next_trip_focus[0] ? (
                              <div className="action-card">
                                <strong>다음 계획 포커스</strong>
                                <p>{userLearningProfile.next_trip_focus.join(" / ")}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="empty-state empty-state--compact">아직 전역 개인화 학습 프로필이 없습니다.</div>
                        )}
                      </section>
                    </div>
                  ) : null}

                  {historyDetailTab === "records" ? (
                    <div className="detail-section-stack">
                      <section className="detail-section-card">
                        <div className="panel__eyebrow">회고 엔트리 목록</div>
                        {selectedHistoryRetrospectives.length > 0 ? (
                          <div className="stack-list">
                            {selectedHistoryRetrospectives.map((entry) => (
                              <article className="action-card" key={entry.entry_id}>
                                <strong>
                                  {formatRelativeDate(entry.created_at)}
                                  {typeof entry.overall_satisfaction === "number"
                                    ? ` / 만족도 ${entry.overall_satisfaction}점`
                                    : ""}
                                </strong>
                                <p>
                                  사용 장비:{" "}
                                  {entry.used_durable_item_ids.length > 0
                                    ? entry.used_durable_item_ids.join(", ")
                                    : "기록 없음"}
                                </p>
                                {entry.missing_or_needed_items[0] ? (
                                  <p>부족/필요: {entry.missing_or_needed_items.join(" / ")}</p>
                                ) : null}
                                {entry.issues[0] ? <p>이슈: {entry.issues.join(" / ")}</p> : null}
                                {entry.next_time_requests[0] ? (
                                  <p>다음 요청: {entry.next_time_requests.join(" / ")}</p>
                                ) : null}
                                {entry.freeform_note ? <p>{entry.freeform_note}</p> : null}
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state empty-state--compact">아직 남겨진 회고 엔트리가 없습니다.</div>
                        )}
                      </section>

                      <section className="detail-section-card history-output-card">
                        <div className="history-output-card__header">
                          <div>
                            <strong>저장된 분석 결과</strong>
                            <p>
                              {selectedHistory.output_path
                                ? "아카이브 당시 저장된 Markdown 결과를 다시 열 수 있습니다."
                                : "이 히스토리에는 저장된 분석 결과 경로가 없습니다."}
                            </p>
                          </div>
                          <div className="history-output-card__actions">
                            <button
                              className="button"
                              disabled={!selectedHistory.output_path || historyOutputLoading}
                              onClick={handleOpenHistoryOutput}
                              type="button"
                            >
                              {historyOutputLoading ? "불러오는 중..." : "결과 열기"}
                            </button>
                            {historyOutput?.markdown ? (
                              <button className="button" onClick={handleOpenHistoryOutputLayer} type="button">
                                넓게 보기
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {selectedHistory.output_path ? (
                          <code className="output-path">{selectedHistory.output_path}</code>
                        ) : (
                          <div className="empty-state empty-state--compact">
                            저장된 결과 문서가 없으면 여기서 다시 열 수 없습니다.
                          </div>
                        )}
                        {historyOutputError ? (
                          <StatusBanner
                            tone="error"
                            title="결과 문서를 불러오지 못했습니다."
                            description={historyOutputError}
                          />
                        ) : null}
                        {historyOutput ? (
                          <article className="markdown-pane markdown-pane--compact">
                            <ReactMarkdown>{historyOutput.markdown}</ReactMarkdown>
                          </article>
                        ) : null}
                      </section>

                      <section className="detail-section-card">
                        <HistoryNotesEditorPanel
                          draftRef={historyEditorDraftRef}
                          history={selectedHistory}
                          onDelete={() => handleDeleteHistory(selectedHistory.history_id)}
                          onSave={handleSaveHistory}
                          resetVersion={historyEditorResetVersion}
                        />
                      </section>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : (
              <div className="empty-state">왼쪽에서 히스토리를 선택하세요.</div>
            )}
          </section>
        ) : null}
      </section>
    </section>
  );
}
