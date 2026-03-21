import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn<typeof fetch>();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("App", () => {
  it("loads a trip and renders analysis markdown", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse({
          items: [
            {
              trip_id: "2026-04-18-gapyeong",
              title: "4월 가평 가족 캠핑",
              start_date: "2026-04-18",
              region: "gapyeong",
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          trip_id: "2026-04-18-gapyeong",
          data: {
            version: 1,
            trip_id: "2026-04-18-gapyeong",
            title: "4월 가평 가족 캠핑",
            party: { companion_ids: ["self", "child-1"] },
          },
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          status: "ok",
          warnings: [],
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          trip_id: "2026-04-18-gapyeong",
          status: "completed",
          warnings: [],
          markdown: "# 4월 가평 가족 캠핑 캠핑 분석 결과\n\n## 1. 요약\n\n- 테스트 결과",
          output_path: ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
        }),
      );

    render(<App />);

    expect(await screen.findByText("4월 가평 가족 캠핑")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "분석 실행" }),
    );

    expect(await screen.findByText("테스트 결과")).toBeInTheDocument();
    expect(
      screen.getByText(".camping-data/outputs/2026-04-18-gapyeong-plan.md"),
    ).toBeInTheDocument();
  });

  it("shows API errors when analysis fails", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse({
          items: [
            {
              trip_id: "2026-04-18-gapyeong",
              title: "4월 가평 가족 캠핑",
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          trip_id: "2026-04-18-gapyeong",
          data: {
            version: 1,
            trip_id: "2026-04-18-gapyeong",
            title: "4월 가평 가족 캠핑",
            party: { companion_ids: ["self"] },
          },
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          status: "ok",
          warnings: ["예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."],
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse(
          {
            status: "failed",
            error: {
              code: "OPENAI_REQUEST_FAILED",
              message: "OpenAI 분석 요청에 실패했습니다.",
            },
          },
          502,
        ),
      );

    render(<App />);

    expect(
      await screen.findByText("예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "분석 실행" }));

    await waitFor(() => {
      expect(
        screen.getByText("OpenAI 분석 요청에 실패했습니다."),
      ).toBeInTheDocument();
    });
  });

  it("keeps the markdown visible when auto-save fails after analysis", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse({
          items: [
            {
              trip_id: "2026-04-18-gapyeong",
              title: "4월 가평 가족 캠핑",
            },
          ],
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          trip_id: "2026-04-18-gapyeong",
          data: {
            version: 1,
            trip_id: "2026-04-18-gapyeong",
            title: "4월 가평 가족 캠핑",
            party: { companion_ids: ["self"] },
          },
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          status: "ok",
          warnings: [],
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          trip_id: "2026-04-18-gapyeong",
          status: "failed",
          warnings: [],
          markdown: "# 분석은 완료됨\n\n- 저장만 실패",
          output_path: null,
          error: {
            code: "OUTPUT_SAVE_FAILED",
            message: "분석 결과를 저장하지 못했습니다: 2026-04-18-gapyeong",
          },
        }),
      );

    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: "분석 실행" }),
    );

    expect(
      await screen.findByText("분석 결과를 저장하지 못했습니다: 2026-04-18-gapyeong"),
    ).toBeInTheDocument();
    expect(screen.getByText("저장만 실패")).toBeInTheDocument();
  });
});
