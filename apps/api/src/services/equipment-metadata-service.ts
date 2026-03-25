import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import {
  durableEquipmentMetadataSchema,
  type DurableEquipmentItem,
  type DurableEquipmentMetadata,
  type DurableEquipmentMetadataSource,
} from "@camping/shared";
import { AppError } from "./app-error";
import {
  isAbortError,
  runCommand,
  type CommandRunner,
} from "./openai-client";

export type EquipmentMetadataSearchClient = {
  collectDurableEquipmentMetadata(input: {
    item: DurableEquipmentItem;
    categoryLabel?: string;
    signal?: AbortSignal;
  }): Promise<DurableEquipmentMetadata>;
};

export class MissingEquipmentMetadataClient
  implements EquipmentMetadataSearchClient
{
  constructor(private readonly message: string) {}

  async collectDurableEquipmentMetadata(): Promise<DurableEquipmentMetadata> {
    throw new AppError("DEPENDENCY_MISSING", this.message, 500);
  }
}

export class OpenAIEquipmentMetadataClient
  implements EquipmentMetadataSearchClient
{
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  async collectDurableEquipmentMetadata(input: {
    item: DurableEquipmentItem;
    categoryLabel?: string;
    signal?: AbortSignal;
  }): Promise<DurableEquipmentMetadata> {
    const response = await this.requestMetadata(input);
    const rawText = extractResponseText(response);

    if (!rawText.trim()) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "장비 메타데이터 응답을 비어 있는 본문으로 받았습니다.",
        502,
      );
    }

    return normalizeMetadataPayload(rawText, extractResponseSources(response));
  }

  private async requestMetadata(input: {
    item: DurableEquipmentItem;
    categoryLabel?: string;
    signal?: AbortSignal;
  }) {
    try {
      return await this.client.responses.create(
        {
          model: this.model,
          reasoning: { effort: "low" },
          tools: [{ type: "web_search_preview" }],
          tool_choice: "auto",
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: buildSystemPrompt({
                    runtime: "openai",
                  }),
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: buildUserPrompt(input),
                },
              ],
            },
          ],
        },
        input.signal ? { signal: input.signal } : undefined,
      );
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        error instanceof Error
          ? `장비 메타데이터 수집 요청에 실패했습니다. ${error.message}`
          : "장비 메타데이터 수집 요청에 실패했습니다.",
        502,
      );
    }
  }
}

export class CodexCliEquipmentMetadataClient
  implements EquipmentMetadataSearchClient
{
  constructor(
    private readonly options: {
      binary: string;
      model: string;
      reasoningEffort?: "low" | "medium" | "high" | "xhigh";
      projectRoot: string;
      outputSchemaPath: string;
      runner?: CommandRunner;
    },
  ) {}

  async collectDurableEquipmentMetadata(input: {
    item: DurableEquipmentItem;
    categoryLabel?: string;
    signal?: AbortSignal;
  }): Promise<DurableEquipmentMetadata> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "camping-codex-metadata-"));
    const outputFile = path.join(tempDir, "equipment-metadata.json");

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
          this.options.outputSchemaPath,
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
        stdin: buildCodexPrompt(input),
        signal: input.signal,
      });

      if (result.exitCode !== 0) {
        throw new AppError(
          "OPENAI_REQUEST_FAILED",
          firstMeaningfulLine(`${result.stdout}\n${result.stderr}`) ??
            "Codex CLI 장비 메타데이터 수집 요청에 실패했습니다.",
          502,
        );
      }

      const rawText = await readFile(outputFile, "utf8");
      return normalizeMetadataPayload(rawText, []);
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
          ? `Codex CLI 장비 메타데이터 수집 요청에 실패했습니다. ${error.message}`
          : "Codex CLI 장비 메타데이터 수집 요청에 실패했습니다.",
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

function buildCodexPrompt(input: {
  item: DurableEquipmentItem;
  categoryLabel?: string;
}) {
  return [
    "당신은 캠핑 장비 메타데이터를 조사해 JSON으로만 반환하는 실행기다.",
    "중요 제약:",
    "- 반드시 웹 탐색을 사용해 장비 정보를 확인하라.",
    "- 구매 링크가 있으면 반드시 우선 참고하라.",
    "- 파일을 수정하지 마라.",
    "- 셸 명령을 실행하지 마라.",
    "- JSON 객체 하나만 반환하라.",
    "",
    "## 시스템 지시",
    buildSystemPrompt({
      runtime: "codex",
    }),
    "",
    "## 조사 대상",
    buildUserPrompt(input),
  ].join("\n");
}

