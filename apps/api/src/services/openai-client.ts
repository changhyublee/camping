import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import type { BackendHealth } from "@camping/shared";
import { AppError } from "./app-error";

export type AnalysisModelClient = {
  generateMarkdown(input: {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }): Promise<string>;
  getHealthStatus(): Promise<BackendHealth>;
};

export class MissingOpenAIClient implements AnalysisModelClient {
  async generateMarkdown(): Promise<string> {
    throw new AppError(
      "DEPENDENCY_MISSING",
      "OPENAI_API_KEY 가 없어 분석을 실행할 수 없습니다.",
      500,
    );
  }

  async getHealthStatus(): Promise<BackendHealth> {
    return {
      status: "ok",
      backend: "openai",
      ready: false,
      auth_status: "missing",
      message: "OPENAI_API_KEY 가 설정되지 않았습니다.",
    };
  }
}

export class OpenAIResponsesClient implements AnalysisModelClient {
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  async generateMarkdown(input: {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }): Promise<string> {
    try {
      const response = await this.client.responses.create(
        {
          model: this.model,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: input.systemPrompt }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: input.userPrompt }],
            },
          ],
        },
        input.signal ? { signal: input.signal } : undefined,
      );

      const text = extractOutputText(response);

      if (!text.trim()) {
        throw new AppError(
          "OPENAI_REQUEST_FAILED",
          "OpenAI 응답에서 Markdown 본문을 추출하지 못했습니다.",
          502,
        );
      }

      return text.trim();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "OpenAI 분석 요청에 실패했습니다.",
        502,
      );
    }
  }

  async getHealthStatus(): Promise<BackendHealth> {
    return {
      status: "ok",
      backend: "openai",
      ready: true,
      auth_status: "ok",
      model: this.model,
      message: "OPENAI_API_KEY 기반 OpenAI Responses API를 사용합니다.",
    };
  }
}

export type CommandRunnerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (input: {
  command: string;
  args: string[];
  cwd: string;
  stdin?: string;
  signal?: AbortSignal;
}) => Promise<CommandRunnerResult>;

export class CodexCliClient implements AnalysisModelClient {
  constructor(
    private readonly options: {
      binary: string;
      model: string;
      projectRoot: string;
      outputSchemaPath: string;
      runner?: CommandRunner;
    },
  ) {}

