import type { AppViewModel } from "../app/useAppViewModel";
import { PageHost } from "./PageHost";

export function CategoriesPage(props: { view: AppViewModel }) {
  return <PageHost view={props.view} />;
}
