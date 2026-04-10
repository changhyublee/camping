import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import {
  tripWeatherResearchSchema,
  type TripWeatherResearch,
} from "@camping/shared";
import { AppError } from "./app-error";
import {
  isAbortError,
  runCommand,
  type CommandRunner,
} from "./openai-client";

export type TripWeatherCollectionInput = {
  region: string;
  startDate?: string;
  endDate?: string;
  campsiteName?: string;
  signal?: AbortSignal;
};

export type TripWeatherSearchClient = {
  collectTripWeather(input: TripWeatherCollectionInput): Promise<TripWeatherResearch>;
};

type FetchLike = typeof fetch;

type GoogleSearchContext = {
  query: string;
  searchUrl: string;
  responseText: string;
};

const GOOGLE_SEARCH_RESPONSE_MAX_CHARS = 12000;

export class MissingTripWeatherClient implements TripWeatherSearchClient {
  constructor(private readonly message: string) {}

  async collectTripWeather(): Promise<TripWeatherResearch> {
    throw new AppError("DEPENDENCY_MISSING", this.message, 500);
  }
}

export class OpenAITripWeatherClient implements TripWeatherSearchClient {
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  async collectTripWeather(input: TripWeatherCollectionInput): Promise<TripWeatherResearch> {
    const searchContext = await fetchGoogleSearchContext(input, this.fetchImpl);
    const response = await this.requestWeatherResearch(input, searchContext);
    const rawText = extractResponseText(response);

    if (!rawText.trim()) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "날씨 수집 응답을 비어 있는 본문으로 받았습니다.",
        502,
      );
    }

    return normalizeWeatherResearch(rawText, searchContext);
  }

  private async requestWeatherResearch(
    input: TripWeatherCollectionInput,
    searchContext: GoogleSearchContext,
  ) {
    try {
      return await this.client.responses.create(
        {
          model: this.model,
          reasoning: { effort: "low" },
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: buildSystemPrompt(),
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: buildUserPrompt(input, searchContext),
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
          ? `날씨 수집 분석 요청에 실패했습니다. ${error.message}`
          : "날씨 수집 분석 요청에 실패했습니다.",
        502,
      );
    }
  }
}

export class CodexCliTripWeatherClient implements TripWeatherSearchClient {
  constructor(
    private readonly options: {
      binary: string;
      model: string;
      reasoningEffort?: "low" | "medium" | "high" | "xhigh";
      projectRoot: string;
      outputSchemaPath: string;
      runner?: CommandRunner;
      fetchImpl?: FetchLike;
    },
  ) {}

  async collectTripWeather(input: TripWeatherCollectionInput): Promise<TripWeatherResearch> {
    const searchContext = await fetchGoogleSearchContext(
      input,
      this.options.fetchImpl ?? fetch,
    );
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "camping-codex-weather-"));
    const outputFile = path.join(tempDir, "trip-weather.json");

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
        stdin: buildCodexPrompt(input, searchContext),
        signal: input.signal,
      });

      if (result.exitCode !== 0) {
        throw new AppError(
          "OPENAI_REQUEST_FAILED",
          firstMeaningfulLine(`${result.stdout}\n${result.stderr}`) ??
            "Codex CLI 날씨 수집 분석 요청에 실패했습니다.",
          502,
        );
      }

      const rawText = await readFile(outputFile, "utf8");
      return normalizeWeatherResearch(rawText, searchContext);
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
          ? `Codex CLI 날씨 수집 분석 요청에 실패했습니다. ${error.message}`
          : "Codex CLI 날씨 수집 분석 요청에 실패했습니다.",
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

