import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  type AnalyzeTripResponse,
} from "@camping/shared";
import { App } from "./App";
import {
  createAnalysisResponse,
  openPageTab,
  state,
} from "./test/app-test-helpers";

function createCompletedAnalysisResponse(tripId: string): AnalyzeTripResponse {
  const base = createAnalysisResponse(tripId);

  return {
    ...base,
    status: "completed",
    requested_at: "2026-03-24T10:00:00.000Z",
    started_at: "2026-03-24T10:00:01.000Z",
    finished_at: "2026-03-24T10:00:30.000Z",
    output_path: `.camping-data/outputs/${tripId}-plan.md`,
    categories: base.categories.map((category) => ({
      ...category,
      status: "completed",
      has_result: true,
      requested_at: "2026-03-24T10:00:00.000Z",
      started_at: "2026-03-24T10:00:01.000Z",
      finished_at: "2026-03-24T10:00:30.000Z",
      collected_at: "2026-03-24T10:00:30.000Z",
    })),
    completed_category_count: ALL_TRIP_ANALYSIS_CATEGORIES.length,
  };
}

describe("App analysis email", () => {
  it("keeps analysis email sending disabled until every analysis category result is ready", async () => {
    state.tripDetails["2026-04-18-gapyeong"].notifications = {
      email_recipient_companion_ids: ["self"],
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    expect(
      screen.getByRole("button", { name: "분석 결과 메일 발송" }),
    ).toBeDisabled();
    expect(
      screen.getByText("전체 분석 실행 후 모든 분석 항목 결과가 준비되어야 발송할 수 있습니다."),
    ).toBeInTheDocument();
  });

  it("disables recipient selection for selected companions without email", async () => {
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: createCompletedAnalysisResponse("2026-04-18-gapyeong"),
    };
    state.outputAvailability["2026-04-18-gapyeong"] = true;

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    expect(
      screen.getByRole("checkbox", { name: "메일 주소가 없어 발송할 수 없음" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "이 동행자에게 분석 결과 메일 발송" }),
    ).toBeEnabled();
  });

  it("sends analysis email only to checked companions in the planning summary cards", async () => {
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: createCompletedAnalysisResponse("2026-04-18-gapyeong"),
    };
    state.outputAvailability["2026-04-18-gapyeong"] = true;

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    const guardianCard = screen.getByText("보호자").closest("label");
    expect(guardianCard).not.toBeNull();
    await userEvent.click(within(guardianCard as HTMLElement).getByRole("checkbox"));

    const recipientCheckboxes = screen.getAllByRole("checkbox", {
      name: "이 동행자에게 분석 결과 메일 발송",
    });
    await userEvent.click(recipientCheckboxes[0]);
    await userEvent.click(recipientCheckboxes[1]);
    await userEvent.click(screen.getByRole("button", { name: "분석 결과 메일 발송" }));

    expect(state.sendAnalysisEmailCalls).toEqual([
      {
        tripId: "2026-04-18-gapyeong",
        body: {
          recipient_companion_ids: ["self", "guardian-1"],
        },
      },
    ]);
    expect(
      await screen.findByText((content) =>
        content.includes(
          "2명에게 발송했습니다. .camping-data/outputs/2026-04-18-gapyeong-plan.md",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("allows manual analysis email sending from the analysis results tab", async () => {
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: createCompletedAnalysisResponse("2026-04-18-gapyeong"),
    };
    state.outputAvailability["2026-04-18-gapyeong"] = true;

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    const guardianCard = screen.getByText("보호자").closest("label");
    expect(guardianCard).not.toBeNull();
    await userEvent.click(within(guardianCard as HTMLElement).getByRole("checkbox"));

    const recipientCheckboxes = screen.getAllByRole("checkbox", {
      name: "이 동행자에게 분석 결과 메일 발송",
    });
    await userEvent.click(recipientCheckboxes[0]);
    await userEvent.click(recipientCheckboxes[1]);

    await openPageTab("캠핑 계획", "AI·결과");
    await userEvent.click(screen.getByRole("tab", { name: "분석 결과" }));

    expect(screen.getByText("섹션별 분석")).toBeInTheDocument();

    const sendButton = screen.getByRole("button", { name: "분석 결과 메일 발송" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await userEvent.click(sendButton);

    expect(state.sendAnalysisEmailCalls).toEqual([
      {
        tripId: "2026-04-18-gapyeong",
        body: {
          recipient_companion_ids: ["self", "guardian-1"],
        },
      },
    ]);
  });

  it("keeps the saved trip state in sync even when analysis email sending fails", async () => {
    state.analysisStatuses["2026-04-18-gapyeong"] = {
      body: createCompletedAnalysisResponse("2026-04-18-gapyeong"),
    };
    state.outputAvailability["2026-04-18-gapyeong"] = true;
    state.analysisEmailResponses["2026-04-18-gapyeong"] = {
      status: 500,
      body: {
        status: "failed",
        warnings: [],
        error: {
          code: "INTERNAL_ERROR",
          message: "SMTP 전송 실패",
        },
      },
    };

    render(<App />);

    await openPageTab("캠핑 계획", "원본 입력");

    const titleInput = screen.getByLabelText("계획 제목");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "수정된 메일 발송 테스트 계획");

    const recipientCheckbox = screen.getAllByRole("checkbox", {
      name: "이 동행자에게 분석 결과 메일 발송",
    })[0];
    await userEvent.click(recipientCheckbox);
    await userEvent.click(screen.getByRole("button", { name: "분석 결과 메일 발송" }));

    expect(
      await screen.findByText((content) =>
        content.includes("캠핑 계획 저장은 반영했지만 메일 발송은 실패했습니다."),
      ),
    ).toBeInTheDocument();

    await openPageTab("캠핑 계획", "계획 목록");

    expect(screen.getByText("수정된 메일 발송 테스트 계획")).toBeInTheDocument();
  });
});
