import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(process.cwd(), "src");
const APP_FILE = join(SRC_ROOT, "App.tsx");
const APP_SHELL_FILE = join(SRC_ROOT, "app", "AppShell.tsx");
const APP_VIEW_MODEL_FILE = join(SRC_ROOT, "app", "useAppViewModel.tsx");
const MAIN_FILE = join(SRC_ROOT, "main.tsx");
const PAGES_DIR = join(SRC_ROOT, "pages");
const APP_DIR = join(SRC_ROOT, "app");
const APP_STATE_DIR = join(APP_DIR, "state");
const COMPONENTS_DIR = join(SRC_ROOT, "components");
const FEATURES_DIR = join(SRC_ROOT, "features");

function getLineCount(filePath: string) {
  return readFileSync(filePath, "utf8").trimEnd().split("\n").length;
}

function collectFiles(directoryPath: string, extension: ".ts" | ".tsx"): string[] {
  return readdirSync(directoryPath).flatMap((fileName) => {
    const filePath = join(directoryPath, fileName);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      return collectFiles(filePath, extension);
    }

    if (
      !fileName.endsWith(extension) ||
      fileName.endsWith(".test.ts") ||
      fileName.endsWith(".test.tsx")
    ) {
      return [];
    }

    return [filePath];
  });
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

  it("useAppViewModel 은 adapter 경계를 유지하고 공통 helper 구현을 별도 모듈로 위임한다", () => {
    const source = readFileSync(APP_VIEW_MODEL_FILE, "utf8");

    expect(getLineCount(APP_VIEW_MODEL_FILE)).toBeLessThanOrEqual(3300);
    expect(source).toMatch(/from "\.\/ui-state"/);
    expect(source).toMatch(/from "\.\/common-formatters"/);
    expect(source).toMatch(/from "\.\/view-model-drafts"/);
    expect(source).toMatch(/from "\.\/planning-history-helpers"/);
    expect(source).toMatch(/from "\.\/equipment-view-helpers"/);
    expect(source).toMatch(/from "\.\/state\/usePlanningState"/);
    expect(source).toMatch(/from "\.\/state\/useEquipmentState"/);
    expect(source).toMatch(/from "\.\/state\/useHistoryState"/);
    expect(source).toMatch(/from "\.\/state\/useReferenceDataState"/);
    expect(source).toMatch(/from "\.\/state\/useUiShellState"/);
    expect(source).not.toMatch(/const UI_STATE_STORAGE_KEY =/);
    expect(source).not.toMatch(/window\.sessionStorage\.(getItem|setItem)/);
    expect(source).not.toMatch(/type PersistedUiState =/);
  });

  it("app/state 훅은 도메인별 상태 경계만 담당하고 작게 유지한다", () => {
    const stateFiles = collectFiles(APP_STATE_DIR, ".ts");

    expect(stateFiles.length).toBeGreaterThanOrEqual(5);

    for (const filePath of stateFiles) {
      const source = readFileSync(filePath, "utf8");

      expect(getLineCount(filePath)).toBeLessThanOrEqual(220);
      expect(source).not.toMatch(/fetch\(|apiClient/);
    }
  });

  it("페이지 엔트리는 작게 유지되고 도메인 API를 직접 호출하지 않는다", () => {
    const pageFiles = readdirSync(PAGES_DIR).filter((fileName) => fileName.endsWith("Page.tsx"));

    expect(pageFiles.length).toBeGreaterThanOrEqual(9);
    expect(existsSync(join(PAGES_DIR, "PageHost.tsx"))).toBe(false);

    for (const fileName of pageFiles) {
      const filePath = join(PAGES_DIR, fileName);
      const source = readFileSync(filePath, "utf8");

      expect(getLineCount(filePath)).toBeLessThanOrEqual(80);
      expect(source).not.toMatch(/fetch\(|apiClient/);
    }
  });

  it("새 상위 TSX 파일은 대형 컴포넌트로 커지지 않도록 제한한다", () => {
    const guardedFiles = [
      ...collectFiles(APP_DIR, ".tsx"),
      ...collectFiles(COMPONENTS_DIR, ".tsx"),
      ...collectFiles(PAGES_DIR, ".tsx"),
    ];

    for (const filePath of guardedFiles) {
      const fileName = filePath.split("/").at(-1) ?? filePath;

      if (fileName === "useAppViewModel.tsx") {
        continue;
      }

      expect(getLineCount(filePath)).toBeLessThanOrEqual(400);
    }
  });

  it("상위 app 계층의 TS 모듈도 다시 비대해지지 않도록 제한한다", () => {
    const guardedFiles = collectFiles(APP_DIR, ".ts");

    for (const filePath of guardedFiles) {
      expect(getLineCount(filePath)).toBeLessThanOrEqual(320);
    }
  });

  it("feature 계층 파일도 도메인 단위로 나뉜 상태를 유지한다", () => {
    const featureTsxFiles = collectFiles(FEATURES_DIR, ".tsx");
    const featureTsFiles = collectFiles(FEATURES_DIR, ".ts");

    for (const filePath of featureTsxFiles) {
      expect(getLineCount(filePath)).toBeLessThanOrEqual(700);
    }

    for (const filePath of featureTsFiles) {
      expect(getLineCount(filePath)).toBeLessThanOrEqual(500);
    }
  });

  it("main.tsx 는 App 진입만 담당한다", () => {
    const source = readFileSync(MAIN_FILE, "utf8");

    expect(source).toMatch(/from "\.\/App"/);
    expect(source).not.toMatch(/apiClient|StatusBanner|useAppViewModel|AppShell/);
  });
});