function buildSystemPrompt(input: { runtime: "openai" | "codex" }) {
  return [
    "당신은 캠핑 장비의 공식/준공식 제품 정보를 조사해 구조화하는 조사기다.",
    input.runtime === "openai"
      ? "반드시 웹 검색 도구를 사용하고, 구매 링크가 주어지면 우선적으로 그 링크를 참고한 뒤 추가 검색으로 보강하라."
      : "반드시 웹 탐색을 사용하고, 구매 링크가 주어지면 우선적으로 그 링크를 참고한 뒤 추가 탐색으로 보강하라.",
    "확인되지 않은 숫자를 추측으로 채우지 마라. 확실한 근거가 없으면 필드를 비워라.",
    "lookup_status 규칙:",
    "- found: 포장 크기/무게/설치 시간/수용 인원/계절·날씨 적합성 중 하나 이상을 출처와 함께 확인함",
    "- not_found: 검색했지만 실질적으로 쓸 수 있는 메타데이터를 찾지 못함",
    "- failed: 검색 결과가 너무 모순되거나 장비 식별 자체가 불가능함",
    "필드 규칙:",
    "- 스키마에 있는 필드는 누락하지 마라",
    "- searched_at 는 현재 시각 ISO 문자열 대신 그대로 '__SERVER_TIMESTAMP__' 를 넣어라",
    "- 문자열/숫자/객체 필드에 값이 없으면 null 을 넣어라",
    "- 배열 필드에 값이 없으면 빈 배열을 넣어라",
    "- season_notes 와 weather_notes 는 짧은 한국어 문장 배열로 작성하라",
    "- sources 는 title 과 url 만 넣어도 된다",
  ].join("\n");
}

function buildUserPrompt(input: {
  item: DurableEquipmentItem;
  categoryLabel?: string;
}) {
  const lines = [
    "아래 장비의 메타데이터를 수집해 JSON으로 반환하라.",
    `- 장비명: ${input.item.name}`,
    `- 모델명: ${input.item.model ?? "없음"}`,
    `- 카테고리: ${input.categoryLabel ?? input.item.category}`,
    `- 구매 링크: ${input.item.purchase_link ?? "없음"}`,
    `- 기존 메모: ${input.item.notes ?? "없음"}`,
    "",
    "반환 JSON 스키마:",
    `{
  "lookup_status": "found | not_found | failed",
  "searched_at": "__SERVER_TIMESTAMP__",
  "query": "실제 검색에 사용한 요약 질의",
  "summary": "한국어 한두 문장 요약",
  "product": {
    "brand": "브랜드",
    "official_name": "공식 상품명",
    "model": "모델명"
  },
  "packing": {
    "width_cm": 0,
    "depth_cm": 0,
    "height_cm": 0,
    "weight_kg": 0
  },
  "planning": {
    "setup_time_minutes": 0,
    "recommended_people": 0,
    "capacity_people": 0,
    "season_notes": [],
    "weather_notes": []
  },
  "sources": [
    {
      "title": "출처 제목",
      "url": "https://..."
    }
  ]
}`,
  ];

  return lines.join("\n");
}

function normalizeMetadataPayload(
  text: string,
  extraSources: DurableEquipmentMetadataSource[],
) {
  const payload = stripNullishMetadataFields(parseJsonObject(text));
  const parsed = durableEquipmentMetadataSchema.safeParse({
    ...payload,
    sources: mergeSources(extraSources, parseModelSources(payload.sources)),
  });

  if (!parsed.success) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "장비 메타데이터 응답 형식이 올바르지 않습니다.",
      502,
    );
  }

  if (parsed.data.lookup_status === "found" && parsed.data.sources.length === 0) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "장비 메타데이터 출처를 추출하지 못했습니다.",
      502,
    );
  }

  return parsed.data;
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

