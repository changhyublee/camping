import type { AppViewModel } from "../app/useAppViewModel";

export function PageHost(props: { view: AppViewModel }) {
  return props.view.renderPageContent();
}
