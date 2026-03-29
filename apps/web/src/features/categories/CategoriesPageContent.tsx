import { EQUIPMENT_SECTION_LABELS } from "@camping/shared";
import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import {
  CATEGORY_DETAIL_TABS,
  CATEGORY_DETAIL_TAB_LABELS,
  CATEGORY_PAGE_TABS,
  CATEGORY_PAGE_TAB_LABELS,
  EQUIPMENT_SECTIONS,
} from "../../app/ui-state";
import { FormField } from "../shared/ui";

export function CategoriesPageContent(props: { view: AppViewModel }) {
  const {
    activeCategoryDetailPanelId,
    activeCategoryDetailTabId,
    activeCategoryPagePanelId,
    activeCategoryPageTabId,
    categoryDetailTab,
    categoryDrafts,
    categoryLabelDrafts,
    categoryPageTab,
    collapsedCategoryEditors,
    creatingDataBackup,
    currentEquipmentSectionLabel,
    equipmentCategories,
    equipmentMetrics,
    equipmentSection,
    expandedCategorySectionCount,
    expandedCategorySections,
    handleCreateDataBackup,
    handleCreateEquipmentCategory,
    handleDeleteEquipmentCategory,
    handleSaveEquipmentCategory,
    handleToggleCategoryEditor,
    handleToggleCategorySection,
    setCategoryDetailTab,
    setCategoryDrafts,
    setCategoryLabelDrafts,
    setCategoryPageTab,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">운영 설정</div>
          <h2>카테고리 설정</h2>
          <p className="panel__copy">
            장비 섹션별 카테고리 기준을 한곳에서 관리하고, 필요한 순간에는 같은 화면에서
            로컬 운영 데이터 백업까지 실행합니다.
          </p>
        </div>
        <div className="page-intro__meta">
          <div className="meta-chip">
            <span>입력 대상 섹션</span>
            <strong>{currentEquipmentSectionLabel}</strong>
          </div>
          <div className="meta-chip">
            <span>열린 섹션</span>
            <strong>{expandedCategorySectionCount === 0 ? "없음" : `${expandedCategorySectionCount}개`}</strong>
          </div>
          <div className="meta-chip">
            <span>총 카테고리 수</span>
            <strong>{equipmentMetrics.categories}개</strong>
          </div>
          <div className="meta-chip">
            <span>백업 실행</span>
            <strong>{creatingDataBackup ? "진행 중" : "가능"}</strong>
          </div>
        </div>
      </section>

      <div aria-label="카테고리 설정 보기" className="detail-tabs" role="tablist">
        {CATEGORY_PAGE_TABS.map((tab) => {
          const isActive = categoryPageTab === tab;

          return (
            <button
              key={tab}
              aria-controls={isActive ? getDetailPanelId("category-page", tab) : undefined}
              aria-selected={isActive}
              className={detailTabClass(isActive)}
              id={getDetailTabId("category-page", tab)}
              onClick={() => setCategoryPageTab(tab)}
              onKeyDown={(event) =>
                handleDetailTabKeyDown(
                  event,
                  CATEGORY_PAGE_TABS,
                  tab,
                  setCategoryPageTab,
                  "category-page",
                )
              }
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              {CATEGORY_PAGE_TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby={activeCategoryPageTabId}
        className="detail-tab-panel"
        id={activeCategoryPagePanelId}
        role="tabpanel"
      >
        {categoryPageTab === "list" ? (
          <section className="panel">
            <div className="panel__eyebrow">카테고리</div>
            <div className="panel__header">
              <h2>장비 카테고리 관리</h2>
              <span className="pill">{equipmentMetrics.categories}개</span>
            </div>
            <p className="panel__copy">
              장비 화면에서는 여기서 정한 카테고리만 선택합니다. 섹션 메뉴를 눌러 목록을
              펼치고 닫을 수 있으며, 카테고리 코드는 내부 식별값으로 유지합니다.
            </p>
            <div className="stack-list">
              {EQUIPMENT_SECTIONS.map((section) => {
                const sectionCategories = equipmentCategories[section];
                const sectionLabel = EQUIPMENT_SECTION_LABELS[section];
                const isExpanded = expandedCategorySections.includes(section);
                const sectionPanelId = `category-section-panel-${section}`;

                return (
                  <article className="equipment-category-card category-settings-section" key={section}>
                    <button
                      aria-controls={sectionPanelId}
                      aria-expanded={isExpanded}
                      aria-label={`${sectionLabel} 섹션 ${isExpanded ? "접기" : "펼치기"}`}
                      className="equipment-category-toggle category-settings-section__toggle"
                      onClick={() => handleToggleCategorySection(section)}
                      type="button"
                    >
                      <span className="equipment-category-toggle__content">
                        <span className="equipment-category-toggle__eyebrow">카테고리 섹션</span>
                        <strong>{sectionLabel}</strong>
                        <span>
                          {sectionCategories.length === 0
                            ? "등록된 카테고리 없음"
                            : `${sectionCategories.length}개 카테고리`}
                        </span>
                      </span>
                      <span className="category-settings-section__meta">
                        {equipmentSection === section ? <span className="pill">입력 대상</span> : null}
                        <span className="equipment-category-toggle__state">
                          {isExpanded ? "접기" : "펼치기"}
                        </span>
                      </span>
                    </button>

                    {isExpanded ? (
                      <div className="category-settings-section__body" id={sectionPanelId}>
                        {sectionCategories.length === 0 ? (
                          <div className="empty-state">이 섹션에 등록된 카테고리가 없습니다.</div>
                        ) : (
                          <div className="stack-list">
                            {sectionCategories.map((category) => {
                              const editorPanelId = `category-editor-panel-${section}-${category.id}`;
                              const isCollapsed = collapsedCategoryEditors[section].includes(category.id);
                              const draftLabel = categoryLabelDrafts[section][category.id] ?? category.label;
                              const accessibleLabel = draftLabel.trim() || category.label;

                              return (
                                <article className="edit-card category-editor-card" key={category.id}>
                                  <button
                                    aria-controls={editorPanelId}
                                    aria-expanded={!isCollapsed}
                                    aria-label={`${accessibleLabel} 카테고리 설정 ${isCollapsed ? "펼치기" : "접기"}`}
                                    className="category-editor-toggle"
                                    onClick={() => handleToggleCategoryEditor(section, category.id)}
                                    type="button"
                                  >
                                    <span className="category-editor-toggle__content">
                                      <span className="category-editor-toggle__eyebrow">카테고리 설정</span>
                                      <strong>{draftLabel}</strong>
                                      <code>{category.id}</code>
                                    </span>
                                    <span className="category-editor-toggle__state">
                                      {isCollapsed ? "펼치기" : "접기"}
                                    </span>
                                  </button>

                                  {!isCollapsed ? (
                                    <div className="category-editor-body" id={editorPanelId}>
                                      <div className="form-grid">
                                        <FormField label="표시 이름">
                                          <input
                                            placeholder="카테고리 표시 이름"
                                            value={draftLabel}
                                            onChange={(event) =>
                                              setCategoryLabelDrafts((current) => ({
                                                ...current,
                                                [section]: {
                                                  ...current[section],
                                                  [category.id]: event.target.value,
                                                },
                                              }))
                                            }
                                          />
                                        </FormField>
                                        <FormField label="카테고리 코드">
                                          <input value={category.id} readOnly />
                                        </FormField>
                                      </div>
                                      <div className="button-row">
                                        <button
                                          className="button"
                                          onClick={() => void handleSaveEquipmentCategory(section, category.id)}
                                          type="button"
                                        >
                                          저장
                                        </button>
                                        <button
                                          className="button"
                                          onClick={() => void handleDeleteEquipmentCategory(section, category.id)}
                                          type="button"
                                        >
                                          삭제
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {categoryPageTab === "details" ? (
          <section className="panel categories-side-stack detail-panel">
            <div className="panel__eyebrow">보조 작업</div>
            <div className="panel__header">
              <h2>카테고리 상세</h2>
            </div>
            <div className="detail-shell">
              <div className="summary-grid summary-grid--compact detail-summary-grid">
                <article className="summary-card">
                  <span>입력 대상</span>
                  <strong>{currentEquipmentSectionLabel}</strong>
                  <p className="panel__copy">새 카테고리는 현재 선택된 장비 섹션에 추가됩니다.</p>
                </article>
                <article className="summary-card">
                  <span>총 카테고리 수</span>
                  <strong>{equipmentMetrics.categories}개</strong>
                  <p className="panel__copy">장비 전 섹션 기준 카테고리 총합입니다.</p>
                </article>
                <article className="summary-card">
                  <span>백업 상태</span>
                  <strong>{creatingDataBackup ? "진행 중" : "가능"}</strong>
                  <p className="panel__copy">큰 수정 전 현재 로컬 운영 데이터를 수동 백업할 수 있습니다.</p>
                </article>
              </div>

              <div aria-label="카테고리 상세 보기" className="detail-tabs" role="tablist">
                {CATEGORY_DETAIL_TABS.map((tab) => {
                  const isActive = categoryDetailTab === tab;

                  return (
                    <button
                      key={tab}
                      aria-controls={isActive ? getDetailPanelId("category-detail", tab) : undefined}
                      aria-selected={isActive}
                      className={detailTabClass(isActive)}
                      id={getDetailTabId("category-detail", tab)}
                      onClick={() => setCategoryDetailTab(tab)}
                      onKeyDown={(event) =>
                        handleDetailTabKeyDown(
                          event,
                          CATEGORY_DETAIL_TABS,
                          tab,
                          setCategoryDetailTab,
                          "category-detail",
                        )
                      }
                      role="tab"
                      tabIndex={isActive ? 0 : -1}
                      type="button"
                    >
                      {CATEGORY_DETAIL_TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>

              <section
                aria-labelledby={activeCategoryDetailTabId}
                className="detail-tab-panel"
                id={activeCategoryDetailPanelId}
                role="tabpanel"
              >
                {categoryDetailTab === "create" ? (
                  <>
                    <div className="section-label">
                      <strong>새 카테고리 추가</strong>
                      <p>
                        카테고리 코드는 자동 생성하지 않습니다. 영문 소문자, 숫자, 하이픈(-),
                        밑줄(_) 형식으로 직접 입력합니다.
                      </p>
                    </div>
                    <div className="form-grid">
                      <FormField label="적용 섹션">
                        <input value={EQUIPMENT_SECTION_LABELS[equipmentSection]} readOnly />
                      </FormField>
                      <FormField label="카테고리 코드">
                        <input
                          placeholder="예: tarp"
                          value={categoryDrafts[equipmentSection].id ?? ""}
                          onChange={(event) =>
                            setCategoryDrafts((current) => ({
                              ...current,
                              [equipmentSection]: {
                                ...current[equipmentSection],
                                id: event.target.value,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField full label="표시 이름">
                        <input
                          className="form-grid__full"
                          placeholder="예: 수납"
                          value={categoryDrafts[equipmentSection].label}
                          onChange={(event) =>
                            setCategoryDrafts((current) => ({
                              ...current,
                              [equipmentSection]: {
                                ...current[equipmentSection],
                                label: event.target.value,
                              },
                            }))
                          }
                        />
                      </FormField>
                      <button
                        className="button button--primary form-grid__full"
                        onClick={() => void handleCreateEquipmentCategory(equipmentSection)}
                        type="button"
                      >
                        카테고리 추가
                      </button>
                    </div>
                  </>
                ) : null}

                {categoryDetailTab === "guidelines" ? (
                  <>
                    <div className="section-label">
                      <strong>관리 원칙</strong>
                      <p>카테고리 코드는 내부 기준값이므로 읽기 쉬운 표시 이름과 구분해 관리합니다.</p>
                    </div>
                    <ul className="detail-list">
                      <li>표시 이름은 사용자가 보는 라벨입니다.</li>
                      <li>카테고리 코드는 영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 허용됩니다.</li>
                      <li>이미 사용 중이거나 마지막 남은 카테고리는 삭제가 제한됩니다.</li>
                    </ul>
                  </>
                ) : null}

                {categoryDetailTab === "backup" ? (
                  <>
                    <div className="section-label">
                      <strong>로컬 운영 데이터 백업</strong>
                      <p>
                        현재 camping-data 폴더 상태를 camping-backups 아래에 시점별로 수동
                        백업합니다. 큰 수정 전에 현재 상태를 남길 때 사용합니다.
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        className="button button--primary"
                        disabled={creatingDataBackup}
                        onClick={() => void handleCreateDataBackup()}
                        type="button"
                      >
                        {creatingDataBackup ? "백업 생성 중..." : "지금 백업 생성"}
                      </button>
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
