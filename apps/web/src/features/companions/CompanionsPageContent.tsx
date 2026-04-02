import { AGE_GROUP_LABELS, type Companion } from "@camping/shared";
import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import { COMPANION_PAGE_TABS, COMPANION_PAGE_TAB_LABELS } from "../../app/ui-state";
import { FormField } from "../shared/ui";

export function CompanionsPageContent(props: { view: AppViewModel }) {
  const {
    activeCompanionPagePanelId,
    activeCompanionPageTabId,
    beginCreateCompanion,
    beginEditCompanion,
    companionDraft,
    companionPageTab,
    companionTextInputs,
    companions,
    editingCompanionId,
    handleCreateCompanion,
    handleDeleteCompanion,
    handleSaveCompanion,
    parseInteger,
    selectedTripCompanions,
    setCompanionDraft,
    setCompanionPageTab,
    setCompanionTextInputs,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">준비 데이터</div>
          <h2>사람 관리</h2>
          <p className="panel__copy">
            캠핑 인원 프로필을 미리 정리해 두고, 계획 화면에서는 동행자 선택과 요약
            확인만 하도록 분리했습니다.
          </p>
        </div>
        <div className="page-intro__meta">
          <div className="meta-chip">
            <span>등록 인원</span>
            <strong>{companions.length}명</strong>
          </div>
          <div className="meta-chip">
            <span>현재 계획 선택</span>
            <strong>{selectedTripCompanions.length}명</strong>
          </div>
          <div className="meta-chip">
            <span>건강 메모</span>
            <strong>{companions.filter((item) => item.health_notes.length > 0).length}명</strong>
          </div>
          <div className="meta-chip">
            <span>복용약 기록</span>
            <strong>{companions.filter((item) => item.required_medications.length > 0).length}명</strong>
          </div>
          <div className="meta-chip">
            <span>메일 등록</span>
            <strong>{companions.filter((item) => item.email?.trim()).length}명</strong>
          </div>
        </div>
      </section>

      <section className="page-stack">
        <div aria-label="사람 관리 보기" className="detail-tabs" role="tablist">
          {COMPANION_PAGE_TABS.map((tab) => {
            const isActive = companionPageTab === tab;

            return (
              <button
                key={tab}
                aria-controls={isActive ? getDetailPanelId("companion-page", tab) : undefined}
                aria-selected={isActive}
                className={detailTabClass(isActive)}
                id={getDetailTabId("companion-page", tab)}
                onClick={() => setCompanionPageTab(tab)}
                onKeyDown={(event) =>
                  handleDetailTabKeyDown(
                    event,
                    COMPANION_PAGE_TABS,
                    tab,
                    setCompanionPageTab,
                    "companion-page",
                  )
                }
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {COMPANION_PAGE_TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        <section
          aria-labelledby={activeCompanionPageTabId}
          className="detail-tab-panel"
          id={activeCompanionPagePanelId}
          role="tabpanel"
        >
          {companionPageTab === "list" ? (
            <section className="panel">
              <div className="panel__eyebrow">인원 목록</div>
              <div className="panel__header">
                <h2>등록된 사람</h2>
                <span className="pill">{companions.length}명</span>
              </div>
              <div className="stack-list">
                <button
                  className="button"
                  onClick={() => {
                    beginCreateCompanion();
                    setCompanionPageTab("editor");
                  }}
                  type="button"
                >
                  새 사람 추가
                </button>
                {companions.length === 0 ? (
                  <div className="empty-state empty-state--compact">아직 등록된 사람이 없습니다.</div>
                ) : (
                  companions.map((companion) => (
                    <button
                      key={companion.id}
                      className={`list-card${
                        editingCompanionId === companion.id ? " list-card--active" : ""
                      }`}
                      onClick={() => {
                        beginEditCompanion(companion);
                        setCompanionPageTab("editor");
                      }}
                      type="button"
                    >
                      <strong>{companion.name}</strong>
                      <span>
                        {AGE_GROUP_LABELS[companion.age_group]}
                        {companion.birth_year ? ` / ${companion.birth_year}년생` : ""}
                        {companion.required_medications[0]
                          ? ` / ${companion.required_medications[0]}`
                          : ""}
                      </span>
                      <span>{companion.email?.trim() ? companion.email.trim() : "메일 주소 없음"}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {companionPageTab === "editor" ? (
            <section className="panel">
              <div className="panel__eyebrow">프로필 편집</div>
              <div className="panel__header">
                <h2>{editingCompanionId ? "사람 정보 수정" : "새 사람 추가"}</h2>
              </div>
              <p className="panel__copy">
                이름, 연령대, 건강 특이사항, 복용약과 민감도를 기록해 두면 계획과 분석에서
                바로 활용합니다.
              </p>
              <div className="form-grid">
                <FormField label="사람 ID">
                  <input
                    placeholder="예: child-2"
                    value={companionDraft.id}
                    disabled={Boolean(editingCompanionId)}
                    onChange={(event) =>
                      setCompanionDraft((current: Companion) => ({
                        ...current,
                        id: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="이름">
                  <input
                    placeholder="이름"
                    value={companionDraft.name}
                    onChange={(event) =>
                      setCompanionDraft((current: Companion) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="메일 주소">
                  <input
                    type="email"
                    placeholder="예: family@example.com"
                    value={companionDraft.email ?? ""}
                    onChange={(event) =>
                      setCompanionDraft((current: Companion) => ({
                        ...current,
                        email: event.target.value || undefined,
                      }))
                    }
                  />
                </FormField>
                <FormField label="연령대">
                  <select
                    value={companionDraft.age_group}
                    onChange={(event) =>
                      setCompanionDraft((current: Companion) => ({
                        ...current,
                        age_group: event.target.value as Companion["age_group"],
                      }))
                    }
                  >
                    {Object.entries(AGE_GROUP_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="출생연도">
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    placeholder="예: 2018"
                    value={companionDraft.birth_year ?? ""}
                    onChange={(event) =>
                      setCompanionDraft((current: Companion) => ({
                        ...current,
                        birth_year: parseInteger(event.target.value),
                      }))
                    }
                  />
                </FormField>
                <FormField full label="건강 특이사항">
                  <textarea
                    className="form-grid__full"
                    placeholder="알레르기, 추위 민감, 멀미, 수면 습관 등 준비물에 영향을 주는 내용을 줄 단위로 입력하세요."
                    value={companionTextInputs.healthNotes}
                    onChange={(event) =>
                      setCompanionTextInputs((current) => ({
                        ...current,
                        healthNotes: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField full label="필수 복용약">
                  <textarea
                    className="form-grid__full"
                    placeholder="반드시 챙겨야 하는 약, 체온계, 밴드 같은 의료 관련 준비물을 줄 단위로 입력하세요."
                    value={companionTextInputs.requiredMedications}
                    onChange={(event) =>
                      setCompanionTextInputs((current) => ({
                        ...current,
                        requiredMedications: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <label className="checkbox-row">
                  <input
                    checked={companionDraft.traits.cold_sensitive ?? false}
                    onChange={(event) =>
                      setCompanionDraft((current: Companion) => ({
                        ...current,
                        traits: {
                          ...current.traits,
                          cold_sensitive: event.target.checked,
                        },
                      }))
                    }
                    type="checkbox"
                  />
                  추위에 민감
                </label>
                <label className="checkbox-row">
                  <input
                    checked={companionDraft.traits.heat_sensitive ?? false}
                    onChange={(event) =>
                      setCompanionDraft((current: Companion) => ({
                        ...current,
                        traits: {
                          ...current.traits,
                          heat_sensitive: event.target.checked,
                        },
                      }))
                    }
                    type="checkbox"
                  />
                  더위에 민감
                </label>
                <label className="checkbox-row">
                  <input
                    checked={companionDraft.traits.rain_sensitive ?? false}
                    onChange={(event) =>
                      setCompanionDraft((current: Companion) => ({
                        ...current,
                        traits: {
                          ...current.traits,
                          rain_sensitive: event.target.checked,
                        },
                      }))
                    }
                    type="checkbox"
                  />
                  비에 민감
                </label>
              </div>
              <div className="button-row">
                <button
                  className="button button--primary"
                  onClick={() =>
                    editingCompanionId ? void handleSaveCompanion() : void handleCreateCompanion()
                  }
                  type="button"
                >
                  {editingCompanionId ? "사람 저장" : "사람 추가"}
                </button>
                <button className="button" onClick={() => beginCreateCompanion()} type="button">
                  새 입력으로 초기화
                </button>
                {editingCompanionId ? (
                  <button
                    className="button"
                    onClick={() => handleDeleteCompanion(editingCompanionId)}
                    type="button"
                  >
                    사람 삭제
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </section>
  );
}
