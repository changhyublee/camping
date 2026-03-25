import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import {
  campsiteTipsResearchSchema,
  type CampsiteTipSource,
  type CampsiteTipsResearch,
  type TripBundle,
} from "@camping/shared";
import { AppError } from "./app-error";
import { runCommand, type CommandRunner } from "./openai-client";

export type CampsiteTipSearchClient = {
  collectCampsiteTips(input: { bundle: TripBundle }): Promise<CampsiteTipsResearch>;
};

export class MissingCampsiteTipClient implements CampsiteTipSearchClient {
  constructor(private readonly message: string) {}

  async collectCampsiteTips(): Promise<CampsiteTipsResearch> {
    throw new AppError("DEPENDENCY_MISSING", this.message, 500);
  }
}

export class OpenAICampsiteTipClient implements CampsiteTipSearchClient {
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  async collectCampsiteTips(input: {
    bundle: TripBundle;
  }): Promise<CampsiteTipsResearch> {
    const response = await this.requestResearch(input);
    const rawText = extractResponseText(response);

    if (!rawText.trim()) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "캠핑장 tip 조사 응답을 비어 있는 본문으로 받았습니다.",
        502,
      );
    }

    return normalizeResearchPayload(rawText, parseResponseSources(response));
  }

  private async requestResearch(input: { bundle: TripBundle }) {
    try {
      return await this.client.responses.create({
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
                text: buildSystemPrompt({ runtime: "openai" }),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildUserPrompt(input.bundle),
              },
            ],
          },
        ],
      });
    } catch (error) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        error instanceof Error
          ? `캠핑장 tip 조사 요청에 실패했습니다. ${error.message}`
          : "캠핑장 tip 조사 요청에 실패했습니다.",
        502,
      );
    }
  }
}

export class CodexCliCampsiteTipClient implements CampsiteTipSearchClient {
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

  async collectCampsiteTips(input: {
    bundle: TripBundle;
  }): Promise<CampsiteTipsResearch> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "camping-codex-campsite-"));
    const outputFile = path.join(tempDir, "campsite-tip.json");

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
        stdin: buildCodexPrompt(input.bundle),
      });

      if (result.exitCode !== 0) {
        throw new AppError(
          "OPENAI_REQUEST_FAILED",
          firstMeaningfulLine(`${result.stdout}\n${result.stderr}`) ??
            "Codex CLI 캠핑장 tip 조사 요청에 실패했습니다.",
          502,
        );
      }

      const rawText = await readFile(outputFile, "utf8");
      return normalizeResearchPayload(rawText, []);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        error instanceof Error
          ? `Codex CLI 캠핑장 tip 조사 요청에 실패했습니다. ${error.message}`
          : "Codex CLI 캠핑장 tip 조사 요청에 실패했습니다.",
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
  }) {
    return (this.options.runner ?? runCommand)(input);
  }
}

function buildCodexPrompt(bundle: TripBundle) {
  return [
    "당신은 캠핑장 이용 후기 블로그를 조사해 JSON으로만 반환하는 실행기다.",
    "중요 제약:",
    "- 반드시 웹 탐색을 사용해 같은 캠핑장 후기 블로그를 확인하라.",
    "- 공식 소개 페이지보다 실제 방문 후기 블로그를 우선 참고하라.",
    "- 파일을 수정하지 마라.",
    "- 셸 명령을 실행하지 마라.",
    "- JSON 객체 하나만 반환하라.",
    "",
    "## 시스템 지시",
    buildSystemPrompt({ runtime: "codex" }),
    "",
    "## 조사 대상",
    buildUserPrompt(bundle),
  ].join("\n");
}

