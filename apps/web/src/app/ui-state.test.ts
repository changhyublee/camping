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

  it("유효하지 않은 activePage가 들어오면 persisted ui state를 무시한다", () => {
    window.sessionStorage.setItem(
      "camping.ui-state",
      JSON.stringify({
        ...VALID_UI_STATE,
        activePage: "invalid-page",
      }),
    );

    expect(readPersistedUiState()).toBeNull();
  });
});
