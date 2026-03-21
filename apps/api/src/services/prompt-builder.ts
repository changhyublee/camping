import { stringify } from "yaml";
import type { TripBundle } from "@camping/shared";

type PromptDocument = {
  name: string;
  content: string;
};

type BuildPromptInput = {
  bundle: TripBundle;
  analysisPrompt: string;
  referenceDocuments: PromptDocument[];
  warnings: string[];
  overrideInstructions?: string;
};

function serializeYamlSection(title: string, value: unknown): string {
  return `## ${title}\n\`\`\`yaml\n${stringify(value).trim()}\n\`\`\``;
}

function serializeJsonSection(title: string, value: unknown): string {
  return `## ${title}\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export function buildAnalysisPrompt({
  bundle,
  analysisPrompt,
  referenceDocuments,
  warnings,
  overrideInstructions,
}: BuildPromptInput): string {
  const documentBlock = referenceDocuments
    .map(
      (document) =>
        `## ${document.name}\n\`\`\`md\n${document.content.trim()}\n\`\`\``,
    )
    .join("\n\n");

  const cacheSections = [
    ...bundle.caches.weather.map((cache) =>
      serializeJsonSection(`cache/weather/${cache.name}`, cache.content),
    ),
    ...bundle.caches.places.map((cache) =>
      serializeJsonSection(`cache/places/${cache.name}`, cache.content),
    ),
  ];

  const warningLines =
    warnings.length > 0
      ? warnings.map((warning) => `- ${warning}`).join("\n")
      : "- 현재 검증 경고 없음";

  const overrideBlock = overrideInstructions?.trim()
    ? `\n## 추가 사용자 지시\n${overrideInstructions.trim()}\n`
    : "";

  return [
    "# 분석 작업 지시",
    analysisPrompt.trim(),
    "",
    "## 검증 경고",
    warningLines,
    overrideBlock.trim(),
    "",
    "# 문서 기준",
    documentBlock,
    "",
    "# 로컬 데이터",
    serializeYamlSection("profile.yaml", bundle.profile),
    serializeYamlSection("companions.yaml", bundle.companions),
    serializeYamlSection("equipment/durable.yaml", bundle.durableEquipment),
    serializeYamlSection("equipment/consumables.yaml", bundle.consumables),
    serializeYamlSection("equipment/precheck.yaml", bundle.precheck),
    serializeYamlSection("preferences/travel.yaml", bundle.travelPreferences),
    serializeYamlSection("preferences/food.yaml", bundle.foodPreferences),
    serializeYamlSection(`trips/${bundle.trip.trip_id}.yaml`, bundle.trip),
    "",
    "# 선택적 캐시",
    cacheSections.length > 0 ? cacheSections.join("\n\n") : "없음",
  ]
    .filter(Boolean)
    .join("\n\n");
}
