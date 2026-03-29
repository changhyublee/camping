import type { AppViewModel } from "../app/useAppViewModel";
import { CategoriesPageContent } from "../features/categories/CategoriesPageContent";

export function CategoriesPage(props: { view: AppViewModel }) {
  return <CategoriesPageContent view={props.view} />;
}
