import type { AppViewModel } from "../app/useAppViewModel";
import { EquipmentPageContent } from "../features/equipment/EquipmentPageContent";

export function EquipmentPage(props: { view: AppViewModel }) {
  return <EquipmentPageContent view={props.view} />;
}
