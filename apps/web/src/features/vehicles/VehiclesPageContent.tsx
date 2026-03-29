import type { VehicleInput } from "@camping/shared";
import type { AppViewModel } from "../../app/useAppViewModel";
import { detailTabClass, getDetailPanelId, getDetailTabId, handleDetailTabKeyDown } from "../../app/tab-helpers";
import { VEHICLE_PAGE_TABS, VEHICLE_PAGE_TAB_LABELS } from "../../app/ui-state";
import { FormField } from "../shared/ui";

export function VehiclesPageContent(props: { view: AppViewModel }) {
  const {
    activeVehiclePagePanelId,
    activeVehiclePageTabId,
    beginCreateVehicle,
    beginEditVehicle,
    editingVehicleId,
    handleCreateVehicle,
    handleDeleteVehicle,
    handleSaveVehicle,
    parseInteger,
    parseNumber,
    selectedTripVehicle,
    setVehicleDraft,
    setVehicleNoteInput,
    setVehiclePageTab,
    vehicleDraft,
    vehicleNoteInput,
    vehiclePageTab,
    vehicles,
  } = props.view;

  return (
    <section className="page-stack">
      <section className="page-intro panel">
        <div className="page-intro__copy">
          <div className="panel__eyebrow">준비 데이터</div>
          <h2>차량 관리</h2>
          <p className="panel__copy">
            자주 쓰는 차량 정보를 미리 저장해 두고, 계획 화면에서는 차량 선택과 요약
            확인만 하도록 정리했습니다.
          </p>
        </div>
        <div className="page-intro__meta">
          <div className="meta-chip">
            <span>등록 차량</span>
            <strong>{vehicles.length}대</strong>
          </div>
          <div className="meta-chip">
            <span>현재 계획 차량</span>
            <strong>{selectedTripVehicle?.name ?? "미선택"}</strong>
          </div>
          <div className="meta-chip">
            <span>적재량 기록</span>
            <strong>{vehicles.filter((item) => item.load_capacity_kg).length}대</strong>
          </div>
          <div className="meta-chip">
            <span>탑승 인원 기록</span>
            <strong>{vehicles.filter((item) => item.passenger_capacity).length}대</strong>
          </div>
        </div>
      </section>

      <section className="page-stack">
        <div aria-label="차량 관리 보기" className="detail-tabs" role="tablist">
          {VEHICLE_PAGE_TABS.map((tab) => {
            const isActive = vehiclePageTab === tab;

            return (
              <button
                key={tab}
                aria-controls={isActive ? getDetailPanelId("vehicle-page", tab) : undefined}
                aria-selected={isActive}
                className={detailTabClass(isActive)}
                id={getDetailTabId("vehicle-page", tab)}
                onClick={() => setVehiclePageTab(tab)}
                onKeyDown={(event) =>
                  handleDetailTabKeyDown(
                    event,
                    VEHICLE_PAGE_TABS,
                    tab,
                    setVehiclePageTab,
                    "vehicle-page",
                  )
                }
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {VEHICLE_PAGE_TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        <section
          aria-labelledby={activeVehiclePageTabId}
          className="detail-tab-panel"
          id={activeVehiclePagePanelId}
          role="tabpanel"
        >
          {vehiclePageTab === "list" ? (
            <section className="panel">
              <div className="panel__eyebrow">차량 목록</div>
              <div className="panel__header">
                <h2>등록된 차량</h2>
                <span className="pill">{vehicles.length}대</span>
              </div>
              <div className="stack-list">
                <button
                  className="button"
                  onClick={() => {
                    beginCreateVehicle();
                    setVehiclePageTab("editor");
                  }}
                  type="button"
                >
                  새 차량 추가
                </button>
                {vehicles.length === 0 ? (
                  <div className="empty-state empty-state--compact">아직 등록된 차량이 없습니다.</div>
                ) : (
                  vehicles.map((vehicle) => (
                    <button
                      key={vehicle.id}
                      className={`list-card${
                        editingVehicleId === vehicle.id ? " list-card--active" : ""
                      }`}
                      onClick={() => {
                        beginEditVehicle(vehicle);
                        setVehiclePageTab("editor");
                      }}
                      type="button"
                    >
                      <strong>{vehicle.name}</strong>
                      <span>
                        {vehicle.passenger_capacity
                          ? `탑승 ${vehicle.passenger_capacity}명`
                          : "탑승 인원 미입력"}
                        {" / "}
                        {vehicle.load_capacity_kg
                          ? `적재 ${vehicle.load_capacity_kg}kg`
                          : "적재량 미입력"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {vehiclePageTab === "editor" ? (
            <section className="panel">
              <div className="panel__eyebrow">차량 편집</div>
              <div className="panel__header">
                <h2>{editingVehicleId ? "차량 정보 수정" : "새 차량 추가"}</h2>
              </div>
              <p className="panel__copy">
                차종 설명, 탑승 인원, 적재량을 기록해 두면 매번 같은 값을 다시 입력할
                필요가 없습니다.
              </p>
              <div className="form-grid">
                <FormField label="차량 ID">
                  <input
                    placeholder="예: family-suv"
                    value={vehicleDraft.id ?? ""}
                    disabled={Boolean(editingVehicleId)}
                    onChange={(event) =>
                      setVehicleDraft((current: VehicleInput) => ({
                        ...current,
                        id: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="표시 이름">
                  <input
                    placeholder="예: 패밀리 SUV"
                    value={vehicleDraft.name ?? ""}
                    onChange={(event) =>
                      setVehicleDraft((current: VehicleInput) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField full label="차량 설명">
                  <input
                    className="form-grid__full"
                    placeholder="예: 2열 독립 시트, 루프박스 없이 적재하는 주력 차량"
                    value={vehicleDraft.description ?? ""}
                    onChange={(event) =>
                      setVehicleDraft((current: VehicleInput) => ({
                        ...current,
                        description: event.target.value || undefined,
                      }))
                    }
                  />
                </FormField>
                <FormField label="탑승 인원">
                  <input
                    type="number"
                    min="1"
                    placeholder="예: 5"
                    value={vehicleDraft.passenger_capacity ?? ""}
                    onChange={(event) =>
                      setVehicleDraft((current: VehicleInput) => ({
                        ...current,
                        passenger_capacity: parseInteger(event.target.value),
                      }))
                    }
                  />
                </FormField>
                <FormField label="적재량 (kg)">
                  <input
                    type="number"
                    min="0"
                    placeholder="예: 400"
                    value={vehicleDraft.load_capacity_kg ?? ""}
                    onChange={(event) =>
                      setVehicleDraft((current: VehicleInput) => ({
                        ...current,
                        load_capacity_kg: parseNumber(event.target.value),
                      }))
                    }
                  />
                </FormField>
                <FormField full label="메모">
                  <textarea
                    className="form-grid__full"
                    placeholder="루프백 사용 여부, 적재 습관, 아이 카시트 배치 같은 메모를 줄 단위로 입력하세요."
                    value={vehicleNoteInput}
                    onChange={(event) => setVehicleNoteInput(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="button-row">
                <button
                  className="button button--primary"
                  onClick={() =>
                    editingVehicleId ? void handleSaveVehicle() : void handleCreateVehicle()
                  }
                  type="button"
                >
                  {editingVehicleId ? "차량 저장" : "차량 추가"}
                </button>
                <button className="button" onClick={beginCreateVehicle} type="button">
                  새 입력으로 초기화
                </button>
                {editingVehicleId ? (
                  <button
                    className="button"
                    onClick={() => handleDeleteVehicle(editingVehicleId)}
                    type="button"
                  >
                    차량 삭제
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
