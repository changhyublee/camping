import type { AppViewModel } from "../app/useAppViewModel";
import { PlanningPageContent } from "../features/planning/PlanningPageContent";

export function PlanningPage(props: { view: AppViewModel }) {
  return <PlanningPageContent view={props.view} />;
}
