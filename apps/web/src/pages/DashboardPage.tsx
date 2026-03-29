import type { AppViewModel } from "../app/useAppViewModel";
import { DashboardPageContent } from "../features/dashboard/DashboardPageContent";

export function DashboardPage(props: { view: AppViewModel }) {
  return <DashboardPageContent view={props.view} />;
}
