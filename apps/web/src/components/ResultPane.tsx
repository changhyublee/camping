import ReactMarkdown from "react-markdown";
import type { AnalyzeTripResponse } from "@camping/shared";
import { StatusBanner } from "./StatusBanner";

type ResultPaneProps = {
  response: AnalyzeTripResponse | null;
  isAnalyzing: boolean;
  errorMessage: string | null;
  saveMessage: string | null;
  isSaving: boolean;
  onSave: () => void;
};

export function ResultPane({
  response,
  isAnalyzing,
  errorMessage,
  saveMessage,
  isSaving,
  onSave,
}: ResultPaneProps) {
  const partialSaveFailureMessage =
    response?.error?.code === "OUTPUT_SAVE_FAILED" ? response.error.message : null;

  return (
    <section className="panel panel--result">
      <div className="panel__eyebrow">Result</div>
      <div className="panel__header">
        <h2>분석 결과</h2>
        {response?.output_path ? (
          <code className="output-path">{response.output_path}</code>
        ) : null}
      </div>

      {errorMessage ? (
        <StatusBanner tone="error" title="분석 실패" description={errorMessage} />
      ) : null}

      {saveMessage ? (
        <StatusBanner tone="success" title="저장 완료" description={saveMessage} />
      ) : null}

      {partialSaveFailureMessage ? (
        <StatusBanner
          tone="warning"
          title="결과 생성 완료, 저장 실패"
          description={partialSaveFailureMessage}
        />
      ) : null}

      {response?.warnings.length ? (
        <StatusBanner
          tone="warning"
          title="결과 경고"
          description="응답은 생성됐지만 제한사항이 있다."
          items={response.warnings}
        />
      ) : null}

      {isAnalyzing ? (
        <div className="empty-state">
          문서 기준, YAML 데이터, 프롬프트를 조합해 Markdown 결과를 생성하는
          중...
        </div>
      ) : response?.markdown ? (
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
            <ReactMarkdown>{response.markdown}</ReactMarkdown>
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