function buildCodexPrompt(
  input: TripWeatherCollectionInput,
  searchContext: GoogleSearchContext,
) {
  return [
    "당신은 Google 검색 결과 응답을 읽고 캠핑 계획용 날씨 요약 JSON만 반환하는 실행기다.",
    "중요 제약:",
    "- 주어진 Google 검색 응답 텍스트만 사용하라.",
    "- 추가 웹 탐색을 하지 마라.",
    "- 파일을 수정하지 마라.",
    "- 셸 명령을 실행하지 마라.",
    "- JSON 객체 하나만 반환하라.",
    "",
    "## 시스템 지시",
    buildSystemPrompt(),
    "",
    "## 입력 컨텍스트",
    buildUserPrompt(input, searchContext),
  ].join("\n");
}

function buildSystemPrompt() {
  return [
    "당신은 캠핑 계획에 필요한 날씨 정보를 Google 검색 결과 텍스트에서 구조화하는 조사기다.",
    "반드시 제공된 google.com 검색 결과 응답 텍스트만 근거로 사용하라.",
    "응답 텍스트에 없는 사실을 추측으로 채우지 마라.",
    "lookup_status 규칙:",
    "- found: 날씨 요약과 함께 온도 범위 또는 강수 정보를 하나 이상 신뢰성 있게 읽을 수 있음",
    "- not_found: 검색 결과 응답에 날씨 정보가 부족하거나 명확하지 않음",
    "- failed: 검색 결과 응답이 막혔거나 읽을 수 없어서 날씨 판단이 불가능함",
    "필드 규칙:",
    "- 스키마에 있는 필드는 누락하지 마라",
    "- searched_at 는 현재 시각 ISO 문자열 대신 그대로 '__SERVER_TIMESTAMP__' 를 넣어라",
    "- 문자열/숫자 필드에 값이 없으면 null 을 넣어라",
    "- 배열 필드에 값이 없으면 빈 배열을 넣어라",
    "- source 는 'google-search-ai' 를 넣어라",
    "- google_search_url 은 전달받은 URL 그대로 넣어라",
    "- summary 와 precipitation 은 짧은 한국어 문장으로 적어라",
    "- search_result_excerpt 는 실제 근거가 된 텍스트 일부를 1~2문장으로 적어라",
    "- notes 는 예보 범위 불확실성이나 검색 한계를 짧은 한국어 문장 배열로 적어라",
    "- sources 는 최소한 Google 검색 URL 1건을 포함하라",
  ].join("\n");
}

function buildUserPrompt(
  input: TripWeatherCollectionInput,
  searchContext: GoogleSearchContext,
) {
  return [
    "아래 캠핑 계획 컨텍스트와 Google 검색 결과 응답을 읽고 날씨 요약 JSON을 반환하라.",
    `- 지역: ${input.region}`,
    `- 캠핑장명: ${input.campsiteName ?? "없음"}`,
    `- 시작일: ${input.startDate ?? "없음"}`,
    `- 종료일: ${input.endDate ?? "없음"}`,
    `- Google 검색 질의: ${searchContext.query}`,
    `- Google 검색 URL: ${searchContext.searchUrl}`,
    "",
    "## Google 검색 결과 응답 텍스트",
    searchContext.responseText,
    "",
    "반환 JSON 스키마:",
    `{
  "lookup_status": "found | not_found | failed",
  "searched_at": "__SERVER_TIMESTAMP__",
  "query": "실제 Google 검색 질의",
  "region": "지역",
  "campsite_name": "캠핑장명",
  "start_date": "시작일",
  "end_date": "종료일",
  "summary": "예상 날씨 요약",
  "min_temp_c": 9,
  "max_temp_c": 17,
  "precipitation": "강수 정보",
  "search_result_excerpt": "판단 근거가 된 검색 결과 텍스트 요약",
  "source": "google-search-ai",
  "google_search_url": "https://www.google.com/search?...",
  "notes": ["불확실성 메모"],
  "sources": [
    {
      "title": "Google 검색 결과",
      "url": "https://www.google.com/search?..."
    }
  ]
}`,
  ].join("\n");
}