function buildSystemPrompt(input: { runtime: "openai" | "codex" }) {
  return [
    "당신은 실제 방문 후기 블로그를 조사해 같은 캠핑장을 가는 사람에게 바로 도움이 되는 이용 tip을 구조화하는 조사기다.",
    input.runtime === "openai"
      ? "반드시 웹 검색 도구를 사용하고, 공식/예약 페이지보다 실제 후기 블로그를 우선 확인하라."
      : "반드시 웹 탐색을 사용하고, 공식/예약 페이지보다 실제 후기 블로그를 우선 확인하라.",
    "후기 작성자가 실제로 같은 캠핑장을 다녀온 정황이 명확한 글만 사용하라.",
    "같은 캠핑장 후기 블로그 2개 이상을 찾으면 우선 반영하고, 충분하지 않으면 not_found 로 두어라.",
    "실용 팁은 사이트 배치, 그늘, 소음, 주차, 체크인, 화장실/샤워실, 장보기, 아이 동반, 계절 대응처럼 현장 이용에 바로 도움이 되는 것만 적어라.",
    "후기에서 특정 사이트 번호나 구역이 명당으로 언급되면 best_site_items 에 정리하라. 예: A4, A7, B12, 159~175, 호수 앞 데크 구역.",
    "확인되지 않은 내용은 추측으로 채우지 마라.",
    "lookup_status 규칙:",
    "- found: 같은 캠핑장 후기 블로그를 바탕으로 실용 tip이나 명당 사이트 정보를 2개 이상 정리할 수 있음",
    "- not_found: 같은 캠핑장 후기 블로그를 찾지 못했거나 tip 근거가 충분하지 않음",
    "- failed: 검색 결과가 지나치게 모순되거나 캠핑장 식별 자체가 불가능함",
    "필드 규칙:",
    "- 스키마에 있는 필드는 누락하지 마라",
    "- searched_at 는 현재 시각 ISO 문자열 대신 그대로 '__SERVER_TIMESTAMP__' 를 넣어라",
    "- 문자열/객체 필드에 값이 없으면 null 을 넣어라",
    "- 배열 필드에 값이 없으면 빈 배열을 넣어라",
    "- tip_items 는 2~5개 사이의 짧은 한국어 실용 팁으로 작성하라",
    "- best_site_items 는 실제 후기에서 사이트 번호나 구역명이 드러난 경우에만 0~4개 작성하라",
    "- site_name 은 후기에서 확인된 표기 그대로 최대한 유지하라",
    "- reason 은 왜 명당으로 언급됐는지, 예를 들면 시야, 그늘, 소음 회피, 화장실 거리, 아이 놀기 편함 같은 근거를 적어라",
    "- helpful_for 는 어떤 상황에서 특히 도움이 되는지 짧게 적고, 없으면 null 을 넣어라",
    "- caution 은 명당이어도 같이 언급된 단점이 있으면 짧게 적고, 없으면 null 을 넣어라",
    "- sources 는 실제로 참고한 후기 블로그 링크만 넣어라",
  ].join("\n");
}

function buildUserPrompt(bundle: TripBundle) {
  const selectedCompanions = bundle.trip.party.companion_ids
    .map((id) => bundle.companions.companions.find((companion) => companion.id === id))
    .filter(Boolean)
    .map((companion) => `${companion?.name}(${companion?.age_group})`);

  return [
    "아래 trip에 대해 같은 캠핑장을 다녀온 사람들의 후기 블로그를 확인하고 이용 tip을 JSON으로 반환하라.",
    `- 캠핑장명: ${bundle.trip.location?.campsite_name ?? "없음"}`,
    `- 지역: ${bundle.trip.location?.region ?? "없음"}`,
    `- 시작일: ${bundle.trip.date?.start ?? "없음"}`,
    `- 종료일: ${bundle.trip.date?.end ?? "없음"}`,
    `- 예상 날씨: ${bundle.trip.conditions?.expected_weather?.summary ?? "없음"}`,
    `- 동행자: ${selectedCompanions.length > 0 ? selectedCompanions.join(", ") : "없음"}`,
    `- 차량: ${bundle.selected_vehicle?.name ?? bundle.trip.vehicle?.name ?? "없음"}`,
    `- trip 메모: ${(bundle.trip.notes ?? []).join(" / ") || "없음"}`,
    "",
    "반환 JSON 스키마:",
    `{
  "lookup_status": "found | not_found | failed",
  "searched_at": "__SERVER_TIMESTAMP__",
  "query": "실제 검색에 사용한 요약 질의",
  "campsite_name": "캠핑장명",
  "region": "지역명",
  "summary": "후기 기반 한두 문장 요약",
  "tip_items": [
    {
      "title": "짧은 팁 제목",
      "detail": "준비/이용에 바로 도움이 되는 설명",
      "helpful_for": "특히 도움이 되는 상황"
    }
  ],
  "best_site_items": [
    {
      "site_name": "A4, A7",
      "reason": "앞 시야가 트여 경치가 좋고 가로막힘이 적다고 언급됨",
      "helpful_for": "뷰 중시, 사진 찍기 좋은 자리 선호",
      "caution": "바람을 더 탈 수 있음"
    }
  ],
  "sources": [
    {
      "title": "후기 글 제목",
      "url": "https://..."
    }
  ]
}`,
  ].join("\n");
}

