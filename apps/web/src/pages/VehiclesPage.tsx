import type { AppViewModel } from "../app/useAppViewModel";
import { VehiclesPageContent } from "../features/vehicles/VehiclesPageContent";

export function VehiclesPage(props: { view: AppViewModel }) {
  return <VehiclesPageContent view={props.view} />;
}
