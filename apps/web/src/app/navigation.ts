export type PageKey =
  | "dashboard"
  | "planning"
  | "history"
  | "companions"
  | "vehicles"
  | "equipment"
  | "links"
  | "categories"
  | "help";

export const PAGE_KEYS: PageKey[] = [
  "dashboard",
  "planning",
  "history",
  "companions",
  "vehicles",
  "equipment",
  "links",
  "categories",
  "help",
];

export const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: "대시보드",
  planning: "캠핑 계획",
  history: "캠핑 히스토리",
  companions: "사람 관리",
  vehicles: "차량 관리",
  equipment: "장비 관리",
  links: "외부 링크",
  categories: "카테고리 설정",
  help: "보조 설명",
};

export const PAGE_PATHS: Record<PageKey, string> = {
  dashboard: "/dashboard",
  planning: "/planning",
  history: "/history",
  companions: "/companions",
  vehicles: "/vehicles",
  equipment: "/equipment",
  links: "/links",
  categories: "/categories",
  help: "/help",
};

export const NAVIGATION_GROUPS: Array<{
  title: string;
  description: string;
  items: PageKey[];
}> = [
  {
    title: "운영 허브",
    description: "현재 상태 확인과 계획 실행",
    items: ["dashboard", "planning", "history"],
  },
  {
    title: "준비 데이터",
    description: "사람, 차량, 장비와 참고 정보를 정리",
    items: ["companions", "vehicles", "equipment", "links"],
  },
  {
    title: "관리 설정",
    description: "기준 데이터와 보조 설명 관리",
    items: ["categories", "help"],
  },
];

export function getPathForPage(page: PageKey) {
  return PAGE_PATHS[page];
}

export function getPageForPathname(pathname: string): PageKey {
  if (pathname === "/") {
    return "dashboard";
  }

  const normalizedPathname = pathname.endsWith("/") && pathname !== "/"
    ? pathname.slice(0, -1)
    : pathname;

  for (const page of PAGE_KEYS) {
    if (PAGE_PATHS[page] === normalizedPathname) {
      return page;
    }
  }

  return "dashboard";
}
