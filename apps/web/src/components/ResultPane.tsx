import ReactMarkdown from "react-markdown";
import type { AnalyzeTripResponse, GetOutputResponse } from "@camping/shared";
import { StatusBanner } from "./StatusBanner";

type ResultPaneProps = {
  output: GetOutputResponse | null;
  status: AnalyzeTripResponse | null;
  isAnalyzing: boolean;
  errorMessage: string | null;
  saveMessage: string | null;
  isSaving: boolean;
  onSave: () => void;
};

export function ResultPane({
  output,
  status,
  isAnalyzing,
  errorMessage,
  saveMessage,
  isSaving,
  onSave,
}: ResultPaneProps) {
  return (
    <section className="panel panel--result">
      <div className="panel__eyebrow">Result</div>
      <div className="panel__header">
        <h2>분석 결과</h2>
        {output?.output_path ?? status?.output_path ? (
          <code className="output-path">
            {output?.output_path ?? status?.output_path}
          </code>
        ) : null}
      </div>

      {errorMessage ? (
        <StatusBanner tone="error" title="분석 실패" description={errorMessage} />
      ) : null}

      {saveMessage ? (
        <StatusBanner tone="success" title="저장 완료" description={saveMessage} />
      ) : null}

      {status?.status === "failed" ? (
        <StatusBanner
          tone="error"
          title="분석 실패"
          description={status.error?.message ?? "백그라운드 분석 작업이 실패했습니다."}
        />
      ) : null}

      {status?.status === "interrupted" ? (
        <StatusBanner
          tone="warning"
          title="분석 중단"
          description={
            status.error?.message ?? "이전 분석 작업이 중단되었습니다. 다시 실행해 주세요."
          }
        />
      ) : null}

      {isAnalyzing ? (
        <div className="empty-state">
          문서 기준, YAML 데이터, 프롬프트를 조합해 Markdown 결과를 생성하는
          중...
        </div>
      ) : output?.markdown ? (
        <>
          <div className="action-row action-row--end">
            <button
              className="button"
              disabled={isSaving}
              onClick={onSave}
              type="button"
            >
              {isSaving ? "저장 중..." : "결과 저장"}
            </button>
          </div>
          <article className="markdown-pane">
            <ReactMarkdown>{output.markdown}</ReactMarkdown>
          </article>
        </>
      ) : (
        <div className="empty-state">
          아직 분석 결과가 없다. 가운데 패널에서 실행하면 Markdown 결과가 여기에
          표시된다.
        </div>
      )}
    </section>
  );
}
