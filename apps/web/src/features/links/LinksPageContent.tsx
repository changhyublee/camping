import type { ExternalLinkCategory } from "@camping/shared";
import { EXTERNAL_LINK_CATEGORY_LABELS } from "@camping/shared";
import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import { LINK_PAGE_TABS, LINK_PAGE_TAB_LABELS } from "../../app/ui-state";
import { FormField } from "../shared/ui";

export function LinksPageContent(props: { view: AppViewModel }) {
  const {
    activeLinkPagePanelId,
    activeLinkPageTabId,
    handleCreateLink,
    handleDeleteLink,
    handleSaveLink,
    linkDraft,
    linkGroups,
    linkPageTab,
    links,
    setLinkDraft,
    setLinkPageTab,
    setLinks,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">참고 링크</div>
          <h2>참고 링크 관리</h2>
          <p className="panel__copy">
            날씨, 장소, 맛집, 장보기 링크를 북마크처럼 빠르게 읽고 수정할 수 있게 카테고리
            단위로 묶었습니다.
          </p>
        </div>
        <div className="page-intro__meta page-intro__meta--three">
          <div className="meta-chip">
            <span>전체 링크</span>
            <strong>{links.length}개</strong>
          </div>
          <div className="meta-chip">
            <span>카테고리 그룹</span>
            <strong>{linkGroups.length}개</strong>
          </div>
          <div className="meta-chip">
            <span>최근 작업</span>
            <strong>{links[0]?.name ?? "없음"}</strong>
          </div>
        </div>
      </section>

      <section className="page-stack">
        <div aria-label="외부 링크 보기" className="detail-tabs" role="tablist">
          {LINK_PAGE_TABS.map((tab) => {
            const isActive = linkPageTab === tab;

            return (
              <button
                key={tab}
                aria-controls={isActive ? getDetailPanelId("link-page", tab) : undefined}
                aria-selected={isActive}
                className={detailTabClass(isActive)}
                id={getDetailTabId("link-page", tab)}
                onClick={() => setLinkPageTab(tab)}
                onKeyDown={(event) =>
                  handleDetailTabKeyDown(
                    event,
                    LINK_PAGE_TABS,
                    tab,
                    setLinkPageTab,
                    "link-page",
                  )
                }
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {LINK_PAGE_TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        <section
          aria-labelledby={activeLinkPageTabId}
          className="detail-tab-panel"
          id={activeLinkPagePanelId}
          role="tabpanel"
        >
          {linkPageTab === "list" ? (
            <section className="panel">
              <div className="panel__eyebrow">링크 목록</div>
              <div className="panel__header">
                <h2>외부 링크 목록</h2>
              </div>
              {links.length === 0 ? (
                <div className="empty-state">등록된 외부 링크가 없습니다.</div>
              ) : (
                <div className="stack-list">
                  {linkGroups.map((group) => (
                    <section className="link-group" key={group.category}>
                      <div className="link-group__header">
                        <h3>{group.label}</h3>
                        <span>{group.items.length}개</span>
                      </div>
                      <div className="stack-list">
                        {group.items.map((link) => (
                          <div className="link-card" key={link.id}>
                            <FormField label="링크 이름">
                              <input
                                placeholder="링크 이름"
                                value={link.name}
                                onChange={(event) =>
                                  setLinks((current) =>
                                    current.map((item) =>
                                      item.id === link.id ? { ...item, name: event.target.value } : item,
                                    ),
                                  )
                                }
                              />
                            </FormField>
                            <FormField label="URL">
                              <input
                                placeholder="https://..."
                                value={link.url}
                                onChange={(event) =>
                                  setLinks((current) =>
                                    current.map((item) =>
                                      item.id === link.id ? { ...item, url: event.target.value } : item,
                                    ),
                                  )
                                }
                              />
                            </FormField>
                            <FormField label="카테고리">
                              <select
                                value={link.category}
                                onChange={(event) =>
                                  setLinks((current) =>
                                    current.map((item) =>
                                      item.id === link.id
                                        ? { ...item, category: event.target.value as ExternalLinkCategory }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                {Object.entries(EXTERNAL_LINK_CATEGORY_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            <FormField full label="메모">
                              <textarea
                                className="form-grid__full"
                                placeholder="링크 메모"
                                value={link.notes ?? ""}
                                onChange={(event) =>
                                  setLinks((current) =>
                                    current.map((item) =>
                                      item.id === link.id ? { ...item, notes: event.target.value } : item,
                                    ),
                                  )
                                }
                              />
                            </FormField>
                            <div className="button-row">
                              <a className="button" href={link.url} rel="noreferrer" target="_blank">
                                링크 열기
                              </a>
                              <button className="button" onClick={() => handleSaveLink(link)} type="button">
                                저장
                              </button>
                              <button className="button" onClick={() => handleDeleteLink(link.id)} type="button">
                                삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {linkPageTab === "editor" ? (
            <section className="panel">
              <div className="panel__eyebrow">새 링크</div>
              <div className="panel__header">
                <h2>새 외부 링크</h2>
              </div>
              <div className="form-grid">
                <FormField label="링크 이름">
                  <input
                    placeholder="예: 주말 날씨"
                    value={linkDraft.name}
                    onChange={(event) =>
                      setLinkDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="URL">
                  <input
                    placeholder="https://..."
                    value={linkDraft.url}
                    onChange={(event) =>
                      setLinkDraft((current) => ({
                        ...current,
                        url: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="카테고리">
                  <select
                    value={linkDraft.category}
                    onChange={(event) =>
                      setLinkDraft((current) => ({
                        ...current,
                        category: event.target.value as ExternalLinkCategory,
                      }))
                    }
                  >
                    {Object.entries(EXTERNAL_LINK_CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField full label="메모">
                  <textarea
                    className="form-grid__full"
                    placeholder="링크 메모"
                    value={linkDraft.notes ?? ""}
                    onChange={(event) =>
                      setLinkDraft((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <button className="button button--primary form-grid__full" onClick={handleCreateLink} type="button">
                  링크 추가
                </button>
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </section>
  );
}
