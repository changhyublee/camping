import type { AppViewModel } from "../app/useAppViewModel";
import { PageHost } from "./PageHost";

export function EquipmentPage(props: { view: AppViewModel }) {
  return <PageHost view={props.view} />;
}
