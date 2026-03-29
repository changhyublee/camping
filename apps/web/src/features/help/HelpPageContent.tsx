import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import { HELP_PAGE_TABS, HELP_PAGE_TAB_LABELS } from "../../app/ui-state";

export function HelpPageContent(props: { view: AppViewModel }) {
  const {
    activeHelpPagePanelId,
    activeHelpPageTabId,
    currentAnalysisOutputPath,
    helpPageTab,
    selectedHistoryId,
    selectedTripId,
    setHelpPageTab,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">보조 설명</div>
          <h2>작업 파일과 생성 결과 안내</h2>
          <p className="panel__copy">
            메인 작업 흐름을 방해하지 않도록 파일 경로와 생성 규칙 같은 설명성 정보는 이
            화면에만 모았습니다.
          </p>
        </div>
        <div className="page-intro__meta page-intro__meta--three">
          <div className="meta-chip">
            <span>현재 계획 파일</span>
            <strong>
              {selectedTripId
                ? `.camping-data/trips/${selectedTripId}.yaml`
                : ".camping-data/trips/<trip-id>.yaml"}
            </strong>
          </div>
          <div className="meta-chip">
            <span>결과 Markdown</span>
            <strong>{currentAnalysisOutputPath ?? "분석 실행 후 생성"}</strong>
          </div>
          <div className="meta-chip">
            <span>히스토리 파일</span>
            <strong>
              {selectedHistoryId
                ? `.camping-data/history/${selectedHistoryId}.yaml`
                : ".camping-data/history/<history-id>.yaml"}
            </strong>
          </div>
        </div>
      </section>

      <section className="page-stack">
        <div aria-label="보조 설명 보기" className="detail-tabs" role="tablist">
          {HELP_PAGE_TABS.map((tab) => {
            const isActive = helpPageTab === tab;

            return (
              <button
                key={tab}
                aria-controls={isActive ? getDetailPanelId("help-page", tab) : undefined}
                aria-selected={isActive}
                className={detailTabClass(isActive)}
                id={getDetailTabId("help-page", tab)}
                onClick={() => setHelpPageTab(tab)}
                onKeyDown={(event) =>
                  handleDetailTabKeyDown(
                    event,
                    HELP_PAGE_TABS,
                    tab,
                    setHelpPageTab,
                    "help-page",
                  )
                }
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {HELP_PAGE_TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        <section
          aria-labelledby={activeHelpPageTabId}
          className="detail-tab-panel"
          id={activeHelpPagePanelId}
          role="tabpanel"
        >
          {helpPageTab === "files" ? (
            <section className="panel">
              <div className="panel__eyebrow">주 작업 파일</div>
              <div className="panel__header">
                <h2>기준 파일 안내</h2>
              </div>
              <div className="stack-list">
                <article className="action-card">
                  <strong>주 작업 파일</strong>
                  <code className="output-path">
                    {selectedTripId
                      ? `.camping-data/trips/${selectedTripId}.yaml`
                      : ".camping-data/trips/<trip-id>.yaml"}
                  </code>
                  <p>캠핑 계획 저장 시 갱신되는 원본 입력 파일입니다.</p>
                </article>
                <article className="action-card">
                  <strong>결과 파일</strong>
                  <code className="output-path">{currentAnalysisOutputPath ?? "분석 실행 후 생성"}</code>
                  <p>분석 실행 후 저장되는 Markdown 결과 문서입니다.</p>
                </article>
                <article className="action-card">
                  <strong>히스토리 파일</strong>
                  <code className="output-path">
                    {selectedHistoryId
                      ? `.camping-data/history/${selectedHistoryId}.yaml`
                      : ".camping-data/history/<history-id>.yaml"}
                  </code>
                  <p>계획을 아카이브하면 당시 스냅샷과 메모가 이 파일에 저장됩니다.</p>
                </article>
              </div>
            </section>
          ) : null}

          {helpPageTab === "guide" ? (
            <div className="panel-stack">
              <section className="panel">
                <div className="panel__eyebrow">생성 규칙</div>
                <div className="panel__header">
                  <h2>언제 무엇이 만들어지나</h2>
                </div>
                <ul className="detail-list">
                  <li>계획 저장 시 trips 폴더의 YAML 원본이 갱신됩니다.</li>
                  <li>분석 실행 후 outputs 폴더에 Markdown 결과가 생성되거나 덮어써집니다.</li>
                  <li>히스토리로 이동하면 history 폴더에 당시 스냅샷이 저장됩니다.</li>
                </ul>
              </section>

              <section className="panel">
                <div className="panel__eyebrow">운영 메모</div>
                <div className="panel__header">
                  <h2>참고 사항</h2>
                </div>
                <div className="stack-list">
                  <article className="summary-card">
                    <strong>사람/차량 관리</strong>
                    <span>준비 데이터에서 미리 입력하고 계획에서는 선택만 합니다.</span>
                  </article>
                  <article className="summary-card">
                    <strong>히스토리 스냅샷</strong>
                    <span>아카이브 시점의 동행자/차량 요약이 함께 저장됩니다.</span>
                  </article>
                  <article className="summary-card">
                    <strong>보조 설명 위치</strong>
                    <span>경로, 생성 규칙 같은 정보는 이 메뉴에서만 확인합니다.</span>
                  </article>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </section>
    </section>
  );
}
