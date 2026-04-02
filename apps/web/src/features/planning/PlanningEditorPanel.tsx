import { AGE_GROUP_LABELS } from "@camping/shared";
import type { AppViewModel } from "../../app/useAppViewModel";
import { StatusBanner } from "../../components/StatusBanner";
import { FormField } from "../shared/ui";

export function PlanningEditorPanel(props: { view: AppViewModel }) {
  const {
    buildTripVehicleSelection,
    buildVehicleOptions,
    canSendAnalysisEmail,
    commaInputs,
    companions,
    detailLoading,
    handleAnalyzeAll,
    handleArchiveTrip,
    handleDeleteTrip,
    handleSendAnalysisEmail,
    handleSaveTrip,
    isAnalysisPending,
    isAnalysisReadyForEmail,
    isCreatingTrip,
    missingCompanionIds,
    savingTrip,
    selectedTripEmailRecipientIds,
    selectedTripCompanions,
    selectedTripVehicle,
    sendingAnalysisEmail,
    setActivePage,
    setCommaInputs,
    setTripNoteInput,
    splitCommaList,
    toggleSelectionId,
    tripDraft,
    tripNoteInput,
    updateTripDraft,
    validationWarnings,
    vehicles,
  } = props.view;
  const selectedRecipientIdSet = new Set(selectedTripEmailRecipientIds);

  return (
    <section className="panel">
      <div className="panel__eyebrow">원본 입력</div>
      <div className="panel__header">
        <h2>계획 편집</h2>
      </div>

      {detailLoading ? <div className="empty-state">trip 상세를 불러오는 중...</div> : null}

      {!detailLoading && tripDraft ? (
        <>
          <div className="form-grid">
            <FormField label="계획 제목">
              <input
                placeholder="새 캠핑 계획"
                value={tripDraft.title}
                onChange={(event) =>
                  updateTripDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </FormField>
            <FormField label="시작일">
              <input
                type="date"
                value={tripDraft.date?.start ?? ""}
                onChange={(event) =>
                  updateTripDraft((current) => ({
                    ...current,
                    date: { ...current.date, start: event.target.value || undefined },
                  }))
                }
              />
            </FormField>
            <FormField label="종료일">
              <input
                type="date"
                value={tripDraft.date?.end ?? ""}
                onChange={(event) =>
                  updateTripDraft((current) => ({
                    ...current,
                    date: { ...current.date, end: event.target.value || undefined },
                  }))
                }
              />
            </FormField>
            <FormField label="캠핑장 이름">
              <input
                placeholder="예: 솔숲 캠핑장"
                value={tripDraft.location?.campsite_name ?? ""}
                onChange={(event) =>
                  updateTripDraft((current) => ({
                    ...current,
                    location: { ...current.location, campsite_name: event.target.value || undefined },
                  }))
                }
              />
            </FormField>
            <FormField label="지역">
              <input
                placeholder="예: 강원 속초"
                value={tripDraft.location?.region ?? ""}
                onChange={(event) =>
                  updateTripDraft((current) => ({
                    ...current,
                    location: { ...current.location, region: event.target.value || undefined },
                  }))
                }
              />
            </FormField>
            <FormField label="출발 지역">
              <input
                placeholder="예: 서울 마포"
                value={tripDraft.departure?.region ?? ""}
                onChange={(event) =>
                  updateTripDraft((current) => ({
                    ...current,
                    departure: { ...current.departure, region: event.target.value || undefined },
                  }))
                }
              />
            </FormField>
            <FormField full label="동행자 선택">
              <div className="selection-block form-grid__full">
                <div className="selection-block__header">
                  <div>
                    <strong>등록된 사람 목록에서 이번 동행자를 고르세요.</strong>
                    <p>계획에는 선택만 남기고, 상세 프로필 수정은 사람 관리에서 따로 다룹니다.</p>
                  </div>
                  <button className="button" onClick={() => setActivePage("companions")} type="button">
                    사람 관리 열기
                  </button>
                </div>

                {companions.length > 0 ? (
                  <div className="choice-list">
                    {companions.map((companion) => {
                      const included = tripDraft.party?.companion_ids.includes(companion.id) ?? false;

                      return (
                        <label className={`choice-card${included ? " choice-card--active" : ""}`} key={companion.id}>
                          <input
                            checked={included}
                            onChange={() =>
                              updateTripDraft((current) => {
                                const nextCompanionIds = toggleSelectionId(
                                  current.party?.companion_ids ?? [],
                                  companion.id,
                                );

                                return {
                                  ...current,
                                  party: {
                                    companion_ids: nextCompanionIds,
                                  },
                                  notifications: {
                                    email_recipient_companion_ids:
                                      current.notifications?.email_recipient_companion_ids.filter((item) =>
                                        nextCompanionIds.includes(item),
                                      ) ?? [],
                                  },
                                };
                              })
                            }
                            type="checkbox"
                          />
                          <div className="choice-card__body">
                            <strong>{companion.name}</strong>
                            <span>
                              {AGE_GROUP_LABELS[companion.age_group]}
                              {companion.birth_year ? ` / ${companion.birth_year}년생` : ""}
                              {companion.health_notes[0] ? ` / ${companion.health_notes[0]}` : ""}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state empty-state--compact">
                    등록된 사람이 없습니다. 사람 관리에서 먼저 프로필을 추가하세요.
                  </div>
                )}

                {selectedTripCompanions.length > 0 ? (
                  <div className="summary-grid summary-grid--compact">
                    {selectedTripCompanions.map((companion) => (
                      <article className="summary-card" key={companion.id}>
                        <span>{companion.id}</span>
                        <strong>{companion.name}</strong>
                        <p className="panel__copy">
                          {AGE_GROUP_LABELS[companion.age_group]}
                          {companion.required_medications[0]
                            ? ` / 복용약 ${companion.required_medications[0]}`
                            : ""}
                        </p>
                        <p className="panel__copy">
                          {companion.email?.trim()
                            ? `메일 ${companion.email.trim()}`
                            : "메일 주소 없음"}
                        </p>
                        <label className="checkbox-row">
                          <input
                            checked={selectedRecipientIdSet.has(companion.id)}
                            disabled={!companion.email?.trim()}
                            onChange={() =>
                              updateTripDraft((current) => ({
                                ...current,
                                notifications: {
                                  email_recipient_companion_ids: toggleSelectionId(
                                    current.notifications?.email_recipient_companion_ids ?? [],
                                    companion.id,
                                  ),
                                },
                              }))
                            }
                            type="checkbox"
                          />
                          {companion.email?.trim()
                            ? "이 동행자에게 분석 결과 메일 발송"
                            : "메일 주소가 없어 발송할 수 없음"}
                        </label>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state empty-state--compact">
                    동행자를 선택하면 요약 정보가 여기 표시됩니다.
                  </div>
                )}

                {missingCompanionIds.length > 0 ? (
                  <div className="action-card">
                    <strong>기존 계획에만 남아 있는 동행자 ID</strong>
                    <p>{missingCompanionIds.join(", ")} 를 사람 관리에서 정리하세요.</p>
                  </div>
                ) : null}

                <div className="action-card">
                  <strong>분석 결과 메일 발송</strong>
                  <p>
                    체크한 동행자에게만 전체 분석 Markdown을 보냅니다. 메일 주소가
                    없는 동행자는 선택할 수 없습니다.
                  </p>
                  <p>
                    {isAnalysisReadyForEmail
                      ? "전체 분석 결과가 모두 모여 있어 바로 발송할 수 있습니다."
                      : "전체 분석 실행 후 모든 분석 항목 결과가 준비되어야 발송할 수 있습니다."}
                  </p>
                </div>
              </div>
            </FormField>
            <FormField full label="차량 선택">
              <div className="selection-block form-grid__full">
                <div className="selection-block__header">
                  <div>
                    <strong>사전에 등록한 차량에서 이번 이동 차량을 선택하세요.</strong>
                    <p>선택하면 탑승 인원과 적재량 요약이 계획에 함께 반영됩니다.</p>
                  </div>
                  <button className="button" onClick={() => setActivePage("vehicles")} type="button">
                    차량 관리 열기
                  </button>
                </div>
                <select
                  aria-label="차량 선택"
                  value={tripDraft.vehicle?.id ?? ""}
                  onChange={(event) =>
                    updateTripDraft((current) => ({
                      ...current,
                      vehicle: buildTripVehicleSelection(event.target.value, vehicles, current.vehicle),
                    }))
                  }
                >
                  <option value="">차량을 선택하세요</option>
                  {buildVehicleOptions(vehicles, tripDraft.vehicle).map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.name}
                    </option>
                  ))}
                </select>

                {selectedTripVehicle ? (
                  <article className="summary-card">
                    <span>{selectedTripVehicle.id}</span>
                    <strong>{selectedTripVehicle.name}</strong>
                    <p className="panel__copy">{selectedTripVehicle.description ?? "차량 설명 없음"}</p>
                    <div className="button-row button-row--compact">
                      <span className="pill">탑승 {selectedTripVehicle.passenger_capacity ?? "미입력"}명</span>
                      <span className="pill">적재 {selectedTripVehicle.load_capacity_kg ?? "미입력"}kg</span>
                    </div>
                  </article>
                ) : (
                  <div className="empty-state empty-state--compact">
                    차량을 선택하면 요약 정보가 여기 표시됩니다.
                  </div>
                )}
              </div>
            </FormField>
            <FormField label="날씨 요약">
              <input
                placeholder="예: 흐리고 바람 강함"
                value={tripDraft.conditions?.expected_weather?.summary ?? ""}
                onChange={(event) =>
                  updateTripDraft((current) => ({
                    ...current,
                    conditions: {
                      ...current.conditions,
                      expected_weather: {
                        ...current.conditions?.expected_weather,
                        summary: event.target.value || undefined,
                      },
                    },
                  }))
                }
              />
            </FormField>
            <FormField label="강수 정보">
              <input
                placeholder="예: 오후 비 예보"
                value={tripDraft.conditions?.expected_weather?.precipitation ?? ""}
                onChange={(event) =>
                  updateTripDraft((current) => ({
                    ...current,
                    conditions: {
                      ...current.conditions,
                      expected_weather: {
                        ...current.conditions?.expected_weather,
                        precipitation: event.target.value || undefined,
                      },
                    },
                  }))
                }
              />
            </FormField>
            <FormField label="전기 사용">
              <label className="checkbox-row">
                <input
                  checked={tripDraft.conditions?.electricity_available ?? false}
                  onChange={(event) =>
                    updateTripDraft((current) => ({
                      ...current,
                      conditions: { ...current.conditions, electricity_available: event.target.checked },
                    }))
                  }
                  type="checkbox"
                />
                전기 사용 가능
              </label>
            </FormField>
            <FormField label="취사 가능 여부">
              <label className="checkbox-row">
                <input
                  checked={tripDraft.conditions?.cooking_allowed ?? false}
                  onChange={(event) =>
                    updateTripDraft((current) => ({
                      ...current,
                      conditions: { ...current.conditions, cooking_allowed: event.target.checked },
                    }))
                  }
                  type="checkbox"
                />
                취사 가능
              </label>
            </FormField>
            <FormField label="요청 메뉴">
              <input
                placeholder="콤마로 구분 (예: 바비큐, 어묵탕)"
                value={commaInputs.requestedDishes}
                onChange={(event) => {
                  setCommaInputs((current) => ({ ...current, requestedDishes: event.target.value }));
                  updateTripDraft((current) => ({
                    ...current,
                    meal_plan: {
                      ...current.meal_plan,
                      use_ai_recommendation: current.meal_plan?.use_ai_recommendation ?? true,
                      requested_dishes: splitCommaList(event.target.value),
                    },
                  }));
                }}
              />
            </FormField>
            <FormField label="경유 희망지">
              <input
                placeholder="콤마로 구분 (예: 휴게소, 시장)"
                value={commaInputs.requestedStops}
                onChange={(event) => {
                  setCommaInputs((current) => ({ ...current, requestedStops: event.target.value }));
                  updateTripDraft((current) => ({
                    ...current,
                    travel_plan: {
                      ...current.travel_plan,
                      use_ai_recommendation: current.travel_plan?.use_ai_recommendation ?? true,
                      requested_stops: splitCommaList(event.target.value),
                    },
                  }));
                }}
              />
            </FormField>
            <FormField full label="메모">
              <textarea
                className="form-grid__full"
                placeholder="사이트 특이사항, 출발 전 꼭 챙길 것, 당일 일정 메모, 아직 장비/링크로 옮기지 않은 임시 메모를 줄 단위로 적어두세요."
                value={tripNoteInput}
                onChange={(event) => setTripNoteInput(event.target.value)}
              />
            </FormField>
          </div>

          {validationWarnings.length > 0 ? (
            <StatusBanner
              tone="warning"
              title="분석 경고"
              items={validationWarnings}
              description="아직 값이 덜 채워진 항목이 있습니다."
            />
          ) : (
            <StatusBanner
              tone="success"
              title="분석 준비 상태 양호"
              description="현재 기준으로 분석 실행이 가능합니다."
            />
          )}

          <div className="action-row">
            <div className="button-row">
              <button className="button" disabled={savingTrip} onClick={handleSaveTrip} type="button">
                {savingTrip ? "저장 중..." : "계획 저장"}
              </button>
              {!isCreatingTrip ? (
                <button className="button" disabled={isAnalysisPending} onClick={handleArchiveTrip} type="button">
                  히스토리로 이동
                </button>
              ) : null}
              {!isCreatingTrip ? (
                <button className="button" disabled={isAnalysisPending} onClick={handleDeleteTrip} type="button">
                  계획 삭제
                </button>
              ) : null}
              {!isCreatingTrip ? (
                <button
                  className="button"
                  disabled={!canSendAnalysisEmail}
                  onClick={handleSendAnalysisEmail}
                  type="button"
                >
                  {sendingAnalysisEmail ? "메일 발송 중..." : "분석 결과 메일 발송"}
                </button>
              ) : null}
              {!isCreatingTrip ? (
                <button
                  className="button button--primary"
                  disabled={isAnalysisPending}
                  onClick={handleAnalyzeAll}
                  type="button"
                >
                  {isAnalysisPending ? "분석 중..." : "전체 분석 실행"}
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {!detailLoading && !tripDraft ? (
        <div className="empty-state">왼쪽에서 계획을 선택하거나 새 계획을 시작하세요.</div>
      ) : null}
    </section>
  );
}
