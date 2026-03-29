import { memo, useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  DurableEquipmentItem,
  HistoryLearningInsight,
  HistoryRecord,
  UserLearningProfile,
} from "@camping/shared";
import { toggleSelectionId } from "../../app/planning-history-helpers";
import type { HistoryEditorDraft, RetrospectiveDraft } from "../../app/view-model-types";
import { FormField } from "../shared/ui";

export const HistoryOverviewPanel = memo(function HistoryOverviewPanel(props: {
  draftRef: MutableRefObject<HistoryEditorDraft>;
  history: HistoryRecord;
  historyLearningInsight: HistoryLearningInsight | null;
  onSave: (draft: HistoryEditorDraft) => void;
  resetVersion: number;
  userLearningProfile: UserLearningProfile | null;
}) {
  const [draft, setDraft] = useState<HistoryEditorDraft>(() => props.draftRef.current);

  useEffect(() => {
    setDraft(props.draftRef.current);
  }, [props.draftRef, props.history.history_id, props.resetVersion]);

  return (
    <>
      <div className="section-label">
        <strong>히스토리 요약</strong>
        <p>기본 정보와 현재 학습 요약을 확인하고 필요한 메모를 빠르게 읽습니다.</p>
      </div>
      <div className="form-grid">
        <FormField label="히스토리 제목">
          <input
            placeholder="히스토리 제목"
            value={draft.title}
            onChange={(event) => {
              const nextDraft = {
                ...props.draftRef.current,
                title: event.target.value,
              };

              props.draftRef.current = nextDraft;
              setDraft(nextDraft);
            }}
          />
        </FormField>
        <FormField label="참석 인원">
          <input
            type="number"
            min="0"
            placeholder="예: 4"
            value={draft.attendeeCount}
            onChange={(event) => {
              const nextDraft = {
                ...props.draftRef.current,
                attendeeCount: event.target.value,
              };

              props.draftRef.current = nextDraft;
              setDraft(nextDraft);
            }}
          />
        </FormField>
        <FormField label="보관 시각">
          <input value={props.history.archived_at} readOnly />
        </FormField>
      </div>
      <div className="summary-grid summary-grid--compact">
        <article className="summary-card">
          <span>이번 캠핑에서 AI가 배운 점</span>
          <strong>{props.historyLearningInsight ? "최신 반영됨" : "아직 없음"}</strong>
          <p className="panel__copy">
            {props.historyLearningInsight
              ? props.historyLearningInsight.summary
              : "회고를 남기면 실제 현장 사용 패턴과 다음 준비 힌트를 요약합니다."}
          </p>
        </article>
        <article className="summary-card">
          <span>전역 개인화 학습 요약</span>
          <strong>{props.userLearningProfile ? "누적 반영됨" : "아직 없음"}</strong>
          <p className="panel__copy">
            {props.userLearningProfile
              ? props.userLearningProfile.summary
              : "여러 히스토리 회고가 쌓일수록 다음 계획 분석에 자동 반영됩니다."}
          </p>
        </article>
      </div>
      <div className="button-row">
        <button
          className="button"
          onClick={() => props.onSave(props.draftRef.current)}
          type="button"
        >
          히스토리 저장
        </button>
      </div>
    </>
  );
});

export const HistoryNotesEditorPanel = memo(function HistoryNotesEditorPanel(props: {
  draftRef: MutableRefObject<HistoryEditorDraft>;
  history: HistoryRecord;
  onDelete: () => void;
  onSave: (draft: HistoryEditorDraft) => void;
  resetVersion: number;
}) {
  const [notes, setNotes] = useState(() => props.draftRef.current.notes);

  useEffect(() => {
    setNotes(props.draftRef.current.notes);
  }, [props.draftRef, props.history.history_id, props.resetVersion]);

  return (
    <>
      <div className="form-grid">
        <FormField full label="메모">
          <textarea
            className="form-grid__full"
            placeholder="누구와 어떤 차량으로 갔는지, 실제로 좋았던 점과 불편했던 점, 다음에 보완할 준비물을 줄 단위로 적어두세요."
            value={notes}
            onChange={(event) => {
              const nextNotes = event.target.value;

              props.draftRef.current = {
                ...props.draftRef.current,
                notes: nextNotes,
              };
              setNotes(nextNotes);
            }}
          />
        </FormField>
      </div>
      <div className="button-row">
        <button
          className="button"
          onClick={() => props.onSave(props.draftRef.current)}
          type="button"
        >
          히스토리 저장
        </button>
        <button className="button" onClick={props.onDelete} type="button">
          히스토리 삭제
        </button>
      </div>
    </>
  );
});

function syncRetrospectiveDraft(
  draftRef: MutableRefObject<RetrospectiveDraft>,
  setDraft: (draft: RetrospectiveDraft) => void,
  nextDraft: RetrospectiveDraft,
) {
  draftRef.current = nextDraft;
  setDraft(nextDraft);
}

