import type { AppViewModel } from "../app/useAppViewModel";
import { HelpPageContent } from "../features/help/HelpPageContent";

export function HelpPage(props: { view: AppViewModel }) {
  return <HelpPageContent view={props.view} />;
}
