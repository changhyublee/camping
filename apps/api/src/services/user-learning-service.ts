import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { stringify } from "yaml";
import {
  historyLearningInsightSchema,
  userLearningProfileSchema,
  type HistoryLearningInsight,
  type HistoryRecord,
  type UserLearningProfile,
} from "@camping/shared";
import { AppError } from "./app-error";
import {
  isAbortError,
  runCommand,
  type CommandRunner,
} from "./openai-client";

type HistoryRetrospectiveLearningInput = {
  history: HistoryRecord;
  outputMarkdown: string | null;
  promptTemplate: string;
  signal?: AbortSignal;
};

type UserLearningProfileInput = {
  insights: HistoryLearningInsight[];
  promptTemplate: string;
  signal?: AbortSignal;
};

export type UserLearningClient = {
  analyzeHistoryRetrospective(
    input: HistoryRetrospectiveLearningInput,
  ): Promise<HistoryLearningInsight>;
  synthesizeUserLearningProfile(
    input: UserLearningProfileInput,
  ): Promise<UserLearningProfile>;
};

export class MissingUserLearningClient implements UserLearningClient {
  constructor(private readonly message: string) {}

  async analyzeHistoryRetrospective(): Promise<HistoryLearningInsight> {
    throw new AppError("DEPENDENCY_MISSING", this.message, 500);
  }

  async synthesizeUserLearningProfile(): Promise<UserLearningProfile> {
    throw new AppError("DEPENDENCY_MISSING", this.message, 500);
  }
}

export class OpenAIUserLearningClient implements UserLearningClient {
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  async analyzeHistoryRetrospective(
    input: HistoryRetrospectiveLearningInput,
  ): Promise<HistoryLearningInsight> {
    const response = await this.requestText({
      systemPrompt: buildHistoryLearningSystemPrompt("openai"),
      userPrompt: buildHistoryLearningUserPrompt(input),
      signal: input.signal,
    });

    return normalizeHistoryLearningPayload(response, input.history);
  }

  async synthesizeUserLearningProfile(
    input: UserLearningProfileInput,
  ): Promise<UserLearningProfile> {
    const response = await this.requestText({
      systemPrompt: buildUserLearningProfileSystemPrompt("openai"),
      userPrompt: buildUserLearningProfileUserPrompt(input),
      signal: input.signal,
    });

    return normalizeUserLearningProfilePayload(response, input.insights);
  }

  private async requestText(input: {
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
      const text = extractResponseText(response);

      if (!text.trim()) {
        throw new AppError(
          "OPENAI_REQUEST_FAILED",
          "사용자 학습 응답을 비어 있는 본문으로 받았습니다.",
          502,
        );
      }

      return text;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        error instanceof Error
          ? `사용자 학습 요청에 실패했습니다. ${error.message}`
          : "사용자 학습 요청에 실패했습니다.",
        502,
      );
    }
  }
}

export class CodexCliUserLearningClient implements UserLearningClient {
  constructor(
    private readonly options: {
      binary: string;
      model: string;
      reasoningEffort?: "low" | "medium" | "high" | "xhigh";
      projectRoot: string;
      historyOutputSchemaPath: string;
      profileOutputSchemaPath: string;
      runner?: CommandRunner;
    },
  ) {}

  async analyzeHistoryRetrospective(
    input: HistoryRetrospectiveLearningInput,
  ): Promise<HistoryLearningInsight> {
    const rawText = await this.runJsonTask({
      outputSchemaPath: this.options.historyOutputSchemaPath,
      outputFileName: "history-learning.json",
      stdin: buildCodexPrompt({
        systemPrompt: buildHistoryLearningSystemPrompt("codex"),
        userPrompt: buildHistoryLearningUserPrompt(input),
      }),
      signal: input.signal,
    });

    return normalizeHistoryLearningPayload(rawText, input.history);
  }

  async synthesizeUserLearningProfile(
    input: UserLearningProfileInput,
  ): Promise<UserLearningProfile> {
    const rawText = await this.runJsonTask({
      outputSchemaPath: this.options.profileOutputSchemaPath,
      outputFileName: "user-learning-profile.json",
      stdin: buildCodexPrompt({
        systemPrompt: buildUserLearningProfileSystemPrompt("codex"),
        userPrompt: buildUserLearningProfileUserPrompt(input),
      }),
      signal: input.signal,
    });

    return normalizeUserLearningProfilePayload(rawText, input.insights);
  }

