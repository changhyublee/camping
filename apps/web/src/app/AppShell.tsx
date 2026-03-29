import { useEffect } from "react";
import { InfoTooltip } from "../components/InfoTooltip";
import { MarkdownLayer } from "../components/MarkdownLayer";
import { SidebarNavButton } from "../components/SidebarNavButton";
import { StatusBanner } from "../components/StatusBanner";
import { CategoriesPage } from "../pages/CategoriesPage";
import { CompanionsPage } from "../pages/CompanionsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { EquipmentPage } from "../pages/EquipmentPage";
import { HelpPage } from "../pages/HelpPage";
import { HistoryPage } from "../pages/HistoryPage";
import { LinksPage } from "../pages/LinksPage";
import { PlanningPage } from "../pages/PlanningPage";
import { VehiclesPage } from "../pages/VehiclesPage";
import {
  NAVIGATION_GROUPS,
  getPageForPathname,
  getPathForPage,
} from "./navigation";
import { useAppViewModel } from "./useAppViewModel";

export function AppShell() {
  const initialPage =
    typeof window === "undefined" ? undefined : getPageForPathname(window.location.pathname);
  const view = useAppViewModel(initialPage);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = () => {
      view.setActivePage(getPageForPathname(window.location.pathname), {
        syncHistory: false,
      });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [view.setActivePage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextPath = getPathForPage(view.activePage);

    if (window.location.pathname !== nextPath) {
      window.history.replaceState(null, "", nextPath);
    }
  }, [view.activePage]);

  return (
    <div className="app-shell">
      {view.loadError ? (
        <StatusBanner tone="error" title="초기 로딩 실패" description={view.loadError} />
      ) : null}

      {view.bannerState ? (
        <StatusBanner
          tone={view.bannerState.tone}
          title={view.bannerState.title}
          description={view.bannerState.description}
          items={view.bannerState.items}
          onDismiss={() => view.setBannerState(null)}
        />
      ) : null}

      {view.operationState ? (
        <div className="floating-status-layer">
          <StatusBanner
            tone={view.operationState.tone}
            title={view.operationState.title}
            description={view.operationState.description}
            items={view.operationState.items}
            onDismiss={() => view.setOperationState(null)}
            variant="floating"
          />
        </div>
      ) : null}

      {view.markdownLayer ? (
        <MarkdownLayer
          description={view.markdownLayer.description}
          eyebrow={view.markdownLayer.eyebrow}
          markdown={view.markdownLayer.markdown}
          outputPath={view.markdownLayer.outputPath}
          title={view.markdownLayer.title}
          onClose={() => view.setMarkdownLayer(null)}
        />
      ) : null}

      <div className="app-layout">
        <aside className="side-nav panel panel--nav">
          <div className="panel__eyebrow">메뉴</div>
          <div className="nav-overview">
            <strong>읽기 쉬운 작업 흐름</strong>
            <p>
              메뉴를 운영 허브, 준비 데이터, 관리 설정으로 나눠 지금 해야 할 일과
              기준 데이터를 분리했습니다.
            </p>
          </div>
          <nav className="nav-sections" aria-label="주 메뉴">
            {NAVIGATION_GROUPS.map((group) => (
              <section className="nav-section" key={group.title}>
                <div className="nav-section__header">
                  <div className="nav-section__heading">
                    <span className="nav-section__title">{group.title}</span>
                    <InfoTooltip text={group.description} />
                    <span className="sr-only">{group.description}</span>
                  </div>
                </div>
                <div className="nav-list">
                  {group.items.includes("dashboard")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "dashboard"}
                          description="예정 계획, 최근 기록, 점검 경고를 먼저 확인합니다."
                          meta={`예정 ${view.dashboardMetrics.trips}건 · 경고 ${view.dashboardMetrics.alerts}건`}
                          onClick={() => view.handleSidebarPageChange("dashboard")}
                          page="dashboard"
                        />
                      )
                    : null}
                  {group.items.includes("planning")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "planning"}
                          description="trip 원본 입력, AI 보조, 분석을 한 흐름으로 진행합니다."
                          meta={`선택 ${view.currentTripLabel} · 검증 ${view.validationWarnings.length}건`}
                          onClick={() => view.handleSidebarPageChange("planning")}
                          page="planning"
                        />
                      )
                    : null}
                  {group.items.includes("history")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "history"}
                          description="완료된 계획과 저장된 결과를 다시 열어봅니다."
                          meta={`기록 ${view.dashboardMetrics.history}건 · 현재 ${view.currentHistoryLabel}`}
                          onClick={() => view.handleSidebarPageChange("history")}
                          page="history"
                        />
                      )
                    : null}
                  {group.items.includes("companions")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "companions"}
                          description="캠핑 인원 프로필을 미리 등록하고 계획에서는 선택만 합니다."
                          meta={`등록 ${view.dashboardMetrics.companions}명`}
                          onClick={() => view.handleSidebarPageChange("companions")}
                          page="companions"
                        />
                      )
                    : null}
                  {group.items.includes("vehicles")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "vehicles"}
                          description="차량 정보를 미리 저장하고 계획에서는 차량만 선택합니다."
                          meta={`등록 ${view.dashboardMetrics.vehicles}대`}
                          onClick={() => view.handleSidebarPageChange("vehicles")}
                          page="vehicles"
                        />
                      )
                    : null}
                  {group.items.includes("equipment")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "equipment"}
                          description="보유 장비, 소모품, 출발 전 점검을 같은 구조로 관리합니다."
                          meta={`항목 ${
                            view.equipmentMetrics.durable +
                            view.equipmentMetrics.consumables +
                            view.equipmentMetrics.precheck
                          }개 · 경고 ${view.dashboardMetrics.alerts}건`}
                          onClick={() => view.handleSidebarPageChange("equipment")}
                          page="equipment"
                        />
                      )
                    : null}
                  {group.items.includes("links")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "links"}
                          description="날씨, 장소, 맛집 같은 참고 링크를 카테고리별로 정리합니다."
                          meta={`링크 ${view.dashboardMetrics.links}건 · 그룹 ${view.linkGroups.length}개`}
                          onClick={() => view.handleSidebarPageChange("links")}
                          page="links"
                        />
                      )
                    : null}
                  {group.items.includes("categories")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "categories"}
                          description="장비 카테고리 기준과 로컬 백업을 관리합니다."
                          meta={`카테고리 ${view.equipmentMetrics.categories}개`}
                          onClick={() => view.handleSidebarPageChange("categories")}
                          page="categories"
                        />
                      )
                    : null}
                  {group.items.includes("help")
                    ? (
                        <SidebarNavButton
                          active={view.activePage === "help"}
                          description="주 작업 파일, 결과 파일, 보조 설명을 따로 모아 봅니다."
                          meta={`trip ${view.selectedTripId ? "선택됨" : "없음"} · 결과 ${
                            view.currentAnalysisOutputPath
                              ? view.isAnalysisPending
                                ? "분석 중"
                                : "연결됨"
                              : view.isAnalysisPending
                                ? "분석 중"
                                : "대기"
                          }`}
                          onClick={() => view.handleSidebarPageChange("help")}
                          page="help"
                        />
                      )
                    : null}
                </div>
              </section>
            ))}
          </nav>
          <div className="nav-actions">
            <button className="button button--primary" onClick={view.beginCreateTrip} type="button">
              새 캠핑 계획
            </button>
            <button
              className="button button--danger"
              disabled={view.stoppingAllAiJobs}
              onClick={view.handleCancelAllAiJobs}
              type="button"
            >
              {view.stoppingAllAiJobs ? "중단 처리 중..." : "모든 AI 요청 중단"}
            </button>
            <div className="nav-note nav-note--danger">
              <strong>AI 수집 초기화</strong>
              <span>
                실행 중인 분석과 장비 메타데이터 수집을 모두 멈추고 남아 있는
                대기 queue를 정리합니다.
              </span>
            </div>
          </div>
        </aside>

        <main className="content-panel">
          {view.appLoading
            ? (
                <section className="panel empty-state">
                  초기 데이터를 불러오는 중입니다.
                </section>
              )
            : renderActivePage(view.activePage, view)}
        </main>
      </div>
    </div>
  );
}

function renderActivePage(
  activePage: ReturnType<typeof useAppViewModel>["activePage"],
  view: ReturnType<typeof useAppViewModel>,
) {
  switch (activePage) {
    case "dashboard":
      return <DashboardPage view={view} />;
    case "planning":
      return <PlanningPage view={view} />;
    case "history":
      return <HistoryPage view={view} />;
    case "companions":
      return <CompanionsPage view={view} />;
    case "vehicles":
      return <VehiclesPage view={view} />;
    case "equipment":
      return <EquipmentPage view={view} />;
    case "links":
      return <LinksPage view={view} />;
    case "categories":
      return <CategoriesPage view={view} />;
    case "help":
      return <HelpPage view={view} />;
    default:
      return <DashboardPage view={view} />;
  }
}
