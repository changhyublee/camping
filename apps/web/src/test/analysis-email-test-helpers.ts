import type { SendTripAnalysisEmailResponse, TripData } from "@camping/shared";
import type { MockState } from "./mock-state";

export function readAnalysisEmailTripIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/trips\/([^/]+)\/analysis-email$/u);
  return match?.[1] ?? null;
}

export function handleAnalysisEmailRequest(input: {
  init?: RequestInit;
  jsonResponse: (body: unknown, status?: number) => Promise<Response>;
  state: MockState;
  tripId: string;
}) {
  const { init, jsonResponse, state, tripId } = input;
  const trip = state.tripDetails[tripId];

  if (!trip) {
    return jsonResponse(
      {
        status: "failed",
        error: {
          code: "TRIP_NOT_FOUND",
          message: `trip 파일을 찾을 수 없습니다: ${tripId}`,
        },
      },
      404,
    );
  }

  const body =
    init?.body && typeof init.body === "string"
      ? (JSON.parse(init.body) as { recipient_companion_ids?: string[] })
      : undefined;
  const recipientCompanionIds = [...new Set(body?.recipient_companion_ids ?? [])];

  state.sendAnalysisEmailCalls.push({
    tripId,
    body: {
      recipient_companion_ids: recipientCompanionIds,
    },
  });

  const configuredResponse = state.analysisEmailResponses[tripId];

  if (configuredResponse) {
    if (configuredResponse.status === undefined || configuredResponse.status < 400) {
      persistTripNotifications(trip, recipientCompanionIds);
    }

    return jsonResponse(configuredResponse.body, configuredResponse.status ?? 200);
  }

  const invalidRecipientIds = recipientCompanionIds.filter(
    (companionId) => !trip.party.companion_ids.includes(companionId),
  );

  if (invalidRecipientIds.length > 0) {
    return jsonResponse(
      {
        status: "failed",
        error: {
          code: "TRIP_INVALID",
          message: `현재 계획 동행자가 아닌 메일 수신 대상이 포함되어 있습니다: ${invalidRecipientIds.join(", ")}`,
        },
      },
      400,
    );
  }

  const recipients = recipientCompanionIds.map((companionId) => {
    const companion = state.companions.find((item) => item.id === companionId);

    if (!companion?.email?.trim()) {
      return null;
    }

    return {
      companion_id: companion.id,
      name: companion.name,
      email: companion.email.trim(),
    };
  });

  if (recipients.some((recipient) => recipient === null)) {
    return jsonResponse(
      {
        status: "failed",
        error: {
          code: "TRIP_INVALID",
          message: "메일 주소가 없는 동행자는 발송 대상으로 선택할 수 없습니다.",
        },
      },
      400,
    );
  }

  persistTripNotifications(trip, recipientCompanionIds);

  const responseBody: SendTripAnalysisEmailResponse = {
    trip_id: tripId,
    sent_at: "2026-03-24T11:00:00.000Z",
    sent_count: recipients.length,
    recipients: recipients.filter(
      (recipient): recipient is NonNullable<typeof recipient> => recipient !== null,
    ),
    output_path:
      state.outputs[tripId]?.output_path ??
      `.camping-data/outputs/${tripId}-plan.md`,
  };

  return jsonResponse(responseBody);
}

function persistTripNotifications(trip: TripData, recipientCompanionIds: string[]) {
  trip.notifications = {
    email_recipient_companion_ids: [...recipientCompanionIds],
  };
}
