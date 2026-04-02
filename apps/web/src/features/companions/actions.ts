import type { Dispatch, SetStateAction } from "react";
import type { Companion, TripDraft } from "@camping/shared";
import { apiClient } from "../../api/client";
import { confirmDeletion } from "../../app/browser-helpers";
import { getErrorMessage } from "../../app/common-formatters";
import {
  buildCompanionInput,
  createCompanionTextInputs,
  createEmptyCompanion,
} from "../../app/view-model-drafts";
import type { CompanionTextInputs, OperationState } from "../../app/view-model-types";
import { sortCompanions } from "../../app/planning-history-helpers";

type CompanionDraft = ReturnType<typeof createEmptyCompanion>;

type BuildCompanionActionsInput = {
  companionDraft: CompanionDraft;
  companionTextInputs: CompanionTextInputs;
  companions: Companion[];
  editingCompanionId: string | null;
  setCompanions: Dispatch<SetStateAction<Companion[]>>;
  setCompanionDraft: Dispatch<SetStateAction<CompanionDraft>>;
  setCompanionTextInputs: Dispatch<SetStateAction<CompanionTextInputs>>;
  setEditingCompanionId: Dispatch<SetStateAction<string | null>>;
  setOperationState: Dispatch<SetStateAction<OperationState | null>>;
  tripDraft: TripDraft | null;
  updateTripDraft: (updater: (current: TripDraft) => TripDraft) => void;
};

export function buildCompanionActions(input: BuildCompanionActionsInput) {
  function beginCreateCompanion(companionId?: string) {
    const nextDraft = createEmptyCompanion(companionId);
    input.setEditingCompanionId(null);
    input.setCompanionDraft(nextDraft);
    input.setCompanionTextInputs(createCompanionTextInputs(nextDraft));
  }

  function beginEditCompanion(companion: Companion) {
    const nextDraft = {
      ...companion,
      health_notes: [...companion.health_notes],
      required_medications: [...companion.required_medications],
      traits: {
        cold_sensitive: companion.traits.cold_sensitive ?? false,
        heat_sensitive: companion.traits.heat_sensitive ?? false,
        rain_sensitive: companion.traits.rain_sensitive ?? false,
      },
    };

    input.setEditingCompanionId(companion.id);
    input.setCompanionDraft(nextDraft);
    input.setCompanionTextInputs(createCompanionTextInputs(nextDraft));
  }

  async function handleCreateCompanion() {
    try {
      const response = await apiClient.createCompanion(
        buildCompanionInput(input.companionDraft, input.companionTextInputs),
      );
      const nextCompanions = [...input.companions, response.item].sort(sortCompanions);

      input.setCompanions(nextCompanions);
      input.setCompanionDraft(createEmptyCompanion());
      input.setCompanionTextInputs(createCompanionTextInputs());
      input.setEditingCompanionId(null);
      input.setOperationState({
        title: "동행자 추가 완료",
        tone: "success",
        description: `${response.item.name} (${response.item.id})`,
      });
    } catch (error) {
      input.setOperationState({
        title: "동행자 추가 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleSaveCompanion() {
    if (!input.editingCompanionId) {
      return;
    }

    try {
      const response = await apiClient.updateCompanion(
        input.editingCompanionId,
        buildCompanionInput(input.companionDraft, input.companionTextInputs),
      );
      input.setCompanions((current) =>
        current
          .map((item) => (item.id === response.item.id ? response.item : item))
          .sort(sortCompanions),
      );
      if (!response.item.email?.trim()) {
        input.updateTripDraft((current) => ({
          ...current,
          notifications: {
            email_recipient_companion_ids:
              current.notifications?.email_recipient_companion_ids.filter(
                (item) => item !== response.item.id,
              ) ?? [],
          },
        }));
      }
      input.setCompanionDraft(createEmptyCompanion());
      input.setCompanionTextInputs(createCompanionTextInputs());
      input.setEditingCompanionId(null);
      input.setOperationState({
        title: "동행자 저장 완료",
        tone: "success",
        description: `${response.item.name} (${response.item.id})`,
      });
    } catch (error) {
      input.setOperationState({
        title: "동행자 저장 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  async function handleDeleteCompanion(companionId: string) {
    if (!confirmDeletion(`동행자 프로필을 삭제할까요?\n${companionId}`)) {
      return;
    }

    try {
      await apiClient.deleteCompanion(companionId);
      input.setCompanions((current) =>
        current.filter((item) => item.id !== companionId).sort(sortCompanions),
      );

      if (input.editingCompanionId === companionId) {
        input.setEditingCompanionId(null);
        input.setCompanionDraft(createEmptyCompanion());
        input.setCompanionTextInputs(createCompanionTextInputs());
      }

      if (input.tripDraft?.party?.companion_ids.includes(companionId)) {
        input.updateTripDraft((current) => ({
          ...current,
          party: {
            companion_ids:
              current.party?.companion_ids.filter((item) => item !== companionId) ?? [],
          },
          notifications: {
            email_recipient_companion_ids:
              current.notifications?.email_recipient_companion_ids.filter(
                (item) => item !== companionId,
              ) ?? [],
          },
        }));
      }

      input.setOperationState({
        title: "동행자 삭제 완료",
        tone: "success",
        description: companionId,
      });
    } catch (error) {
      input.setOperationState({
        title: "동행자 삭제 실패",
        tone: "error",
        description: getErrorMessage(error),
      });
    }
  }

  return {
    beginCreateCompanion,
    beginEditCompanion,
    handleCreateCompanion,
    handleDeleteCompanion,
    handleSaveCompanion,
  };
}
