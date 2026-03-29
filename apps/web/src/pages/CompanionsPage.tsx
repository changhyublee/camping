import type { AppViewModel } from "../app/useAppViewModel";
import { CompanionsPageContent } from "../features/companions/CompanionsPageContent";

export function CompanionsPage(props: { view: AppViewModel }) {
  return <CompanionsPageContent view={props.view} />;
}
