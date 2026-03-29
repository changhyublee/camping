import type { AppViewModel } from "../app/useAppViewModel";
import { LinksPageContent } from "../features/links/LinksPageContent";

export function LinksPage(props: { view: AppViewModel }) {
  return <LinksPageContent view={props.view} />;
}
