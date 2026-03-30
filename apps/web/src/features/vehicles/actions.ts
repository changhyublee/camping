import type { Dispatch, SetStateAction } from "react";
import type { TripDraft, Vehicle } from "@camping/shared";
import { apiClient } from "../../api/client";
import { confirmDeletion } from "../../app/browser-helpers";
import { getErrorMessage, joinLineList } from "../../app/common-formatters";
import {
  buildVehicleInput,
  createEmptyVehicle,
} from "../../app/view-model-drafts";
import type { OperationState } from "../../app/view-model-types";
import { sortVehicles } from "../../app/planning-history-helpers";

type VehicleDraft = ReturnType<typeof createEmptyVehicle>;

type BuildVehicleActionsInput = {
  editingVehicleId: string | null;
  setEditingVehicleId: Dispatch<SetStateAction<string | null>>;
  setVehicleDraft: Dispatch<SetStateAction<VehicleDraft>>;
  setVehicleNoteInput: Dispatch<SetStateAction<string>>;
  setVehicles: Dispatch<SetStateAction<Vehicle[]>>;
  setOperationState: Dispatch<SetStateAction<OperationState | null>>;
  tripDraft: TripDraft | null;
  updateTripDraft: (updater: (current: TripDraft) => TripDraft) => void;
  vehicleDraft: VehicleDraft;
  vehicleNoteInput: string;
};

export function buildVehicleActions(input: BuildVehicleActionsInput) {
  function beginCreateVehicle() {
    const nextDraft = createEmptyVehicle();
    input.setEditingVehicleId(null);
    input.setVehicleDraft(nextDraft);
    input.setVehicleNoteInput(joinLineList(nextDraft.notes));
  }

  function beginEditVehicle(vehicle: Vehicle) {
    const nextDraft = {
      ...vehicle,
      notes: [...vehicle.notes],
    };
    input.setEditingVehicleId(vehicle.id);
    input.setVehicleDraft(nextDraft);
    input.setVehicleNoteInput(joinLineList(nextDraft.notes));
  }

  async function handleCreateVehicle() {
    try {
      const response = await apiClient.createVehicle(
        buildVehicleInput(input.vehicleDraft, input.vehicleNoteInput),
      );
      input.setVehicles((current) => [...current, response.item].sort(sortVehicles));
      input.setVehicleDraft(createEmptyVehicle());
      input.setVehicleNoteInput("");
      input.setEditingVehicleId(null);
      input.setOperationState({
        title: "차량 추가 완료",
        tone: "success",
        description: `${response.item.name} (${response.item.id})`,
      });
    } catch (error) {
      input.setOperationState({
        title: "차량 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveVehicle() {
    if (!input.editingVehicleId) {
      return;
    }

    try {
      const response = await apiClient.updateVehicle(
        input.editingVehicleId,
        buildVehicleInput(input.vehicleDraft, input.vehicleNoteInput),
      );
      input.setVehicles((current) =>
        current
          .map((item) => (item.id === response.item.id ? response.item : item))
          .sort(sortVehicles),
      );
      input.setVehicleDraft(createEmptyVehicle());
      input.setVehicleNoteInput("");
      input.setEditingVehicleId(null);
      input.setOperationState({
        title: "차량 저장 완료",
        tone: "success",
        description: `${response.item.name} (${response.item.id})`,
      });
    } catch (error) {
      input.setOperationState({
        title: "차량 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteVehicle(vehicleId: string) {
    if (!confirmDeletion(`차량 정보를 삭제할까요?\n${vehicleId}`)) {
      return;
    }

    try {
      await apiClient.deleteVehicle(vehicleId);
      input.setVehicles((current) => current.filter((item) => item.id !== vehicleId));

      if (input.editingVehicleId === vehicleId) {
        input.setEditingVehicleId(null);
        input.setVehicleDraft(createEmptyVehicle());
        input.setVehicleNoteInput("");
      }

      if (input.tripDraft?.vehicle?.id === vehicleId) {
        input.updateTripDraft((current) => ({
          ...current,
          vehicle: undefined,
        }));
      }

      input.setOperationState({
        title: "차량 삭제 완료",
        tone: "success",
        description: vehicleId,
      });
    } catch (error) {
      input.setOperationState({
        title: "차량 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  return {
    beginCreateVehicle,
    beginEditVehicle,
    handleCreateVehicle,
    handleDeleteVehicle,
    handleSaveVehicle,
  };
}
