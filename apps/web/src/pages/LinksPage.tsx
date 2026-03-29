import type { AppViewModel } from "../app/useAppViewModel";
import { PageHost } from "./PageHost";

export function LinksPage(props: { view: AppViewModel }) {
  return <PageHost view={props.view} />;
}
