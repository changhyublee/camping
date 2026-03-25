import {
  ALL_TRIP_ANALYSIS_CATEGORIES,
  TRIP_ANALYSIS_CATEGORY_METADATA,
  type TripAnalysisCategory,
  type TripAnalysisResultsCache,
  type TripData,
} from "@camping/shared";

const MISSING_SECTION_COPY = "아직 수집하지 않음. 해당 섹션을 실행해 주세요.";

export function createEmptyTripAnalysisResultsCache(
  trip: Pick<TripData, "trip_id" | "title">,
): TripAnalysisResultsCache {
  return {
    trip_id: trip.trip_id,
    title: trip.title,
    updated_at: new Date().toISOString(),
    categories: [],
  };
}

export function upsertTripAnalysisCategoryResult(
  cache: TripAnalysisResultsCache,
  input: {
    category: TripAnalysisCategory;
    markdown: string;
    updatedAt?: string;
  },
): TripAnalysisResultsCache {
  const metadata = TRIP_ANALYSIS_CATEGORY_METADATA[input.category];
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const nextCategories = [
    ...cache.categories.filter((category) => category.category !== input.category),
    {
      category: input.category,
      label: metadata.label,
      sections: metadata.sections,
      markdown: input.markdown.trim(),
      updated_at: updatedAt,
    },
  ].sort(
    (left, right) =>
      left.sections[0]?.order - right.sections[0]?.order,
  );

  return {
    ...cache,
    updated_at: updatedAt,
    categories: nextCategories,
  };
}

export function composeTripAnalysisMarkdown(input: {
  title: string;
  resultsCache?: TripAnalysisResultsCache | null;
}): string {
  const resultMap = new Map(
    (input.resultsCache?.categories ?? []).map((category) => [
      category.category,
      category.markdown.trim(),
    ]),
  );

  return [
    `# ${input.title} 캠핑 분석 결과`,
    "",
    ...ALL_TRIP_ANALYSIS_CATEGORIES.flatMap((category) => {
      const markdown = resultMap.get(category);
      return markdown
        ? [markdown, ""]
        : [buildMissingCategoryMarkdown(category), ""];
    }),
  ]
    .join("\n")
    .trim();
}

export function extractTripAnalysisCategoryMarkdown(
  category: TripAnalysisCategory,
  rawMarkdown: string,
): string {
  const metadata = TRIP_ANALYSIS_CATEGORY_METADATA[category];
  const blocksByOrder = parseMarkdownSections(rawMarkdown);
  const extractedBlocks = metadata.sections
    .map((section) => blocksByOrder.get(section.order))
    .filter((value): value is string => !!value);

  if (extractedBlocks.length > 0) {
    return extractedBlocks.join("\n\n").trim();
  }

  const normalized = rawMarkdown
    .replace(/^# .*\n*/u, "")
    .trim();

  if (metadata.sections.length === 1) {
    return [
      `## ${metadata.sections[0].order}. ${metadata.sections[0].title}`,
      "",
      normalized || MISSING_SECTION_COPY,
    ].join("\n");
  }

  return metadata.sections
    .map((section, index) =>
      [
        `## ${section.order}. ${section.title}`,
        "",
        index === 0 && normalized ? normalized : MISSING_SECTION_COPY,
      ].join("\n"),
    )
    .join("\n\n")
    .trim();
}

function buildMissingCategoryMarkdown(category: TripAnalysisCategory) {
  return TRIP_ANALYSIS_CATEGORY_METADATA[category].sections
    .map(
      (section) =>
        `## ${section.order}. ${section.title}\n\n${MISSING_SECTION_COPY}`,
    )
    .join("\n\n");
}

function parseMarkdownSections(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const blocks = new Map<number, string>();
  let currentOrder: number | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(\d+)\.\s+.+$/u);

    if (headingMatch) {
      if (currentOrder !== null) {
        blocks.set(currentOrder, currentLines.join("\n").trim());
      }

      currentOrder = Number(headingMatch[1]);
      currentLines = [line];
      continue;
    }

    if (currentOrder !== null) {
      currentLines.push(line);
    }
  }

  if (currentOrder !== null) {
    blocks.set(currentOrder, currentLines.join("\n").trim());
  }

  return blocks;
}