  async generateMarkdown(input: {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const health = await this.getHealthStatus();

    if (!health.ready) {
      throw new AppError(
        "DEPENDENCY_MISSING",
        health.message ?? "Codex CLI를 사용할 수 없습니다.",
        500,
      );
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "camping-codex-"));
    const outputFile = path.join(tempDir, "analysis.json");

    try {
      const result = await this.runCommand({
        command: this.options.binary,
        cwd: this.options.projectRoot,
        args: [
          "exec",
          "--skip-git-repo-check",
          "--ephemeral",
          "--sandbox",
          "read-only",
          "--color",
          "never",
          "--output-schema",
          this.options.outputSchemaPath,
          "--output-last-message",
          outputFile,
          "-C",
          this.options.projectRoot,
          "-m",
          this.options.model,
          "-",
        ],
        stdin: buildCodexExecPrompt(input),
        signal: input.signal,
      });

      if (result.exitCode !== 0) {
        throw new AppError(
          "OPENAI_REQUEST_FAILED",
          extractCodexFailureMessage(result) ??
            "Codex CLI 분석 요청에 실패했습니다.",
          502,
        );
      }

      const output = JSON.parse(await readFile(outputFile, "utf8")) as {
        markdown?: unknown;
      };

      if (typeof output.markdown !== "string" || !output.markdown.trim()) {
        throw new AppError(
          "OPENAI_REQUEST_FAILED",
          "Codex CLI 응답에서 Markdown 본문을 추출하지 못했습니다.",
          502,
        );
      }

      return output.markdown.trim();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "Codex CLI 분석 요청에 실패했습니다.",
        502,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async getHealthStatus(): Promise<BackendHealth> {
    try {
      const result = await this.runCommand({
        command: this.options.binary,
        args: ["login", "status"],
        cwd: this.options.projectRoot,
      });
      const output = `${result.stdout}\n${result.stderr}`;

      if (result.exitCode === 0) {
        return {
          status: "ok",
          backend: "codex-cli",
          ready: true,
          auth_status: "ok",
          model: this.options.model,
          message: firstMeaningfulLine(output) ?? "Logged in using Codex CLI",
        };
      }

      return {
        status: "ok",
        backend: "codex-cli",
        ready: false,
        auth_status: inferAuthStatus(output),
        model: this.options.model,
        message:
          firstMeaningfulLine(output) ??
          "Codex CLI 로그인 상태를 확인하지 못했습니다.",
      };
    } catch (error) {
      return {
        status: "ok",
        backend: "codex-cli",
        ready: false,
        auth_status: "missing",
        model: this.options.model,
        message: getCommandErrorMessage(error),
      };
    }
  }

  private runCommand(input: {
    command: string;
    args: string[];
    cwd: string;
    stdin?: string;
    signal?: AbortSignal;
  }) {
    return (this.options.runner ?? runCommand)(input);
  }
}

function extractOutputText(response: unknown): string {
  if (
    typeof response === "object" &&
    response !== null &&
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text;
  }

  if (
    typeof response === "object" &&
    response !== null &&
    "output" in response &&
    Array.isArray(response.output)
  ) {
    const texts: string[] = [];

    for (const item of response.output) {
      if (
        typeof item === "object" &&
        item !== null &&
        "content" in item &&
        Array.isArray(item.content)
      ) {
        for (const content of item.content) {
          if (
            typeof content === "object" &&
            content !== null &&
            "type" in content &&
            content.type === "output_text" &&
            "text" in content &&
            typeof content.text === "string"
          ) {
            texts.push(content.text);
          }
        }
      }
    }

    return texts.join("\n").trim();
  }

  return "";
}

function buildCodexExecPrompt(input: {
  systemPrompt: string;
  userPrompt: string;
}) {
  return [
    "당신은 Markdown 결과만 구조화된 JSON으로 반환하는 로컬 캠핑 분석 실행기다.",
    "중요 제약:",
    "- 파일을 수정하지 마라.",
    "- 셸 명령을 실행하지 마라.",
    "- 추가 탐색을 하지 말고 제공된 문맥만 사용하라.",
    "- 최종 답변은 출력 스키마를 만족하는 JSON 객체 하나만 반환하라.",
    "",
    "## 시스템 지시",
    input.systemPrompt.trim(),
    "",
    "## 분석 문맥",
    input.userPrompt.trim(),
  ].join("\n");
}

function extractCodexFailureMessage(result: CommandRunnerResult) {
  const output = `${result.stdout}\n${result.stderr}`;
  return firstMeaningfulLine(output);
}

function firstMeaningfulLine(output: string) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !line.startsWith("WARNING:") &&
        !line.startsWith("OpenAI Codex") &&
        !line.startsWith("--------") &&
        !line.startsWith("workdir:") &&
        !line.startsWith("model:") &&
        !line.startsWith("provider:") &&
        !line.startsWith("approval:") &&
        !line.startsWith("sandbox:") &&
        !line.startsWith("reasoning ") &&
        !line.startsWith("session id:") &&
        !line.startsWith("user") &&
        !line.startsWith("codex") &&
        !line.startsWith("tokens used") &&
        !line.startsWith("mcp:") &&
        !line.startsWith("mcp startup:"),
    );
}

function inferAuthStatus(output: string): BackendHealth["auth_status"] {
  const normalized = output.toLowerCase();

  if (normalized.includes("logged in")) {
    return "ok";
  }

  if (
    normalized.includes("not logged") ||
    normalized.includes("login") ||
    normalized.includes("auth")
  ) {
    return "missing";
  }

  return "unknown";
}

function getCommandErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  ) {
    return "Codex CLI 실행 파일을 찾을 수 없습니다. `codex` 설치 여부를 확인하세요.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Codex CLI 상태를 확인하지 못했습니다.";
}

export function createAbortError(message: string) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export async function runCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  stdin?: string;
  signal?: AbortSignal;
}): Promise<CommandRunnerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finalize = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      input.signal?.removeEventListener("abort", handleAbort);
      callback();
    };

    const handleAbort = () => {
      child.kill("SIGTERM");
      finalize(() => {
        reject(createAbortError("사용자 요청으로 AI 작업이 중단되었습니다."));
      });
    };

    if (input.signal?.aborted) {
      handleAbort();
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    input.signal?.addEventListener("abort", handleAbort, { once: true });

    child.on("error", (error) => {
      finalize(() => {
        reject(error);
      });
    });
    child.on("close", (code) => {
      finalize(() => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });
    });

    if (input.stdin) {
      child.stdin.write(input.stdin);
    }

    child.stdin.end();
  });
}