  private async runJsonTask(input: {
    outputSchemaPath: string;
    outputFileName: string;
    stdin: string;
    signal?: AbortSignal;
  }) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "camping-codex-learning-"));
    const outputFile = path.join(tempDir, input.outputFileName);

    try {
      const result = await this.run({
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
          input.outputSchemaPath,
          "--output-last-message",
          outputFile,
          "-c",
          "mcp_servers.github.enabled=false",
          ...(this.options.reasoningEffort
            ? ["-c", `model_reasoning_effort="${this.options.reasoningEffort}"`]
            : []),
          "-C",
          this.options.projectRoot,
          "-m",
          this.options.model,
          "-",
        ],
        stdin: input.stdin,
        signal: input.signal,
      });

      if (result.exitCode !== 0) {
        throw new AppError(
          "OPENAI_REQUEST_FAILED",
          firstMeaningfulLine(`${result.stdout}\n${result.stderr}`) ??
            "Codex CLI 사용자 학습 요청에 실패했습니다.",
          502,
        );
      }

      return await readFile(outputFile, "utf8");
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        error instanceof Error
          ? `Codex CLI 사용자 학습 요청에 실패했습니다. ${error.message}`
          : "Codex CLI 사용자 학습 요청에 실패했습니다.",
        502,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private run(input: {
    command: string;
    args: string[];
    cwd: string;
    stdin?: string;
    signal?: AbortSignal;
  }) {
    return (this.options.runner ?? runCommand)(input);
  }
}

function buildCodexPrompt(input: { systemPrompt: string; userPrompt: string }) {
  return [
    "당신은 캠핑 회고와 누적 학습을 JSON으로만 반환하는 실행기다.",
    "중요 제약:",
    "- 파일을 수정하지 마라.",
    "- 셸 명령을 실행하지 마라.",
    "- 외부 웹 탐색을 하지 말고 제공된 로컬 문맥만 사용하라.",
    "- 최종 답변은 출력 스키마를 만족하는 JSON 객체 하나만 반환하라.",
    "",
    "## 시스템 지시",
    input.systemPrompt.trim(),
    "",
    "## 입력 문맥",
    input.userPrompt.trim(),
  ].join("\n");
}

function buildHistoryLearningSystemPrompt(runtime: "openai" | "codex") {
  return [
    "당신은 캠핑 종료 후 사용자가 남긴 회고를 읽고, 실제 현장 행동과 다음 준비 힌트를 구조화하는 분석기다.",
    runtime === "openai"
      ? "제공된 입력만 사용하고, 외부 지식이나 웹 검색을 추가하지 마라."
      : "제공된 입력만 사용하고, 추가 탐색을 하지 마라.",
    "반드시 JSON 객체 하나만 반환하라.",
    "history_id 는 입력 history_id 를 그대로 사용하라.",
    "updated_at 는 반드시 '__SERVER_TIMESTAMP__' 로 넣어라.",
    "source_entry_count 는 회고 엔트리 개수를 숫자로 넣어라.",
    "summary 는 2~4문장 분량의 한국어 요약으로 작성하라.",
    "행동 패턴과 힌트 배열은 중복 없이 짧은 한국어 문장으로 정리하라.",
    "입력에 없는 사실은 추측하지 마라.",
    "좋았던 점과 아쉬운 점을 함께 반영하되, 다음 계획에 도움이 되는 실행 힌트를 우선하라.",
  ].join("\n");
}