function normalizeResearchPayload(
  text: string,
  extraSources: CampsiteTipSource[],
): CampsiteTipsResearch {
  const payload = stripNullishFields(parseJsonObject(text));
  const parsed = campsiteTipsResearchSchema.safeParse({
    ...payload,
    sources: mergeSources(extraSources, parseModelSources(payload.sources)),
  });

  if (!parsed.success) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "캠핑장 tip 조사 응답 형식이 올바르지 않습니다.",
      502,
    );
  }

  if (
    parsed.data.lookup_status === "found" &&
    parsed.data.tip_items.length + parsed.data.best_site_items.length < 2
  ) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "캠핑장 tip 조사 응답에서 실용 tip 또는 명당 정보를 충분히 추출하지 못했습니다.",
      502,
    );
  }

  if (parsed.data.lookup_status === "found" && parsed.data.sources.length < 2) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "캠핑장 tip 조사 출처를 후기 블로그 2개 이상으로 추출하지 못했습니다.",
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
        "캠핑장 tip 조사 응답에서 JSON 객체를 추출하지 못했습니다.",
        502,
      );
    }

    try {
      return JSON.parse(objectMatch[0]) as Record<string, unknown>;
    } catch {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "캠핑장 tip 조사 JSON 파싱에 실패했습니다.",
        502,
      );
    }
  }
}

function stripNullishFields(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "캠핑장 tip 조사 응답에서 JSON 객체를 추출하지 못했습니다.",
      502,
    );
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) => {
      if (entryValue === null) {
        return [];
      }

      if (Array.isArray(entryValue)) {
        return [
          [
            key,
            entryValue
              .filter((item) => item !== null)
              .map((item) =>
                typeof item === "object" && item !== null && !Array.isArray(item)
                  ? Object.fromEntries(
                      Object.entries(item).flatMap(([nestedKey, nestedValue]) =>
                        nestedValue === null ? [] : [[nestedKey, nestedValue]],
                      ),
                    )
                  : item,
              ),
          ],
        ];
      }

      if (typeof entryValue === "object") {
        const nestedValue = Object.fromEntries(
          Object.entries(entryValue).flatMap(([nestedKey, nestedEntryValue]) =>
            nestedEntryValue === null ? [] : [[nestedKey, nestedEntryValue]],
          ),
        );

        return Object.keys(nestedValue).length > 0 ? [[key, nestedValue]] : [];
      }

      return [[key, entryValue]];
    }),
  );
}

function parseModelSources(value: unknown): CampsiteTipSource[] {
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

function parseResponseSources(response: unknown): CampsiteTipSource[] {
  if (
    typeof response !== "object" ||
    response === null ||
    !("output" in response) ||
    !Array.isArray(response.output)
  ) {
    return [];
  }

  const sources: CampsiteTipSource[] = [];

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

function mergeSources(primary: CampsiteTipSource[], secondary: CampsiteTipSource[]) {
  return dedupeSources([...primary, ...secondary]);
}

function dedupeSources(sources: CampsiteTipSource[]) {
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
        !line.startsWith("- 캠핑장명:") &&
        !line.startsWith("- 지역:") &&
        !line.startsWith("- 시작일:") &&
        !line.startsWith("- 종료일:") &&
        !line.startsWith("- 예상 날씨:") &&
        !line.startsWith("- 동행자:") &&
        !line.startsWith("- 차량:") &&
        !line.startsWith("- trip 메모:"),
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
