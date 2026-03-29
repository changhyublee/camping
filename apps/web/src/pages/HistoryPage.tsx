import type { AppViewModel } from "../app/useAppViewModel";
import { HistoryPageContent } from "../features/history/HistoryPageContent";

export function HistoryPage(props: { view: AppViewModel }) {
  return <HistoryPageContent view={props.view} />;
}
