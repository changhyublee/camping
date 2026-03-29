import type { AppViewModel } from "../app/useAppViewModel";
import { PageHost } from "./PageHost";

export function DashboardPage(props: { view: AppViewModel }) {
  return <PageHost view={props.view} />;
}
