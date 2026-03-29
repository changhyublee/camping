import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";

export function MarkdownLayer(props: {
  eyebrow: string;
  title: string;
  description: string;
  outputPath: string | null;
  markdown: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !panelRef.current) {
      return;
    }

    const focusableElements = getFocusableElements(panelRef.current);

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const currentElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (currentElement === firstElement || !panelRef.current.contains(currentElement)) {
        event.preventDefault();
        lastElement.focus();
      }

      return;
    }

    if (currentElement === lastElement || !panelRef.current.contains(currentElement)) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div
      aria-labelledby="markdown-layer-title"
      aria-modal="true"
      className="markdown-layer"
      onClick={props.onClose}
      role="dialog"
    >
      <div className="markdown-layer__backdrop" />
      <section
        className="markdown-layer__panel"
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
      >
        <div className="markdown-layer__header">
          <div className="markdown-layer__copy">
            <div className="panel__eyebrow">{props.eyebrow}</div>
            <h2 id="markdown-layer-title">{props.title}</h2>
            <p>{props.description}</p>
          </div>
          <button
            aria-label="결과 레이어 닫기"
            className="button"
            onClick={props.onClose}
            ref={closeButtonRef}
            type="button"
          >
            닫기
          </button>
        </div>
        {props.outputPath ? <code className="output-path">{props.outputPath}</code> : null}
        <article className="markdown-pane markdown-pane--layer">
          <ReactMarkdown>{props.markdown}</ReactMarkdown>
        </article>
      </section>
    </div>
  );
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("aria-hidden"));
}
