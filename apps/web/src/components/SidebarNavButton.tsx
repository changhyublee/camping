import { InfoTooltip } from "./InfoTooltip";
import { navButtonClass } from "../app/tab-helpers";
import { PAGE_LABELS, type PageKey } from "../app/navigation";

export function SidebarNavButton(props: {
  active: boolean;
  description: string;
  meta: string;
  onClick: () => void;
  page: PageKey;
}) {
  const descriptionId = `nav-description-${props.page}`;

  return (
    <button
      aria-current={props.active ? "page" : undefined}
      aria-describedby={descriptionId}
      aria-label={PAGE_LABELS[props.page]}
      className={navButtonClass(props.active)}
      onClick={props.onClick}
      type="button"
    >
      <span className="nav-button__head">
        <span className="nav-button__title">{PAGE_LABELS[props.page]}</span>
        <InfoTooltip text={props.description} />
      </span>
      <span aria-hidden="true" className="nav-button__meta">
        {props.meta}
      </span>
      <span className="sr-only" id={descriptionId}>
        {props.description}
      </span>
    </button>
  );
}
