import ReactMarkdown from "react-markdown";
import { TRIP_ANALYSIS_CATEGORY_METADATA } from "@camping/shared";
import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import {
  PLANNING_DETAIL_TABS,
  PLANNING_DETAIL_TAB_LABELS,
} from "../../app/ui-state";
import { StatusBanner } from "../../components/StatusBanner";

export function PlanningDetailsPanel(props: { view: AppViewModel }) {
  const {
    activePlanningDetailPanelId,
    activePlanningDetailTabId,
    analysisCategoryStatuses,
    analysisOutput,
    analysisStatus,
    assistantInput,
    assistantLoading,
    assistantResponse,
    clearAnalysisCategorySelection,
    completedAnalysisCategoryCount,
    currentUserLearningStatusLabel,
    formatRelativeDate,
    getTripAnalysisStatusLabel,
    handleAnalyzeAll,
    handleAnalyzeSelected,
    handleApplyAssistantAction,
    handleAssistantSubmit,
    handleOpenAnalysisLayer,
    handleRefreshAnalysisCategory,
    isPendingAnalysisStatus,
    isUserLearningPending,
    planningDetailTab,
    selectedAnalysisCategories,
    selectedTripId,
    selectAllAnalysisCategories,
    setAssistantInput,
    setPlanningDetailTab,
    toggleAnalysisCategorySelection,
    userLearningProfile,
    userLearningStatus,
  } = props.view;

  return (
    <section className="panel planning-side-stack detail-panel">
      <div className="panel__eyebrow">상세 보기</div>
      <div className="panel__header">
        <h2>AI 보조와 분석</h2>
      </div>
      <div className="detail-shell">
        <div className="summary-grid summary-grid--compact detail-summary-grid">
          <article className="summary-card">
            <span>누적 학습</span>
            <strong>{currentUserLearningStatusLabel}</strong>
            <p className="panel__copy">
              {userLearningProfile
                ? `히스토리 ${userLearningProfile.source_history_ids.length}건 / 회고 ${userLearningProfile.source_entry_count}건 반영`
                : "아직 누적 회고 학습 프로필이 없습니다."}
            </p>
          </article>
          <article className="summary-card">
            <span>AI 보조</span>
            <strong>
              {!selectedTripId ? "저장 필요" : assistantLoading ? "응답 생성 중" : assistantResponse ? "응답 있음" : "대기"}
            </strong>
            <p className="panel__copy">저장된 계획을 기준으로 질문하고, 필요한 제안만 직접 반영합니다.</p>
          </article>
          <article className="summary-card">
            <span>분석 상태</span>
            <strong>{getTripAnalysisStatusLabel(analysisStatus?.status ?? "idle")}</strong>
            <p className="panel__copy">
              {selectedTripId
                ? `섹션 ${completedAnalysisCategoryCount}/${analysisCategoryStatuses.length}개 완료`
                : "저장된 계획을 선택하면 분석 상태를 보여 줍니다."}
            </p>
          </article>
        </div>

        {isUserLearningPending ? (
          <StatusBanner
            tone="info"
            title="개인화 학습 업데이트 중"
            description="최신 회고를 반영해 다음 계획 힌트를 다시 합성하고 있습니다."
          />
        ) : null}
        {userLearningStatus.status === "failed" ? (
          <StatusBanner
            tone="error"
            title="개인화 학습 실패"
            description={userLearningStatus.error?.message ?? "회고 학습 결과를 다시 만들지 못했습니다."}
          />
        ) : null}
        {analysisStatus?.status === "queued" || analysisStatus?.status === "running" ? (
          <StatusBanner
            tone="info"
            title="백그라운드 분석 진행 중"
            description="선택한 섹션을 순차적으로 수집 중입니다. 완료될 때마다 최신 Markdown을 자동으로 다시 불러옵니다."
          />
        ) : null}
        {analysisStatus?.status === "failed" ? (
          <StatusBanner
            tone="error"
            title="분석 실패"
            description={analysisStatus.error?.message ?? "백그라운드 분석 작업이 실패했습니다."}
          />
        ) : null}
        {analysisStatus?.status === "interrupted" ? (
          <StatusBanner
            tone="warning"
            title="분석 중단"
            description={analysisStatus.error?.message ?? "이전 분석 작업이 중단되었습니다. 다시 실행해 주세요."}
          />
        ) : null}
        {analysisStatus?.status === "completed" && !analysisOutput?.markdown ? (
          <StatusBanner
            tone="warning"
            title="결과 동기화 대기"
            description="분석은 끝났지만 결과 Markdown을 아직 다시 불러오지 못했습니다."
          />
        ) : null}

        <div aria-label="계획 상세 보기" className="detail-tabs" role="tablist">
          {PLANNING_DETAIL_TABS.map((tab) => {
            const isActive = planningDetailTab === tab;

            return (
              <button
                key={tab}
                aria-controls={isActive ? getDetailPanelId("planning-detail", tab) : undefined}
                aria-selected={isActive}
                className={detailTabClass(isActive)}
                id={getDetailTabId("planning-detail", tab)}
                onClick={() => setPlanningDetailTab(tab)}
                onKeyDown={(event) =>
                  handleDetailTabKeyDown(
                    event,
                    PLANNING_DETAIL_TABS,
                    tab,
                    setPlanningDetailTab,
                    "planning-detail",
                  )
                }
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {PLANNING_DETAIL_TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        <section
          aria-labelledby={activePlanningDetailTabId}
          className="detail-tab-panel"
          id={activePlanningDetailPanelId}
          role="tabpanel"
        >
          {planningDetailTab === "learning" ? (
            <>
              <div className="section-label">
                <strong>개인화 학습 요약</strong>
                <p>히스토리 회고가 누적될수록 다음 계획과 AI 보조에 자동 반영됩니다.</p>
              </div>
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
                  {userLearningProfile.next_trip_focus[0] ? (
                    <div className="action-card">
                      <strong>다음 계획 포커스</strong>
                      <p>{userLearningProfile.next_trip_focus.join(" / ")}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="empty-state empty-state--compact">
                  히스토리 상세에서 실제 후기와 회고를 쌓으면 여기에 개인화 학습 요약이 표시됩니다.
                </div>
              )}
            </>
          ) : null}

          {planningDetailTab === "assistant" ? (
            <>
              <div className="stack-list usage-guide-list">
                <div className="action-card">
                  <strong>AI 보조는 저장 후 질문할 때 사용</strong>
                  <p>분석 전에 빠진 정보, 장비 보강 포인트, 먼저 수정할 항목을 확인할 때 사용합니다.</p>
                </div>
                <div className="action-card">
                  <strong>AI 제안은 자동 반영되지 않음</strong>
                  <p>제안과 실제 저장을 분리해, 사용자가 확인한 액션만 명시적으로 반영합니다.</p>
                </div>
              </div>

              {selectedTripId ? (
                <>
                  <div className="section-label">
                    <strong>AI 보조</strong>
                    <p>저장된 계획을 기준으로 먼저 물어보고, 필요한 제안만 직접 반영합니다.</p>
                  </div>
                  <div className="assistant-box">
                    <textarea
                      placeholder="예: 빠진 준비물이 있는지 먼저 점검해줘. 비 예보와 아이 동행 기준으로 알려줘"
                      value={assistantInput}
                      onChange={(event) => setAssistantInput(event.target.value)}
                    />
                    <button
                      className="button button--primary"
                      disabled={assistantLoading}
                      onClick={handleAssistantSubmit}
                      type="button"
                    >
                      {assistantLoading ? "응답 생성 중..." : "AI에게 물어보기"}
                    </button>
                  </div>

                  {assistantResponse ? (
                    <>
                      <StatusBanner
                        tone="info"
                        title="AI 보조 응답"
                        description="제안은 자동 반영되지 않으며, 아래 액션을 눌러야 실제 파일이 수정됩니다."
                        items={assistantResponse.warnings}
                      />
                      <article className="markdown-pane markdown-pane--compact">
                        <ReactMarkdown>{assistantResponse.assistant_message}</ReactMarkdown>
                      </article>
                      <div className="stack-list">
                        {assistantResponse.actions.map((action) => (
                          <div className="action-card" key={action.id}>
                            <strong>{action.title}</strong>
                            <p>{action.reason}</p>
                            <button className="button" onClick={() => handleApplyAssistantAction(action)} type="button">
                              제안 반영
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">AI 보조는 저장된 계획에서만 실행할 수 있습니다.</div>
              )}
            </>
          ) : null}

          {planningDetailTab === "analysis" ? (
            selectedTripId ? (
              <>
                <div className="detail-tab-panel__header">
                  <div className="section-label section-label--analysis">
                    <strong>섹션별 분석</strong>
                    <p>필요한 섹션만 먼저 수집하고, 누적된 결과를 하나의 Markdown 플랜으로 계속 합성합니다.</p>
                  </div>
                  {analysisOutput?.markdown ? (
                    <button className="button" onClick={handleOpenAnalysisLayer} type="button">
                      넓게 보기
                    </button>
                  ) : null}
                </div>
                <div className="analysis-category-summary">
                  <div className="meta-chip">
                    <span>전체 섹션</span>
                    <strong>{analysisCategoryStatuses.length}개</strong>
                  </div>
                  <div className="meta-chip">
                    <span>수집 완료</span>
                    <strong>{completedAnalysisCategoryCount}개</strong>
                  </div>
                  <div className="meta-chip">
                    <span>선택 상태</span>
                    <strong>{selectedAnalysisCategories.length}개 선택</strong>
                  </div>
                </div>
                <div className="analysis-category-toolbar">
                  <div className="button-row">
                    <button className="button" onClick={selectAllAnalysisCategories} type="button">
                      전체 선택
                    </button>
                    <button className="button" onClick={clearAnalysisCategorySelection} type="button">
                      선택 해제
                    </button>
                    <button
                      className="button"
                      disabled={selectedAnalysisCategories.length === 0}
                      onClick={handleAnalyzeSelected}
                      type="button"
                    >
                      선택 수집
                    </button>
                    <button className="button button--primary" onClick={handleAnalyzeAll} type="button">
                      전체 실행
                    </button>
                  </div>
                </div>
                <div className="analysis-category-list">
                  {analysisCategoryStatuses.map((categoryStatus) => {
                    const metadata = TRIP_ANALYSIS_CATEGORY_METADATA[categoryStatus.category];
                    const isSelected = selectedAnalysisCategories.includes(categoryStatus.category);
                    const isCategoryPending = isPendingAnalysisStatus(categoryStatus.status);

                    return (
                      <article className="analysis-category-card" key={categoryStatus.category}>
                        <div className="analysis-category-card__header">
                          <label className="analysis-category-card__toggle">
                            <input
                              checked={isSelected}
                              onChange={() => toggleAnalysisCategorySelection(categoryStatus.category)}
                              type="checkbox"
                            />
                            <span>
                              <strong>{metadata.label}</strong>
                              <span>{metadata.summary}</span>
                            </span>
                          </label>
                          <div className="analysis-category-card__meta">
                            <span className={`analysis-status-chip analysis-status-chip--${categoryStatus.status}`}>
                              {getTripAnalysisStatusLabel(categoryStatus.status)}
                            </span>
                            <button
                              className="button"
                              disabled={isCategoryPending}
                              onClick={() => handleRefreshAnalysisCategory(categoryStatus.category)}
                              type="button"
                            >
                              {categoryStatus.has_result ? "재수집" : "이 섹션 수집"}
                            </button>
                          </div>
                        </div>
                        <div className="analysis-category-card__body">
                          <p>
                            섹션: {metadata.sections.map((section) => `${section.order}. ${section.title}`).join(", ")}
                          </p>
                          <p>
                            마지막 수집:{" "}
                            {categoryStatus.collected_at
                              ? formatRelativeDate(categoryStatus.collected_at)
                              : "아직 없음"}
                          </p>
                          {categoryStatus.error ? (
                            <p className="analysis-category-card__error">{categoryStatus.error.message}</p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {analysisOutput?.markdown ? (
                  <article className="markdown-pane">
                    <ReactMarkdown>{analysisOutput.markdown}</ReactMarkdown>
                  </article>
                ) : (
                  <div className="empty-state">
                    계획 저장 후 섹션을 선택해 수집하면, 누적된 최종 Markdown 플랜이 여기에 표시됩니다.
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">분석은 저장된 계획에서만 실행할 수 있습니다.</div>
            )
          ) : null}
        </section>
      </div>
    </section>
  );
}
