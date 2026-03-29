import { DURABLE_STATUS_LABELS, EQUIPMENT_SECTION_LABELS, PRECHECK_STATUS_LABELS, type DurableEquipmentItem, type PrecheckItem } from "@camping/shared";
import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, equipmentTabClass, getDetailPanelId, getDetailTabId, getEquipmentSectionPanelId, getEquipmentSectionTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import {
  EQUIPMENT_DETAIL_TABS,
  EQUIPMENT_DETAIL_TAB_LABELS,
  EQUIPMENT_PAGE_TABS,
  EQUIPMENT_PAGE_TAB_LABELS,
  EQUIPMENT_SECTIONS,
} from "../../app/ui-state";
import { ConsumableList, EquipmentCategorySelect, EquipmentList, PrecheckList } from "./panels";
import { FormField, MetricCard } from "../shared/ui";

export function EquipmentPageContent(props: { view: AppViewModel }) {
  const {
    activeEquipmentDetailPanelId,
    activeEquipmentDetailTabId,
    activeEquipmentPagePanelId,
    activeEquipmentPageTabId,
    activeEquipmentPanelId,
    activeEquipmentTabId,
    consumableDraft,
    currentEquipmentCategories,
    currentEquipmentSectionLabel,
    dashboardMetrics,
    durableDraft,
    durableMetadataJobStatuses,
    equipment,
    equipmentCategories,
    equipmentCategorySelectionDrafts,
    equipmentDetailTab,
    equipmentMetrics,
    equipmentPageTab,
    equipmentSection,
    expandedEquipmentItems,
    collapsedEquipmentCategories,
    handleChangeEquipmentItemCategory,
    handleCreateEquipmentItem,
    handleDeleteEquipmentItem,
    handleEquipmentTabKeyDown,
    handleRefreshDurableMetadata,
    handleSaveEquipmentItem,
    handleToggleEquipmentCategory,
    handleToggleEquipmentItem,
    precheckDraft,
    refreshingDurableMetadataIds,
    setConsumableDraft,
    setDurableDraft,
    setEquipment,
    setEquipmentDetailTab,
    setEquipmentPageTab,
    setEquipmentSection,
    setPrecheckDraft,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">준비 데이터</div>
          <h2>장비 점검과 재고 관리</h2>
          <p className="panel__copy">
            반복 장비, 소모품, 출발 전 점검을 같은 읽기 흐름으로 보고 현재 상태를 먼저
            파악한 뒤 필요한 항목만 펼쳐 수정합니다.
          </p>
        </div>
        <div className="page-intro__meta">
          <div className="meta-chip">
            <span>반복 장비</span>
            <strong>{equipmentMetrics.durable}개</strong>
          </div>
          <div className="meta-chip">
            <span>소모품</span>
            <strong>{equipmentMetrics.consumables}개</strong>
          </div>
          <div className="meta-chip">
            <span>점검 항목</span>
            <strong>{equipmentMetrics.precheck}개</strong>
          </div>
          <div className="meta-chip">
            <span>경고</span>
            <strong>{equipmentMetrics.alerts}건</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__eyebrow">장비 개요</div>
        <div className="panel__header">
          <h2>섹션 전환</h2>
        </div>
        <p className="panel__copy">
          반복 장비, 소모품, 출발 전 점검을 같은 위치에서 전환해 흐름을 유지합니다.
        </p>
        <div className="metric-grid metric-grid--compact">
          <MetricCard label="반복 장비" value={`${equipmentMetrics.durable}개`} />
          <MetricCard label="소모품" value={`${equipmentMetrics.consumables}개`} />
          <MetricCard label="출발 전 점검" value={`${equipmentMetrics.precheck}개`} />
          <MetricCard label="카테고리" value={`${equipmentMetrics.categories}개`} />
        </div>
        <div aria-label="장비 섹션" className="equipment-tabs" role="tablist">
          {EQUIPMENT_SECTIONS.map((section) => {
            const isActive = equipmentSection === section;

            return (
              <button
                key={section}
                aria-controls={getEquipmentSectionPanelId(section)}
                aria-selected={isActive}
                className={equipmentTabClass(isActive)}
                id={getEquipmentSectionTabId(section)}
                onClick={() => setEquipmentSection(section)}
                onKeyDown={(event) => handleEquipmentTabKeyDown(event, section)}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {EQUIPMENT_SECTION_LABELS[section]}
              </button>
            );
          })}
        </div>
      </section>

      <div aria-label="장비 관리 보기" className="detail-tabs" role="tablist">
        {EQUIPMENT_PAGE_TABS.map((tab) => {
          const isActive = equipmentPageTab === tab;

          return (
            <button
              key={tab}
              aria-controls={isActive ? getDetailPanelId("equipment-page", tab) : undefined}
              aria-selected={isActive}
              className={detailTabClass(isActive)}
              id={getDetailTabId("equipment-page", tab)}
              onClick={() => setEquipmentPageTab(tab)}
              onKeyDown={(event) =>
                handleDetailTabKeyDown(
                  event,
                  EQUIPMENT_PAGE_TABS,
                  tab,
                  setEquipmentPageTab,
                  "equipment-page",
                )
              }
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              {EQUIPMENT_PAGE_TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby={activeEquipmentPageTabId}
        className="detail-tab-panel"
        id={activeEquipmentPagePanelId}
        role="tabpanel"
      >
        <section
          aria-labelledby={activeEquipmentTabId}
          className="equipment-tab-panel equipment-workspace"
          id={activeEquipmentPanelId}
          role="tabpanel"
        >
          {equipmentPageTab === "list" ? (
            <section className="panel">
              <div className="panel__eyebrow">목록</div>
              <div className="panel__header">
                <h2>{`${currentEquipmentSectionLabel} 목록`}</h2>
              </div>

              {equipmentSection === "durable" ? (
                <EquipmentList
                  section="durable"
                  categoryDrafts={equipmentCategorySelectionDrafts.durable}
                  categories={equipmentCategories.durable}
                  collapsedCategoryIds={collapsedEquipmentCategories.durable}
                  expandedItemIds={expandedEquipmentItems.durable}
                  items={equipment?.durable.items ?? []}
                  metadataJobStatuses={durableMetadataJobStatuses}
                  refreshingMetadataIds={refreshingDurableMetadataIds}
                  onDelete={(itemId) => handleDeleteEquipmentItem("durable", itemId)}
                  onRefreshMetadata={(itemId) => handleRefreshDurableMetadata(itemId)}
                  onSave={(itemId) => handleSaveEquipmentItem("durable", itemId)}
                  onToggleCategory={(categoryId) => handleToggleEquipmentCategory("durable", categoryId)}
                  onToggleItem={(itemId) => handleToggleEquipmentItem("durable", itemId)}
                  onCategoryChange={(itemId, categoryId) =>
                    handleChangeEquipmentItemCategory("durable", itemId, categoryId)
                  }
                  onChange={(itemId, updater) =>
                    setEquipment((current) =>
                      current
                        ? {
                            ...current,
                            durable: {
                              ...current.durable,
                              items: current.durable.items.map((item) =>
                                item.id === itemId ? updater(item) : item,
                              ),
                            },
                          }
                        : current,
                    )
                  }
                />
              ) : null}

              {equipmentSection === "consumables" ? (
                <ConsumableList
                  section="consumables"
                  categoryDrafts={equipmentCategorySelectionDrafts.consumables}
                  categories={equipmentCategories.consumables}
                  collapsedCategoryIds={collapsedEquipmentCategories.consumables}
                  expandedItemIds={expandedEquipmentItems.consumables}
                  items={equipment?.consumables.items ?? []}
                  onDelete={(itemId) => handleDeleteEquipmentItem("consumables", itemId)}
                  onSave={(itemId) => handleSaveEquipmentItem("consumables", itemId)}
                  onToggleCategory={(categoryId) => handleToggleEquipmentCategory("consumables", categoryId)}
                  onToggleItem={(itemId) => handleToggleEquipmentItem("consumables", itemId)}
                  onCategoryChange={(itemId, categoryId) =>
                    handleChangeEquipmentItemCategory("consumables", itemId, categoryId)
                  }
                  onChange={(itemId, updater) =>
                    setEquipment((current) =>
                      current
                        ? {
                            ...current,
                            consumables: {
                              ...current.consumables,
                              items: current.consumables.items.map((item) =>
                                item.id === itemId ? updater(item) : item,
                              ),
                            },
                          }
                        : current,
                    )
                  }
                />
              ) : null}

              {equipmentSection === "precheck" ? (
                <PrecheckList
                  section="precheck"
                  categoryDrafts={equipmentCategorySelectionDrafts.precheck}
                  categories={equipmentCategories.precheck}
                  collapsedCategoryIds={collapsedEquipmentCategories.precheck}
                  expandedItemIds={expandedEquipmentItems.precheck}
                  items={equipment?.precheck.items ?? []}
                  onDelete={(itemId) => handleDeleteEquipmentItem("precheck", itemId)}
                  onSave={(itemId) => handleSaveEquipmentItem("precheck", itemId)}
                  onToggleCategory={(categoryId) => handleToggleEquipmentCategory("precheck", categoryId)}
                  onToggleItem={(itemId) => handleToggleEquipmentItem("precheck", itemId)}
                  onCategoryChange={(itemId, categoryId) =>
                    handleChangeEquipmentItemCategory("precheck", itemId, categoryId)
                  }
                  onChange={(itemId, updater) =>
                    setEquipment((current) =>
                      current
                        ? {
                            ...current,
                            precheck: {
                              ...current.precheck,
                              items: current.precheck.items.map((item) =>
                                item.id === itemId ? updater(item) : item,
                              ),
                            },
                          }
                        : current,
                    )
                  }
                />
              ) : null}
            </section>
          ) : null}

          {equipmentPageTab === "details" ? (
            <section className="panel equipment-side-stack detail-panel">
              <div className="panel__eyebrow">현재 섹션</div>
              <div className="panel__header">
                <h2>{currentEquipmentSectionLabel} 상세</h2>
              </div>
              <div className="detail-shell">
                <div className="summary-grid summary-grid--compact detail-summary-grid">
                  <article className="summary-card">
                    <span>현재 선택 섹션</span>
                    <strong>{currentEquipmentSectionLabel}</strong>
                    <p className="panel__copy">현재 보고 있는 장비 섹션 기준으로 작업합니다.</p>
                  </article>
                  <article className="summary-card">
                    <span>카테고리 수</span>
                    <strong>{currentEquipmentCategories.length}개</strong>
                    <p className="panel__copy">선택한 섹션에 연결된 카테고리 수입니다.</p>
                  </article>
                  <article className="summary-card">
                    <span>점검 경고</span>
                    <strong>{dashboardMetrics.alerts}건</strong>
                    <p className="panel__copy">소모품 부족과 출발 전 점검 경고를 함께 봅니다.</p>
                  </article>
                </div>

                <div aria-label="장비 상세 보기" className="detail-tabs" role="tablist">
                  {EQUIPMENT_DETAIL_TABS.map((tab) => {
                    const isActive = equipmentDetailTab === tab;

                    return (
                      <button
                        key={tab}
                        aria-controls={isActive ? getDetailPanelId("equipment-detail", tab) : undefined}
                        aria-selected={isActive}
                        className={detailTabClass(isActive)}
                        id={getDetailTabId("equipment-detail", tab)}
                        onClick={() => setEquipmentDetailTab(tab)}
                        onKeyDown={(event) =>
                          handleDetailTabKeyDown(
                            event,
                            EQUIPMENT_DETAIL_TABS,
                            tab,
                            setEquipmentDetailTab,
                            "equipment-detail",
                          )
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        {EQUIPMENT_DETAIL_TAB_LABELS[tab]}
                      </button>
                    );
                  })}
                </div>

                <section
                  aria-labelledby={activeEquipmentDetailTabId}
                  className="detail-tab-panel"
                  id={activeEquipmentDetailPanelId}
                  role="tabpanel"
                >
                  {equipmentDetailTab === "summary" ? (
                    <>
                      <div className="section-label">
                        <strong>{currentEquipmentSectionLabel} 작업 요약</strong>
                        <p>
                          현재 섹션의 카테고리 수는 {currentEquipmentCategories.length}개이며,
                          왼쪽 목록에서 항목을 펼쳐 수정할 수 있습니다.
                        </p>
                      </div>
                      <div className="stack-list">
                        <article className="summary-card">
                          <strong>현재 선택 섹션</strong>
                          <span>{currentEquipmentSectionLabel}</span>
                        </article>
                        <article className="summary-card">
                          <strong>카테고리 수</strong>
                          <span>{currentEquipmentCategories.length}개</span>
                        </article>
                        <article className="summary-card">
                          <strong>점검 경고</strong>
                          <span>{dashboardMetrics.alerts}건</span>
                        </article>
                      </div>
                    </>
                  ) : null}

                  {equipmentDetailTab === "create" ? (
                    <>
                      <div className="section-label">
                        <strong>{`${currentEquipmentSectionLabel} 추가`}</strong>
                        <p>현재 선택된 섹션 기준으로 새 항목을 바로 추가합니다.</p>
                      </div>
                      {equipmentSection === "durable" ? (
                        <div className="form-grid">
                          <FormField label="장비명">
                            <input
                              placeholder="예: 3계절 침낭"
                              value={durableDraft.name}
                              onChange={(event) =>
                                setDurableDraft((current) => ({ ...current, name: event.target.value }))
                              }
                            />
                          </FormField>
                          <FormField label="모델명">
                            <input
                              placeholder="예: 머미형 800g"
                              value={durableDraft.model ?? ""}
                              onChange={(event) =>
                                setDurableDraft((current) => ({
                                  ...current,
                                  model: event.target.value || undefined,
                                }))
                              }
                            />
                          </FormField>
                          <FormField label="카테고리">
                            <EquipmentCategorySelect
                              categories={equipmentCategories.durable}
                              value={durableDraft.category}
                              onChange={(value) =>
                                setDurableDraft((current) => ({ ...current, category: value }))
                              }
                            />
                          </FormField>
                          <FormField label="수량">
                            <input
                              type="number"
                              min="1"
                              placeholder="1"
                              value={durableDraft.quantity}
                              onChange={(event) =>
                                setDurableDraft((current) => ({
                                  ...current,
                                  quantity: Number(event.target.value) || 1,
                                }))
                              }
                            />
                          </FormField>
                          <FormField label="상태">
                            <select
                              value={durableDraft.status}
                              onChange={(event) =>
                                setDurableDraft((current) => ({
                                  ...current,
                                  status: event.target.value as DurableEquipmentItem["status"],
                                }))
                              }
                            >
                              {Object.entries(DURABLE_STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </FormField>
                          <FormField label="구매 링크" full>
                            <input
                              placeholder="https://"
                              value={durableDraft.purchase_link ?? ""}
                              onChange={(event) =>
                                setDurableDraft((current) => ({
                                  ...current,
                                  purchase_link: event.target.value || undefined,
                                }))
                              }
                            />
                          </FormField>
                          <p className="equipment-helper-copy form-grid__full">
                            구매 링크가 있으면 AI 메타데이터 수집 시 우선 참고합니다.
                          </p>
                          <button
                            className="button button--primary form-grid__full"
                            onClick={() => handleCreateEquipmentItem("durable")}
                            type="button"
                          >
                            반복 장비 추가
                          </button>
                        </div>
                      ) : null}

                      {equipmentSection === "consumables" ? (
                        <div className="form-grid">
                          <FormField label="소모품명">
                            <input
                              placeholder="예: 가스 캔"
                              value={consumableDraft.name}
                              onChange={(event) =>
                                setConsumableDraft((current) => ({ ...current, name: event.target.value }))
                              }
                            />
                          </FormField>
                          <FormField label="카테고리">
                            <EquipmentCategorySelect
                              categories={equipmentCategories.consumables}
                              value={consumableDraft.category}
                              onChange={(value) =>
                                setConsumableDraft((current) => ({ ...current, category: value }))
                              }
                            />
                          </FormField>
                          <FormField label="단위">
                            <input
                              placeholder="예: pack"
                              value={consumableDraft.unit}
                              onChange={(event) =>
                                setConsumableDraft((current) => ({ ...current, unit: event.target.value }))
                              }
                            />
                          </FormField>
                          <FormField label="현재 수량">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={consumableDraft.quantity_on_hand}
                              onChange={(event) =>
                                setConsumableDraft((current) => ({
                                  ...current,
                                  quantity_on_hand: Number(event.target.value) || 0,
                                }))
                              }
                            />
                          </FormField>
                          <FormField label="부족 기준">
                            <input
                              type="number"
                              min="0"
                              placeholder="예: 2"
                              value={consumableDraft.low_stock_threshold ?? ""}
                              onChange={(event) =>
                                setConsumableDraft((current) => ({
                                  ...current,
                                  low_stock_threshold: parseInt(event.target.value, 10) || undefined,
                                }))
                              }
                            />
                          </FormField>
                          <button
                            className="button button--primary form-grid__full"
                            onClick={() => handleCreateEquipmentItem("consumables")}
                            type="button"
                          >
                            소모품 추가
                          </button>
                        </div>
                      ) : null}

                      {equipmentSection === "precheck" ? (
                        <div className="form-grid">
                          <FormField label="점검 항목명">
                            <input
                              placeholder="예: 랜턴 배터리"
                              value={precheckDraft.name}
                              onChange={(event) =>
                                setPrecheckDraft((current) => ({ ...current, name: event.target.value }))
                              }
                            />
                          </FormField>
                          <FormField label="카테고리">
                            <EquipmentCategorySelect
                              categories={equipmentCategories.precheck}
                              value={precheckDraft.category}
                              onChange={(value) =>
                                setPrecheckDraft((current) => ({ ...current, category: value }))
                              }
                            />
                          </FormField>
                          <FormField label="상태">
                            <select
                              value={precheckDraft.status}
                              onChange={(event) =>
                                setPrecheckDraft((current) => ({
                                  ...current,
                                  status: event.target.value as PrecheckItem["status"],
                                }))
                              }
                            >
                              {Object.entries(PRECHECK_STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </FormField>
                          <button
                            className="button button--primary form-grid__full"
                            onClick={() => handleCreateEquipmentItem("precheck")}
                            type="button"
                          >
                            점검 항목 추가
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </section>
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </section>
  );
}
