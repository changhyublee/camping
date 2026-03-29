import type { ReactNode } from "react";
import type {
  ConsumableEquipmentItem,
  DurableEquipmentItem,
  DurableEquipmentMetadata,
  DurableMetadataJobStatus,
  DurableMetadataJobStatusResponse,
  EquipmentCategory,
  EquipmentSection,
  PrecheckItem,
} from "@camping/shared";
import {
  CONSUMABLE_STATUS_LABELS,
  DURABLE_STATUS_LABELS,
  PRECHECK_STATUS_LABELS,
  getConsumableStatus,
} from "@camping/shared";
import type { DurableMetadataJobStatusMap } from "../../app/view-model-types";
import {
  formatPackedSize,
  formatRelativeDate,
  getStatusLabel,
  parseInteger,
} from "../../app/common-formatters";
import {
  buildEquipmentCategoryGroups,
  buildEquipmentCategoryOptions,
  getDurableMetadataCardBadgeLabel,
  getDurableMetadataStatusLabel,
  getDurableMetadataSummaryStatusLabel,
  isPendingDurableMetadataJobStatus,
  resolveCategorySelection,
} from "../../app/equipment-view-helpers";
import { FormField } from "../shared/ui";

export function EquipmentCategorySelect(props: {
  categories: EquipmentCategory[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = buildEquipmentCategoryOptions(props.categories, props.value);

  return (
    <select
      aria-label="카테고리"
      value={resolveCategorySelection(props.value, options)}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {options.map((category) => (
        <option key={category.id} value={category.id}>
          {category.label}
        </option>
      ))}
    </select>
  );
}

type GroupedEquipmentListProps<T extends { id: string; name: string; category: string }> = {
  section: EquipmentSection;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: T[];
  emptyMessage: string;
  onToggleCategory: (categoryId: string) => void;
  onToggleItem: (itemId: string) => void;
  renderSummaryMeta: (item: T) => {
    metadata?: string;
    quantity?: string;
    status: string;
  };
  renderEditor: (item: T) => ReactNode;
};

function GroupedEquipmentList<T extends { id: string; name: string; category: string }>(
  props: GroupedEquipmentListProps<T>,
) {
  const groups = buildEquipmentCategoryGroups(props.items, props.categories);

  if (groups.length === 0) {
    return <div className="empty-state empty-state--compact">{props.emptyMessage}</div>;
  }

  return (
    <div className="equipment-category-list">
      {groups.map((group) => {
        const categoryPanelId = `equipment-category-panel-${props.section}-${group.categoryId}`;
        const isCollapsed = props.collapsedCategoryIds.includes(group.categoryId);

        return (
          <section className="equipment-category-card" key={group.categoryId}>
            <button
              aria-controls={categoryPanelId}
              aria-expanded={!isCollapsed}
              aria-label={`${group.categoryLabel} 카테고리 ${isCollapsed ? "펼치기" : "접기"}`}
              className="equipment-category-toggle"
              onClick={() => props.onToggleCategory(group.categoryId)}
              type="button"
            >
              <span className="equipment-category-toggle__content">
                <span className="equipment-category-toggle__eyebrow">카테고리</span>
                <strong>{group.categoryLabel}</strong>
                <span className="equipment-category-toggle__meta">
                  {group.items.length}개 항목
                </span>
              </span>
              <span className="equipment-category-toggle__state">
                {isCollapsed ? "펼치기" : "접기"}
              </span>
            </button>

            {!isCollapsed ? (
              <div className="equipment-category-body" id={categoryPanelId}>
                <div className="equipment-category-body__header">
                  <span>카테고리 안 항목</span>
                  <strong>{group.items.length}개</strong>
                </div>
                <div className="equipment-item-list">
                  {group.items.map((item) => {
                    const summary = props.renderSummaryMeta(item);
                    const itemPanelId = `equipment-item-panel-${props.section}-${item.id}`;
                    const isExpanded = props.expandedItemIds.includes(item.id);

                    return (
                      <article className="equipment-item-card" key={item.id}>
                        <button
                          aria-controls={itemPanelId}
                          aria-expanded={isExpanded}
                          aria-label={`${item.name} 상세 ${isExpanded ? "접기" : "펼치기"}`}
                          className="equipment-item-summary"
                          onClick={() => props.onToggleItem(item.id)}
                          type="button"
                        >
                          <span className="equipment-item-summary__content">
                            <span className="equipment-item-summary__eyebrow">항목</span>
                            <strong>{item.name}</strong>
                          </span>
                          <span className="equipment-item-summary__meta">
                            {summary.quantity ? (
                              <span className="equipment-item-summary__badge">
                                {summary.quantity}
                              </span>
                            ) : null}
                            {summary.metadata ? (
                              <span className="equipment-item-summary__badge">
                                {summary.metadata}
                              </span>
                            ) : null}
                            <span className="equipment-item-summary__badge">
                              {summary.status}
                            </span>
                          </span>
                        </button>

                        {isExpanded ? (
                          <div className="equipment-item-detail" id={itemPanelId}>
                            {props.renderEditor(item)}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function EquipmentList(props: {
  section: EquipmentSection;
  categoryDrafts: Record<string, string>;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: DurableEquipmentItem[];
  metadataJobStatuses: DurableMetadataJobStatusMap;
  refreshingMetadataIds: string[];
  onToggleCategory: (categoryId: string) => void;
  onToggleItem: (itemId: string) => void;
  onChange: (itemId: string, updater: (item: DurableEquipmentItem) => DurableEquipmentItem) => void;
  onCategoryChange: (itemId: string, categoryId: string) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onRefreshMetadata: (itemId: string) => void;
}) {
  return (
    <GroupedEquipmentList<DurableEquipmentItem>
      categories={props.categories}
      collapsedCategoryIds={props.collapsedCategoryIds}
      emptyMessage="등록된 반복 장비가 없습니다."
      expandedItemIds={props.expandedItemIds}
      items={props.items}
      onToggleCategory={props.onToggleCategory}
      onToggleItem={props.onToggleItem}
      renderEditor={(item) => (
        <>
          <div className="form-grid">
            <FormField label="장비명">
              <input
                placeholder="장비명"
                value={item.name}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="모델명">
              <input
                placeholder="예: 패밀리 터널 4P"
                value={item.model ?? ""}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    model: event.target.value || undefined,
                  }))
                }
              />
            </FormField>
            <FormField label="카테고리">
              <EquipmentCategorySelect
                categories={props.categories}
                value={props.categoryDrafts[item.id] ?? item.category}
                onChange={(value) => props.onCategoryChange(item.id, value)}
              />
            </FormField>
            <FormField label="수량">
              <input
                type="number"
                min="1"
                placeholder="1"
                value={item.quantity}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    quantity: Number(event.target.value) || 1,
                  }))
                }
              />
            </FormField>
            <FormField label="상태">
              <select
                value={item.status}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
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
                value={item.purchase_link ?? ""}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    purchase_link: event.target.value || undefined,
                  }))
                }
              />
            </FormField>
          </div>
          <p className="equipment-helper-copy">
            장비명, 모델명, 구매 링크는 AI 메타데이터 검색의 기준으로 사용됩니다.
          </p>
          <DurableMetadataSection
            metadata={item.metadata}
            jobStatus={props.metadataJobStatuses[item.id]}
          />
          <div className="button-row">
            <button className="button" onClick={() => props.onSave(item.id)} type="button">
              저장
            </button>
            <button
              className="button"
              disabled={props.refreshingMetadataIds.includes(item.id)}
              onClick={() => props.onRefreshMetadata(item.id)}
              type="button"
            >
              {props.refreshingMetadataIds.includes(item.id)
                ? "메타데이터 수집 중..."
                : "메타데이터 재수집"}
            </button>
            <button className="button" onClick={() => props.onDelete(item.id)} type="button">
              삭제
            </button>
          </div>
        </>
      )}
      renderSummaryMeta={(item: DurableEquipmentItem) => ({
        metadata: getDurableMetadataSummaryStatusLabel(props.metadataJobStatuses[item.id]?.status),
        quantity: `수량 ${item.quantity}`,
        status: getStatusLabel(DURABLE_STATUS_LABELS, item.status),
      })}
      section={props.section}
    />
  );
}

export function DurableMetadataSection(props: {
  metadata?: DurableEquipmentMetadata;
  jobStatus?: DurableMetadataJobStatusResponse;
}) {
  const metadata = props.metadata;
  const jobStatus = props.jobStatus;
  const jobBadgeLabel = getDurableMetadataCardBadgeLabel(jobStatus?.status, metadata);

  if (!metadata) {
    return (
      <section className="metadata-card">
        <div className="metadata-card__header">
          <strong>장비 메타데이터</strong>
          <span className="equipment-item-summary__badge">{jobBadgeLabel}</span>
        </div>
        <p className="metadata-card__copy">
          {isPendingDurableMetadataJobStatus(jobStatus?.status)
            ? "백그라운드에서 메타데이터를 수집 중입니다. 완료되면 이 카드가 자동으로 갱신됩니다."
            : jobStatus?.status === "failed"
              ? jobStatus.error?.message ??
                "메타데이터 수집이 실패했습니다. 장비 정보를 확인한 뒤 다시 실행해 주세요."
              : jobStatus?.status === "interrupted"
                ? jobStatus.error?.message ??
                  "이전 메타데이터 수집이 중단되었습니다. 다시 실행해 주세요."
                : "아직 수집된 메타데이터가 없습니다. 저장 후 자동 수집되거나 수동으로 재수집할 수 있습니다."}
        </p>
      </section>
    );
  }

  const sizeText = formatPackedSize(metadata);
  const sourceCount = metadata.sources.length;

  return (
    <section className="metadata-card">
      <div className="metadata-card__header">
        <strong>장비 메타데이터</strong>
        <span className="equipment-item-summary__badge">{jobBadgeLabel}</span>
      </div>
      <p className="metadata-card__copy">
        마지막 수집: {formatRelativeDate(metadata.searched_at)} / 검색 질의: {metadata.query}
      </p>
      {jobStatus?.status === "failed" || jobStatus?.status === "interrupted" ? (
        <p className="metadata-card__copy">
          {jobStatus.error?.message ??
            `${getDurableMetadataStatusLabel(jobStatus.status)} 상태입니다. 다시 수집해 주세요.`}
        </p>
      ) : null}
      {isPendingDurableMetadataJobStatus(jobStatus?.status) ? (
        <p className="metadata-card__copy">
          현재 저장된 메타데이터를 유지한 채 백그라운드에서 최신 정보로 갱신 중입니다.
        </p>
      ) : null}
      {metadata.summary ? <p className="metadata-card__copy">{metadata.summary}</p> : null}
      <div className="metadata-grid">
        <div className="metadata-grid__item">
          <span>공식명</span>
          <strong>{metadata.product?.official_name ?? "-"}</strong>
        </div>
        <div className="metadata-grid__item">
          <span>브랜드/모델</span>
          <strong>
            {[metadata.product?.brand, metadata.product?.model].filter(Boolean).join(" / ") || "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>포장 크기</span>
          <strong>{sizeText ?? "-"}</strong>
        </div>
        <div className="metadata-grid__item">
          <span>무게</span>
          <strong>
            {typeof metadata.packing?.weight_kg === "number"
              ? `${metadata.packing.weight_kg} kg`
              : "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>설치 시간</span>
          <strong>
            {typeof metadata.planning?.setup_time_minutes === "number"
              ? `${metadata.planning.setup_time_minutes}분`
              : "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>추천 인원</span>
          <strong>
            {typeof metadata.planning?.recommended_people === "number"
              ? `${metadata.planning.recommended_people}명`
              : "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>수용 인원</span>
          <strong>
            {typeof metadata.planning?.capacity_people === "number"
              ? `${metadata.planning.capacity_people}명`
              : "-"}
          </strong>
        </div>
        <div className="metadata-grid__item">
          <span>출처</span>
          <strong>{sourceCount > 0 ? `${sourceCount}건` : "-"}</strong>
        </div>
      </div>
      {metadata.planning?.season_notes?.length ? (
        <div className="metadata-list">
          <span>계절 메모</span>
          <ul>
            {metadata.planning.season_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {metadata.planning?.weather_notes?.length ? (
        <div className="metadata-list">
          <span>날씨 메모</span>
          <ul>
            {metadata.planning.weather_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {metadata.sources.length ? (
        <div className="metadata-list">
          <span>참고 출처</span>
          <ul>
            {metadata.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} rel="noreferrer" target="_blank">
                  {source.title}
                </a>
                <span>{source.domain}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function ConsumableList(props: {
  section: EquipmentSection;
  categoryDrafts: Record<string, string>;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: ConsumableEquipmentItem[];
  onToggleCategory: (categoryId: string) => void;
  onToggleItem: (itemId: string) => void;
  onChange: (
    itemId: string,
    updater: (item: ConsumableEquipmentItem) => ConsumableEquipmentItem,
  ) => void;
  onCategoryChange: (itemId: string, categoryId: string) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <GroupedEquipmentList<ConsumableEquipmentItem>
      categories={props.categories}
      collapsedCategoryIds={props.collapsedCategoryIds}
      emptyMessage="등록된 소모품이 없습니다."
      expandedItemIds={props.expandedItemIds}
      items={props.items}
      onToggleCategory={props.onToggleCategory}
      onToggleItem={props.onToggleItem}
      renderEditor={(item) => (
        <>
          <div className="form-grid">
            <FormField label="소모품명">
              <input
                placeholder="소모품명"
                value={item.name}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="카테고리">
              <EquipmentCategorySelect
                categories={props.categories}
                value={props.categoryDrafts[item.id] ?? item.category}
                onChange={(value) => props.onCategoryChange(item.id, value)}
              />
            </FormField>
            <FormField label="현재 수량">
              <input
                type="number"
                min="0"
                placeholder="0"
                value={item.quantity_on_hand}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    quantity_on_hand: Number(event.target.value) || 0,
                  }))
                }
              />
            </FormField>
            <FormField label="단위">
              <input
                placeholder="단위"
                value={item.unit}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    unit: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="부족 기준">
              <input
                type="number"
                min="0"
                placeholder="예: 2"
                value={item.low_stock_threshold ?? ""}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    low_stock_threshold: parseInteger(event.target.value),
                  }))
                }
              />
            </FormField>
          </div>
          <div className="button-row">
            <button className="button" onClick={() => props.onSave(item.id)} type="button">
              저장
            </button>
            <button className="button" onClick={() => props.onDelete(item.id)} type="button">
              삭제
            </button>
          </div>
        </>
      )}
      renderSummaryMeta={(item: ConsumableEquipmentItem) => ({
        quantity: `수량 ${item.quantity_on_hand}${item.unit ? ` ${item.unit}` : ""}`,
        status: getStatusLabel(CONSUMABLE_STATUS_LABELS, getConsumableStatus(item)),
      })}
      section={props.section}
    />
  );
}

export function PrecheckList(props: {
  section: EquipmentSection;
  categoryDrafts: Record<string, string>;
  categories: EquipmentCategory[];
  collapsedCategoryIds: string[];
  expandedItemIds: string[];
  items: PrecheckItem[];
  onToggleCategory: (categoryId: string) => void;
  onToggleItem: (itemId: string) => void;
  onChange: (itemId: string, updater: (item: PrecheckItem) => PrecheckItem) => void;
  onCategoryChange: (itemId: string, categoryId: string) => void;
  onSave: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <GroupedEquipmentList<PrecheckItem>
      categories={props.categories}
      collapsedCategoryIds={props.collapsedCategoryIds}
      emptyMessage="등록된 점검 항목이 없습니다."
      expandedItemIds={props.expandedItemIds}
      items={props.items}
      onToggleCategory={props.onToggleCategory}
      onToggleItem={props.onToggleItem}
      renderEditor={(item) => (
        <>
          <div className="form-grid">
            <FormField label="점검 항목명">
              <input
                placeholder="점검 항목명"
                value={item.name}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="카테고리">
              <EquipmentCategorySelect
                categories={props.categories}
                value={props.categoryDrafts[item.id] ?? item.category}
                onChange={(value) => props.onCategoryChange(item.id, value)}
              />
            </FormField>
            <FormField label="상태" full>
              <select
                value={item.status}
                onChange={(event) =>
                  props.onChange(item.id, (current) => ({
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
          </div>
          <div className="button-row">
            <button className="button" onClick={() => props.onSave(item.id)} type="button">
              저장
            </button>
            <button className="button" onClick={() => props.onDelete(item.id)} type="button">
              삭제
            </button>
          </div>
        </>
      )}
      renderSummaryMeta={(item: PrecheckItem) => ({
        status: getStatusLabel(PRECHECK_STATUS_LABELS, item.status),
      })}
      section={props.section}
    />
  );
}