export const RetrospectiveEditorPanel = memo(function RetrospectiveEditorPanel(props: {
  draftRef: MutableRefObject<RetrospectiveDraft>;
  durableItems: DurableEquipmentItem[];
  onSubmit: (draft: RetrospectiveDraft) => void;
  resetVersion: number;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<RetrospectiveDraft>(() => props.draftRef.current);

  useEffect(() => {
    setDraft(props.draftRef.current);
  }, [props.draftRef, props.resetVersion]);

  return (
    <>
      <div className="summary-grid summary-grid--compact">
        <article className="summary-card">
          <span>후기 / 회고 추가</span>
          <strong>실제 사용 기록</strong>
          <p className="panel__copy">
            현장에서 어떻게 사용했고 무엇이 부족했는지 남기면 다음 계획 힌트가 계속 보정됩니다.
          </p>
        </article>
      </div>
      <div className="form-grid">
        <FormField full label="만족도">
          <div className="retrospective-satisfaction-control">
            <select
              aria-label="만족도"
              value={draft.overallSatisfaction}
              onChange={(event) => {
                const nextDraft = {
                  ...props.draftRef.current,
                  overallSatisfaction: event.target.value,
                };

                props.draftRef.current = nextDraft;
                setDraft(nextDraft);
              }}
            >
              <option value="">선택 안 함</option>
              <option value="5">5점 매우 만족</option>
              <option value="4">4점 만족</option>
              <option value="3">3점 보통</option>
              <option value="2">2점 아쉬움</option>
              <option value="1">1점 매우 아쉬움</option>
            </select>
          </div>
        </FormField>
        <FormField full label="사용한 반복 장비">
          {props.durableItems.length ? (
            <div className="choice-list">
              {props.durableItems.map((item) => {
                const checked = draft.usedDurableItemIds.includes(item.id);

                return (
                  <label
                    className={`choice-card${checked ? " choice-card--active" : ""}`}
                    key={item.id}
                  >
                    <input
                      checked={checked}
                      onChange={() => {
                        const nextDraft = {
                          ...props.draftRef.current,
                          usedDurableItemIds: toggleSelectionId(
                            props.draftRef.current.usedDurableItemIds,
                            item.id,
                          ),
                        };

                        props.draftRef.current = nextDraft;
                        setDraft(nextDraft);
                      }}
                      type="checkbox"
                    />
                    <div className="choice-card__body">
                      <strong>{item.name}</strong>
                      <span>{item.id}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="empty-state empty-state--compact">현재 등록된 반복 장비가 없습니다.</div>
          )}
        </FormField>
        <FormField full label="잘 안 쓴 것 / 과했던 것">
          <textarea
            className="form-grid__full"
            placeholder="줄 단위로 적어 주세요. 예: 대형 랜턴 2개는 과했다"
            value={draft.unusedItems}
            onChange={(event) =>
              syncRetrospectiveDraft(props.draftRef, setDraft, {
                ...props.draftRef.current,
                unusedItems: event.target.value,
              })
            }
          />
        </FormField>
        <FormField full label="부족했거나 다음에 더 필요한 것">
          <textarea
            className="form-grid__full"
            placeholder="줄 단위로 적어 주세요. 예: 아이 여벌 옷, 바람막이 타프"
            value={draft.missingOrNeededItems}
            onChange={(event) =>
              syncRetrospectiveDraft(props.draftRef, setDraft, {
                ...props.draftRef.current,
                missingOrNeededItems: event.target.value,
              })
            }
          />
        </FormField>
        <FormField full label="식단 / 요리 회고">
          <textarea
            className="form-grid__full"
            placeholder="줄 단위로 적어 주세요."
            value={draft.mealFeedback}
            onChange={(event) =>
              syncRetrospectiveDraft(props.draftRef, setDraft, {
                ...props.draftRef.current,
                mealFeedback: event.target.value,
              })
            }
          />
        </FormField>
        <FormField full label="이동 / 동선 회고">
          <textarea
            className="form-grid__full"
            placeholder="줄 단위로 적어 주세요."
            value={draft.routeFeedback}
            onChange={(event) =>
              syncRetrospectiveDraft(props.draftRef, setDraft, {
                ...props.draftRef.current,
                routeFeedback: event.target.value,
              })
            }
          />
        </FormField>
        <FormField full label="사이트 / 현장 회고">
          <textarea
            className="form-grid__full"
            placeholder="줄 단위로 적어 주세요."
            value={draft.siteFeedback}
            onChange={(event) =>
              syncRetrospectiveDraft(props.draftRef, setDraft, {
                ...props.draftRef.current,
                siteFeedback: event.target.value,
              })
            }
          />
        </FormField>
        <FormField full label="문제 / 이슈">
          <textarea
            className="form-grid__full"
            placeholder="줄 단위로 적어 주세요."
            value={draft.issues}
            onChange={(event) =>
              syncRetrospectiveDraft(props.draftRef, setDraft, {
                ...props.draftRef.current,
                issues: event.target.value,
              })
            }
          />
        </FormField>
        <FormField full label="다음엔 이렇게 하고 싶음">
          <textarea
            className="form-grid__full"
            placeholder="줄 단위로 적어 주세요."
            value={draft.nextTimeRequests}
            onChange={(event) =>
              syncRetrospectiveDraft(props.draftRef, setDraft, {
                ...props.draftRef.current,
                nextTimeRequests: event.target.value,
              })
            }
          />
        </FormField>
        <FormField full label="자유 후기">
          <textarea
            className="form-grid__full"
            placeholder="현장에서 어떻게 캠핑했는지 자유롭게 남겨 주세요."
            value={draft.freeformNote}
            onChange={(event) =>
              syncRetrospectiveDraft(props.draftRef, setDraft, {
                ...props.draftRef.current,
                freeformNote: event.target.value,
              })
            }
          />
        </FormField>
        <div className="form-grid__full button-row">
          <button
            className="button button--primary"
            disabled={props.saving}
            onClick={() => props.onSubmit(props.draftRef.current)}
            type="button"
          >
            {props.saving ? "후기 저장 중..." : "후기 저장 후 학습 업데이트"}
          </button>
        </div>
      </div>
    </>
  );
});
