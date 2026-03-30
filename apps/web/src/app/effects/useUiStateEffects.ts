import { useEffect } from "react";
import type { EquipmentSection } from "@camping/shared";
import type { PageKey } from "../navigation";
import type {
  CategoryDetailTab,
  CategoryPageTab,
  CompanionPageTab,
  DashboardPageTab,
  EquipmentDetailTab,
  EquipmentPageTab,
  HelpPageTab,
  HistoryDetailTab,
  HistoryPageTab,
  LinkPageTab,
  PlanningDetailTab,
  PlanningPageTab,
  VehiclePageTab,
} from "../ui-state";
import { writePersistedUiState } from "../ui-state";
import type { OperationState } from "../view-model-types";
import type { MarkdownLayerState } from "../state/useUiShellState";

type UseUiStateSyncEffectInput = {
  activePage: PageKey;
  selectedTripId: string | null;
  selectedHistoryId: string | null;
  equipmentSection: EquipmentSection;
  dashboardPageTab: DashboardPageTab;
  companionPageTab: CompanionPageTab;
  vehiclePageTab: VehiclePageTab;
  equipmentPageTab: EquipmentPageTab;
  categoryPageTab: CategoryPageTab;
  helpPageTab: HelpPageTab;
  planningPageTab: PlanningPageTab;
  historyPageTab: HistoryPageTab;
  linkPageTab: LinkPageTab;
  planningDetailTab: PlanningDetailTab;
  historyDetailTab: HistoryDetailTab;
  equipmentDetailTab: EquipmentDetailTab;
  categoryDetailTab: CategoryDetailTab;
};

export function useUiStateSyncEffect(input: UseUiStateSyncEffectInput) {
  useEffect(() => {
    writePersistedUiState({
      activePage: input.activePage,
      selectedTripId: input.selectedTripId,
      selectedHistoryId: input.selectedHistoryId,
      equipmentSection: input.equipmentSection,
      dashboardPageTab: input.dashboardPageTab,
      companionPageTab: input.companionPageTab,
      vehiclePageTab: input.vehiclePageTab,
      equipmentPageTab: input.equipmentPageTab,
      categoryPageTab: input.categoryPageTab,
      helpPageTab: input.helpPageTab,
      planningPageTab: input.planningPageTab,
      historyPageTab: input.historyPageTab,
      linkPageTab: input.linkPageTab,
      planningDetailTab: input.planningDetailTab,
      historyDetailTab: input.historyDetailTab,
      equipmentDetailTab: input.equipmentDetailTab,
      categoryDetailTab: input.categoryDetailTab,
    });
  }, [
    input.activePage,
    input.categoryDetailTab,
    input.categoryPageTab,
    input.companionPageTab,
    input.dashboardPageTab,
    input.equipmentDetailTab,
    input.equipmentPageTab,
    input.equipmentSection,
    input.helpPageTab,
    input.historyDetailTab,
    input.historyPageTab,
    input.linkPageTab,
    input.planningDetailTab,
    input.planningPageTab,
    input.selectedHistoryId,
    input.selectedTripId,
    input.vehiclePageTab,
  ]);
}

export function useOperationStateAutoClearEffect(
  operationState: OperationState | null,
  setOperationState: React.Dispatch<React.SetStateAction<OperationState | null>>,
) {
  useEffect(() => {
    if (!operationState) {
      return;
    }

    const duration =
      operationState.tone === "success"
        ? 3400
        : operationState.tone === "warning"
          ? 4800
          : 5600;
    const timeoutId = window.setTimeout(() => {
      setOperationState((current) => (current === operationState ? null : current));
    }, duration);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [operationState, setOperationState]);
}

export function useMarkdownLayerResetEffect(input: {
  activePage: PageKey;
  isCreatingTrip: boolean;
  selectedHistoryId: string | null;
  selectedTripId: string | null;
  setMarkdownLayer: React.Dispatch<React.SetStateAction<MarkdownLayerState | null>>;
}) {
  useEffect(() => {
    input.setMarkdownLayer(null);
  }, [
    input.activePage,
    input.isCreatingTrip,
    input.selectedHistoryId,
    input.selectedTripId,
    input.setMarkdownLayer,
  ]);
}

export function useMarkdownLayerBodyLockEffect(
  markdownLayer: MarkdownLayerState | null,
  setMarkdownLayer: React.Dispatch<React.SetStateAction<MarkdownLayerState | null>>,
) {
  useEffect(() => {
    if (!markdownLayer) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMarkdownLayer(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [markdownLayer, setMarkdownLayer]);
}