async function fetchGoogleSearchContext(
  input: TripWeatherCollectionInput,
  fetchImpl: FetchLike,
): Promise<GoogleSearchContext> {
  validateCollectionInput(input);
  const query = buildGoogleWeatherQuery(input);
  const searchUrl = `https://www.google.com/search?hl=ko&gl=kr&q=${encodeURIComponent(query)}`;
  let response: Response;

  try {
    response = await fetchImpl(searchUrl, {
      headers: {
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      },
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      error instanceof Error
        ? `Google 날씨 검색 요청에 실패했습니다. ${error.message}`
        : "Google 날씨 검색 요청에 실패했습니다.",
      502,
    );
  }

  if (!response.ok) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      `Google 날씨 검색 응답이 실패했습니다. status=${response.status}`,
      502,
    );
  }

  const html = await response.text();
  const responseText = extractGoogleSearchText(html);

  if (!responseText) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "Google 검색 결과 응답에서 텍스트를 추출하지 못했습니다.",
      502,
    );
  }

  return {
    query,
    searchUrl,
    responseText,
  };
}

function validateCollectionInput(input: TripWeatherCollectionInput) {
  if (!input.region.trim()) {
    throw new AppError("TRIP_INVALID", "날씨 수집에는 지역 정보가 필요합니다.", 400);
  }

  if (!input.startDate && !input.endDate) {
    throw new AppError(
      "TRIP_INVALID",
      "날씨 수집에는 시작일 또는 종료일이 필요합니다.",
      400,
    );
  }
}

function buildGoogleWeatherQuery(input: TripWeatherCollectionInput) {
  return [
    input.region.trim(),
    input.campsiteName?.trim(),
    input.startDate?.trim(),
    input.endDate?.trim(),
    "날씨",
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function extractGoogleSearchText(html: string) {
  const withoutScript = html
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, " ");
  const text = decodeHtmlEntities(
    withoutScript.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim(),
  );

  return text.slice(0, GOOGLE_SEARCH_RESPONSE_MAX_CHARS);
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    );
}

function normalizeWeatherResearch(
  text: string,
  searchContext: Pick<GoogleSearchContext, "query" | "searchUrl">,
): TripWeatherResearch {
  const payload = stripNullishFields(parseJsonObject(text));
  const parsed = tripWeatherResearchSchema.safeParse({
    ...payload,
    query: payload.query ?? searchContext.query,
    google_search_url: payload.google_search_url ?? searchContext.searchUrl,
    source: payload.source ?? "google-search-ai",
    sources: mergeSources(
      [
        {
          title: "Google 검색 결과",
          url: searchContext.searchUrl,
          domain: "www.google.com",
        },
      ],
      parseModelSources(payload.sources),
    ),
  });

  if (!parsed.success) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "날씨 수집 응답 형식이 올바르지 않습니다.",
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
        "날씨 수집 응답에서 JSON 객체를 추출하지 못했습니다.",
        502,
      );
    }

    try {
      return JSON.parse(objectMatch[0]) as Record<string, unknown>;
    } catch {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        "날씨 수집 JSON 파싱에 실패했습니다.",
        502,
      );
    }
  }
}

function stripNullishFields(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(
      "OPENAI_REQUEST_FAILED",
      "날씨 수집 응답에서 JSON 객체를 추출하지 못했습니다.",
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

function parseModelSources(value: unknown) {
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

function mergeSources(
  primary: TripWeatherResearch["sources"],
  secondary: TripWeatherResearch["sources"],
) {
  const seen = new Set<string>();

  return [...primary, ...secondary].filter((source) => {
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
        !line.startsWith("- 지역:") &&
        !line.startsWith("- 캠핑장명:") &&
        !line.startsWith("- 시작일:") &&
        !line.startsWith("- 종료일:") &&
        !line.startsWith("- Google 검색 질의:") &&
        !line.startsWith("- Google 검색 URL:"),
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