function buildUserLearningProfileSystemPrompt(runtime: "openai" | "codex") {
  return [
    "당신은 여러 캠핑 히스토리의 회고 학습 결과를 묶어, 다음 계획에 자동 반영할 사용자 개인화 프로필을 합성하는 분석기다.",
    runtime === "openai"
      ? "제공된 히스토리 학습 JSON만 사용하고, 외부 지식이나 웹 검색을 추가하지 마라."
      : "제공된 히스토리 학습 JSON만 사용하고, 추가 탐색을 하지 마라.",
    "반드시 JSON 객체 하나만 반환하라.",
    "updated_at 는 반드시 '__SERVER_TIMESTAMP__' 로 넣어라.",
    "source_history_ids 는 실제 입력에 포함된 history_id 배열을 모두 반영하라.",
    "source_entry_count 는 전체 회고 엔트리 합계를 숫자로 넣어라.",
    "summary 는 사용자 성향을 2~4문장으로 종합하라.",
    "behavior_patterns, equipment_hints, meal_hints, route_hints, campsite_hints, avoidances, next_trip_focus 는 중복 없는 짧은 한국어 문장 배열로 작성하라.",
    "회고 근거가 약하면 단정하지 말고 보수적으로 요약하라.",
  ].join("\n");
}

function buildHistoryLearningUserPrompt(input: HistoryRetrospectiveLearningInput) {
  return [
    input.promptTemplate.trim(),
    "",
    "## history 파일",
    "```yaml",
    stringify(input.history).trim(),
    "```",
    "",
    "## 저장된 분석 결과 Markdown",
    input.outputMarkdown
      ? ["```md", input.outputMarkdown.trim(), "```"].join("\n")
      : "없음",
  ].join("\n");
}

function buildUserLearningProfileUserPrompt(input: UserLearningProfileInput) {
  return [
    input.promptTemplate.trim(),
    "",
    "## history-learning 입력",
    "```json",
    JSON.stringify(input.insights, null, 2),
    "```",
  ].join("\n");
}

function normalizeHistoryLearningPayload(
  text: string,
  history: HistoryRecord,
): HistoryLearningInsight {
  const payload = parseJsonObject(text) as Record<string, unknown>;
  const parsed = historyLearningInsightSchema.safeParse({
    history_id: history.history_id,
    updated_at: new Date().toISOString(),
    source_entry_count: history.retrospectives.length,
    summary: readRequiredString(payload.summary, "history 회고 요약"),
    behavior_patterns: readStringArray(payload.behavior_patterns),
    equipment_hints: readStringArray(payload.equipment_hints),
    meal_hints: readStringArray(payload.meal_hints),
    route_hints: readStringArray(payload.route_hints),
    campsite_hints: readStringArray(payload.campsite_hints),
    avoidances: readStringArray(payload.avoidances),
    issues: readStringArray(payload.issues),
    next_time_requests: readStringArray(payload.next_time_requests),
    next_trip_focus: readStringArray(payload.next_trip_focus),
  });

  if (!parsed.success) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "history 회고 학습 결과가 스키마를 만족하지 않습니다.",
      502,
    );
  }

  return parsed.data;
}

function normalizeUserLearningProfilePayload(
  text: string,
  insights: HistoryLearningInsight[],
): UserLearningProfile {
  const payload = parseJsonObject(text) as Record<string, unknown>;
  const parsed = userLearningProfileSchema.safeParse({
    updated_at: new Date().toISOString(),
    source_history_ids: insights.map((insight) => insight.history_id),
    source_entry_count: insights.reduce(
      (total, insight) => total + insight.source_entry_count,
      0,
    ),
    summary: readRequiredString(payload.summary, "사용자 학습 프로필 요약"),
    behavior_patterns: readStringArray(payload.behavior_patterns),
    equipment_hints: readStringArray(payload.equipment_hints),
    meal_hints: readStringArray(payload.meal_hints),
    route_hints: readStringArray(payload.route_hints),
    campsite_hints: readStringArray(payload.campsite_hints),
    avoidances: readStringArray(payload.avoidances),
    next_trip_focus: readStringArray(payload.next_trip_focus),
  });

  if (!parsed.success) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "사용자 학습 프로필 결과가 스키마를 만족하지 않습니다.",
      502,
    );
  }

  return parsed.data;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "사용자 학습 응답을 JSON으로 해석하지 못했습니다.",
      502,
    );
  }
}

function readRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      `${label}이 비어 있습니다.`,
      502,
    );
  }

  return value.trim();
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractResponseText(response: unknown): string {
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
        !line.startsWith("reasoning "),
    );
}