function parseJsonObject(text: string): Record<string, unknown> {
  const normalized = text.trim().replaceAll(
    "__SERVER_TIMESTAMP__",
    new Date().toISOString(),
  );
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const candidate = fenced?.[1]?.trim() ?? normalized;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/u);

    if (!objectMatch) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "장비 메타데이터 응답에서 JSON 객체를 추출하지 못했습니다.",
        502,
      );
    }

    try {
      return JSON.parse(objectMatch[0]) as Record<string, unknown>;
    } catch {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "장비 메타데이터 JSON 파싱에 실패했습니다.",
        502,
      );
    }
  }
}

function stripNullishMetadataFields(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "장비 메타데이터 응답에서 JSON 객체를 추출하지 못했습니다.",
      502,
    );
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) => {
      if (entryValue === null) {
        return [];
      }

      if (Array.isArray(entryValue)) {
        return [[key, entryValue.filter((item) => item !== null)]];
      }

      if (typeof entryValue === "object") {
        const nestedValue = Object.fromEntries(
          Object.entries(entryValue).flatMap(([nestedKey, nestedEntryValue]) => {
            if (nestedEntryValue === null) {
              return [];
            }

            if (Array.isArray(nestedEntryValue)) {
              return [[nestedKey, nestedEntryValue.filter((item) => item !== null)]];
            }

            return [[nestedKey, nestedEntryValue]];
          }),
        );

        return Object.keys(nestedValue).length > 0 ? [[key, nestedValue]] : [];
      }

      return [[key, entryValue]];
    }),
  );
}

function parseModelSources(value: unknown): DurableEquipmentMetadataSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("url" in item) ||
      typeof item.url !== "string" ||
      !("title" in item) ||
      typeof item.title !== "string"
    ) {
      return [];
    }

    return [
      {
        title: item.title,
        url: item.url,
        domain: extractDomain(item.url),
      },
    ];
  });
}

function extractResponseSources(response: unknown): DurableEquipmentMetadataSource[] {
  if (
    typeof response !== "object" ||
    response === null ||
    !("output" in response) ||
    !Array.isArray(response.output)
  ) {
    return [];
  }

  const sources: DurableEquipmentMetadataSource[] = [];

  for (const outputItem of response.output) {
    if (
      typeof outputItem === "object" &&
      outputItem !== null &&
      "type" in outputItem &&
      outputItem.type === "message" &&
      "content" in outputItem &&
      Array.isArray(outputItem.content)
    ) {
      for (const content of outputItem.content) {
        if (
          typeof content === "object" &&
          content !== null &&
          "annotations" in content &&
          Array.isArray(content.annotations)
        ) {
          for (const annotation of content.annotations) {
            if (
              typeof annotation === "object" &&
              annotation !== null &&
              "type" in annotation &&
              annotation.type === "url_citation" &&
              "url" in annotation &&
              typeof annotation.url === "string" &&
              "title" in annotation &&
              typeof annotation.title === "string"
            ) {
              sources.push({
                title: annotation.title,
                url: annotation.url,
                domain: extractDomain(annotation.url),
              });
            }
          }
        }
      }
    }
  }

  return dedupeSources(sources);
}

function mergeSources(
  primary: DurableEquipmentMetadataSource[],
  secondary: DurableEquipmentMetadataSource[],
) {
  return dedupeSources([...primary, ...secondary]);
}

function dedupeSources(sources: DurableEquipmentMetadataSource[]) {
  const seen = new Set<string>();

  return sources.filter((source) => {
    if (seen.has(source.url)) {
      return false;
    }

    seen.add(source.url);
    return true;
  });
}

function extractDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function firstMeaningfulLine(output: string) {
  const lines = output
    .split("\n")
    .map((line) => line.trim());

  return (
    lines.find(isActionableCodexErrorLine) ??
    lines.find(
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
        !line.startsWith("mcp startup:") &&
        !line.startsWith("당신은 ") &&
        !line.startsWith("중요 제약:") &&
        !line.startsWith("## ") &&
        !line.startsWith("- 장비명:") &&
        !line.startsWith("- 모델명:") &&
        !line.startsWith("- 카테고리:") &&
        !line.startsWith("- 구매 링크:") &&
        !line.startsWith("- 기존 메모:"),
    )
  );
}

function isActionableCodexErrorLine(line: string) {
  return (
    line.startsWith("ERROR:") ||
    line.startsWith("thread '") ||
    line.includes("panicked at") ||
    line.includes("invalid_request_error") ||
    line.includes("not supported when using Codex with a ChatGPT account") ||
    line.includes("Could not create otel exporter")
  );
}
