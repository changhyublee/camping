import { beforeEach, describe, expect, it } from "vitest";
import { readPersistedUiState, writePersistedUiState, type PersistedUiState } from "./ui-state";

const VALID_UI_STATE: PersistedUiState = {
  activePage: "planning",
  selectedTripId: "trip-1",
  selectedHistoryId: "history-1",
  equipmentSection: "durable",
  dashboardPageTab: "overview",
  companionPageTab: "list",
  vehiclePageTab: "list",
  equipmentPageTab: "details",
  categoryPageTab: "details",
  helpPageTab: "guide",
  planningPageTab: "details",
  historyPageTab: "details",
  linkPageTab: "editor",
  planningDetailTab: "assistant",
  historyDetailTab: "learning",
  equipmentDetailTab: "create",
  categoryDetailTab: "backup",
};

describe("ui-state", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persisted ui state를 sessionStorage에 저장하고 다시 읽는다", () => {
    writePersistedUiState(VALID_UI_STATE);

    expect(readPersistedUiState()).toEqual(VALID_UI_STATE);
  });

  it("유효하지 않은 activePage가 들어오면 기본 페이지로 되돌리면서 나머지 ui state를 유지한다", () => {
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        ...VALID_UI_STATE,
        activePage: "invalid-page",
      }),
    );

    expect(readPersistedUiState()).toEqual({
      ...VALID_UI_STATE,
      activePage: "dashboard",
    });
  });

  it("유효하지 않은 equipmentSection이 들어와도 나머지 ui state는 복원하고 기본 섹션으로 되돌린다", () => {
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        ...VALID_UI_STATE,
        equipmentSection: "invalid-section",
      }),
    );

    expect(readPersistedUiState()).toEqual({
      ...VALID_UI_STATE,
      equipmentSection: "durable",
    });
  });

  it("쓰레기 객체나 배열이 들어오면 persisted ui state를 복원하지 않는다", () => {
    window.sessionStorage.setItem("camping.ui-state", JSON.stringify(["invalid-state"]));
    expect(readPersistedUiState()).toBeNull();

    window.sessionStorage.setItem("camping.ui-state", JSON.stringify({ foo: "bar" }));
    expect(readPersistedUiState()).toBeNull();
  });
});
