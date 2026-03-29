import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(process.cwd(), "src");
const APP_FILE = join(SRC_ROOT, "App.tsx");
const APP_SHELL_FILE = join(SRC_ROOT, "app", "AppShell.tsx");
const MAIN_FILE = join(SRC_ROOT, "main.tsx");
const PAGES_DIR = join(SRC_ROOT, "pages");
const APP_DIR = join(SRC_ROOT, "app");
const COMPONENTS_DIR = join(SRC_ROOT, "components");

function getLineCount(filePath: string) {
  return readFileSync(filePath, "utf8").trimEnd().split("\n").length;
}

function collectTsxFiles(directoryPath: string) {
  return readdirSync(directoryPath)
    .filter((fileName) => fileName.endsWith(".tsx"))
    .map((fileName) => join(directoryPath, fileName));
}

describe("프런트엔드 구조 가드", () => {
  it("App.tsx 는 얇은 진입점만 담당한다", () => {
    const source = readFileSync(APP_FILE, "utf8");

    expect(getLineCount(APP_FILE)).toBeLessThanOrEqual(20);
    expect(source).not.toMatch(/use(State|Effect|Memo|Ref|Reducer|Transition)/);
    expect(source).not.toMatch(/fetch\(|apiClient/);
    expect(source).toMatch(/AppShell/);
  });

  it("AppShell 은 셸 조합만 담당하고 직접 API를 호출하지 않는다", () => {
    const source = readFileSync(APP_SHELL_FILE, "utf8");

    expect(getLineCount(APP_SHELL_FILE)).toBeLessThanOrEqual(320);
    expect(source).not.toMatch(/fetch\(|apiClient/);
    expect(source).not.toMatch(/MarkdownLayer,\s*useAppViewModel|InfoTooltip,\s*useAppViewModel/);
  });

  it("페이지 엔트리는 작게 유지되고 도메인 API를 직접 호출하지 않는다", () => {
    const pageFiles = readdirSync(PAGES_DIR).filter(
      (fileName) => fileName.endsWith("Page.tsx") || fileName === "PageHost.tsx",
    );

    expect(pageFiles.length).toBeGreaterThanOrEqual(9);

    for (const fileName of pageFiles) {
      const filePath = join(PAGES_DIR, fileName);
      const source = readFileSync(filePath, "utf8");

      expect(getLineCount(filePath)).toBeLessThanOrEqual(80);
      expect(source).not.toMatch(/fetch\(|apiClient/);
    }
  });

  it("새 상위 TSX 파일은 대형 컴포넌트로 커지지 않도록 제한한다", () => {
    const guardedFiles = [
      ...collectTsxFiles(APP_DIR),
      ...collectTsxFiles(COMPONENTS_DIR),
      ...collectTsxFiles(PAGES_DIR),
    ];

    for (const filePath of guardedFiles) {
      const fileName = filePath.split("/").at(-1) ?? filePath;

      if (fileName === "useAppViewModel.tsx") {
        continue;
      }

      expect(getLineCount(filePath)).toBeLessThanOrEqual(400);
    }
  });

  it("main.tsx 는 App 진입만 담당한다", () => {
    const source = readFileSync(MAIN_FILE, "utf8");

    expect(source).toMatch(/from "\.\/App"/);
    expect(source).not.toMatch(/apiClient|StatusBanner|useAppViewModel|AppShell/);
  });
});
