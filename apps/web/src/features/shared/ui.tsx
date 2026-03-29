import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

export function FormField(props: { children: ReactNode; full?: boolean; label: string }) {
  const child =
    isValidElement(props.children) &&
    typeof props.children.type === "string" &&
    ["input", "select", "textarea"].includes(props.children.type)
      ? cloneElement(
          props.children as ReactElement<Record<string, unknown>>,
          {
            "aria-label":
              (props.children.props as Record<string, unknown>)["aria-label"] ?? props.label,
          },
        )
      : props.children;

  return (
    <div className={props.full ? "field form-grid__full" : "field"}>
      <span className="field__label">{props.label}</span>
      {child}
    </div>
  );
}

export function MetricCard(props: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}
