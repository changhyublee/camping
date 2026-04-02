import type { Dispatch, SetStateAction } from "react";
import type {
  SendTripAnalysisEmailResponse,
  TripData,
  TripDraft,
  TripSummary,
} from "@camping/shared";
import { apiClient } from "../api/client";
import { getErrorMessage, joinLineList } from "./common-formatters";
import {
  buildTripDraftForSave,
  createCommaSeparatedInputs,
} from "./view-model-drafts";
import type { CommaSeparatedInputs, OperationState } from "./view-model-types";

type SendTripAnalysisEmailActionInput = {
  selectedTripId: string;
  sendingAnalysisEmail: boolean;
  setCommaInputs: Dispatch<SetStateAction<CommaSeparatedInputs>>;
  setOperationState: Dispatch<SetStateAction<OperationState | null>>;
  setSendingAnalysisEmail: Dispatch<SetStateAction<boolean>>;
  setTripDraft: Dispatch<SetStateAction<TripDraft | null>>;
  setTripNoteInput: Dispatch<SetStateAction<string>>;
  setTrips: Dispatch<SetStateAction<TripSummary[]>>;
  tripDraft: TripDraft;
  tripNoteInput: string;
};

export async function sendTripAnalysisEmailFromDraft(
  input: SendTripAnalysisEmailActionInput,
) {
  if (input.sendingAnalysisEmail) {
    return;
  }

  const recipientCompanionIds =
    input.tripDraft.notifications?.email_recipient_companion_ids ?? [];

  if (recipientCompanionIds.length === 0) {
    return;
  }

  input.setSendingAnalysisEmail(true);
  input.setOperationState(null);
  let savedTripData: TripDraft | null = null;

  try {
    const savedTrip = await apiClient.updateTrip(
      input.selectedTripId,
      buildTripDraftForSave(input.tripDraft, input.tripNoteInput),
    );
    savedTripData = {
      ...savedTrip.data,
      notifications: {
        email_recipient_companion_ids: recipientCompanionIds,
      },
    };
    applySavedTripState(input, savedTripData);
    input.setTrips((current) => upsertTripSummary(current, savedTripData as TripSummarySource));
    await refreshTripSummaries(input);
    const response = await apiClient.sendTripAnalysisEmail(input.selectedTripId, {
      recipient_companion_ids: recipientCompanionIds,
    });

    input.setOperationState(buildAnalysisEmailSuccessState(response));
  } catch (error) {
    input.setOperationState({
      title: "분석 결과 메일 발송 실패",
      tone: "error",
      description: savedTripData
        ? `캠핑 계획 저장은 반영했지만 메일 발송은 실패했습니다. ${getErrorMessage(error)}`
        : getErrorMessage(error),
    });
  } finally {
    input.setSendingAnalysisEmail(false);
  }
}

function buildAnalysisEmailSuccessState(response: SendTripAnalysisEmailResponse): OperationState {
  const recipientSummary = response.recipients.map(
    (recipient) => `${recipient.name} <${recipient.email}>`,
  );

  return {
    title: "분석 결과 메일 발송 완료",
    tone: "success",
    description: `${response.sent_count}명에게 발송했습니다. ${response.output_path}`,
    items: recipientSummary.length > 0 ? recipientSummary : undefined,
  };
}

function applySavedTripState(
  input: SendTripAnalysisEmailActionInput,
  savedTripData: TripDraft,
) {
  input.setTripDraft(savedTripData);
  input.setCommaInputs(createCommaSeparatedInputs(savedTripData));
  input.setTripNoteInput(joinLineList(savedTripData.notes));
}

async function refreshTripSummaries(input: SendTripAnalysisEmailActionInput) {
  try {
    const tripList = await apiClient.getTrips();
    input.setTrips(tripList.items);
  } catch {
    // Ignore summary refresh failures so a successful save does not block email delivery.
  }
}

type TripSummarySource = Pick<
  TripData,
  "trip_id" | "title" | "date" | "location" | "party"
>;

function upsertTripSummary(
  currentTrips: TripSummary[],
  trip: TripSummarySource,
): TripSummary[] {
  const nextSummary: TripSummary = {
    trip_id: trip.trip_id,
    title: trip.title,
    start_date: trip.date?.start,
    end_date: trip.date?.end,
    region: trip.location?.region,
    companion_count: trip.party.companion_ids.length,
  };

  const existingIndex = currentTrips.findIndex(
    (item) => item.trip_id === nextSummary.trip_id,
  );

  if (existingIndex < 0) {
    return [...currentTrips, nextSummary];
  }

  return currentTrips.map((item, index) =>
    index === existingIndex ? nextSummary : item,
  );
}
