import type {
  ConsumableEquipmentItem,
  DurableEquipmentItem,
  PlanningAssistantAction,
  PrecheckItem,
  TripBundle,
} from "@camping/shared";
import { collectPlanningWarnings } from "./trip-validation";
import type { AnalysisModelClient } from "./openai-client";

type PlanningAssistantResult = {
  assistant_message: string;
  warnings: string[];
  actions: PlanningAssistantAction[];
};

export async function runPlanningAssistant(input: {
  bundle: TripBundle;
  message: string;
  modelClient: AnalysisModelClient;
}): Promise<PlanningAssistantResult> {
  const warnings = collectPlanningWarnings(input.bundle).warnings;
  const actions = buildPlanningAssistantActions(input.bundle, input.message);

  try {
    const assistantMessage = await input.modelClient.generateMarkdown({
      systemPrompt: [
        "당신은 로컬 캠핑 계획을 함께 정리하는 계획 보조 AI다.",
        "사용자의 현재 trip 데이터와 장비 상태를 읽고, 폼에서 무엇을 먼저 채워야 하는지 짧게 안내하라.",
        "반드시 한국어 Markdown으로 답하라.",
        "실제로 파일을 수정했다고 말하지 마라.",
        "응답은 6줄 이하의 짧은 안내로 제한하라.",
      ].join("\n"),
      userPrompt: buildPlanningPrompt(input.bundle, input.message, warnings, actions),
    });

    return {
      assistant_message: assistantMessage,
      warnings,
      actions,
    };
  } catch {
    return {
      assistant_message: buildFallbackAssistantMessage(
        input.bundle,
        input.message,
        warnings,
        actions,
      ),
      warnings,
      actions,
    };
  }
}

function buildPlanningAssistantActions(
  bundle: TripBundle,
  message: string,
): PlanningAssistantAction[] {
  const actions: PlanningAssistantAction[] = [];
  const loweredMessage = message.toLowerCase();
  const partySize = bundle.trip.party.companion_ids.length;
  const sleepingItems = bundle.durableEquipment.items.filter(
    (item) => item.category === "sleeping",
  );
  const sleepingQuantity = sleepingItems.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  if (partySize > 0 && sleepingQuantity < partySize) {
    const delta = partySize - sleepingQuantity;

    if (sleepingItems[0]) {
      actions.push({
        id: "increase-sleeping",
        section: "durable",
        action: "increase_quantity",
        title: "침낭 수량 보강",
        reason: `현재 인원 ${partySize}명 대비 침낭 수량이 ${sleepingQuantity}개입니다.`,
        item_id: sleepingItems[0].id,
        quantity_delta: delta,
      });
    } else {
      actions.push({
        id: "add-sleeping-bag",
        section: "durable",
        action: "add_item",
        title: "침낭 항목 추가",
        reason: `현재 인원 ${partySize}명 기준 기본 침낭 항목이 없습니다.`,
        durable_item: buildDurableSuggestion({
          id: "sleeping-bag-family-extra",
          name: "가족용 추가 침낭",
          category: "sleeping",
          quantity: delta,
          tags: ["family"],
        }),
      });
    }
  }

  const expectsRain =
    loweredMessage.includes("비") ||
    loweredMessage.includes("우천") ||
    bundle.trip.conditions?.expected_weather?.precipitation === "rain";
  const hasRainCover = bundle.durableEquipment.items.some((item) =>
    item.tags?.includes("rain_cover"),
  );

  if (expectsRain && !hasRainCover) {
    actions.push({
      id: "add-rain-cover",
      section: "durable",
      action: "add_item",
      title: "우천 대비 타프 추가",
      reason: "우천 가능성이 있는데 빗물 가림용 장비가 확인되지 않습니다.",
      durable_item: buildDurableSuggestion({
        id: "rain-tarp-family",
        name: "우천 대비 패밀리 타프",
        category: "shelter",
        quantity: 1,
        tags: ["rain_cover"],
      }),
    });
  }

  if (bundle.trip.conditions?.electricity_available === false) {
    const lanternBattery = bundle.precheck.items.find(
      (item) => item.id === "lantern-battery" || item.category === "battery",
    );

    if (lanternBattery) {
      actions.push({
        id: "mark-battery-check",
        section: "precheck",
        action: "mark_needs_check",
        title: "랜턴 배터리 점검",
        reason: "전기 사용이 어려우므로 조명 배터리 확인이 우선입니다.",
        item_id: lanternBattery.id,
      });
    } else {
      actions.push({
        id: "add-battery-check",
        section: "precheck",
        action: "add_item",
        title: "배터리 점검 항목 추가",
        reason: "전기 사용이 어려워 조명 점검 항목이 필요합니다.",
        precheck_item: buildPrecheckSuggestion({
          id: "lantern-battery-check",
          name: "랜턴 배터리 점검",
          category: "battery",
        }),
      });
    }
  }

  const wantsBbq =
    loweredMessage.includes("바베큐") ||
    loweredMessage.includes("bbq") ||
    (bundle.trip.meal_plan?.requested_dishes ?? []).some((dish) =>
      dish.toLowerCase().includes("bbq"),
    );
  const hasFirepit = bundle.durableEquipment.items.some(
    (item) => item.category === "cooking_fire",
  );

  if (wantsBbq && !hasFirepit) {
    actions.push({
      id: "add-firepit",
      section: "durable",
      action: "add_item",
      title: "화로대 추가",
      reason: "바베큐 계획이 있는데 조리용 화로대가 확인되지 않습니다.",
      durable_item: buildDurableSuggestion({
        id: "firepit-planning-add",
        name: "계획용 화로대",
        category: "cooking_fire",
        quantity: 1,
      }),
    });
  }

  const butane = bundle.consumables.items.find((item) => item.id === "butane-gas");

  if (
    butane &&
    (butane.status === "low" ||
      butane.quantity_on_hand <= (butane.low_stock_threshold ?? 0))
  ) {
    actions.push({
      id: "increase-butane",
      section: "consumables",
      action: "increase_quantity",
      title: "부탄가스 수량 보강",
      reason: "현재 부탄가스 재고가 낮아 이번 일정 기준으로 여유분 확보가 필요합니다.",
      item_id: butane.id,
      quantity_delta: 2,
    });
  }

  return actions;
}

function buildPlanningPrompt(
  bundle: TripBundle,
  message: string,
  warnings: string[],
  actions: PlanningAssistantAction[],
): string {
  const warningLines =
    warnings.length > 0
      ? warnings.map((warning) => `- ${warning}`).join("\n")
      : "- 현재 큰 경고 없음";
  const actionLines =
    actions.length > 0
      ? actions.map((action) => `- ${action.title}: ${action.reason}`).join("\n")
      : "- 현재 자동 제안 액션 없음";
  const equipmentLines = buildEquipmentMetadataLines(bundle);

  return [
    "## 사용자 메시지",
    message.trim(),
    "",
    "## 현재 trip 요약",
    `- 제목: ${bundle.trip.title}`,
    `- 일정: ${bundle.trip.date?.start ?? "미입력"} ~ ${bundle.trip.date?.end ?? "미입력"}`,
    `- 장소: ${bundle.trip.location?.campsite_name ?? "미입력"} / ${bundle.trip.location?.region ?? "미입력"}`,
    `- 동행자 수: ${bundle.trip.party.companion_ids.length}`,
    `- 차량: ${formatVehicleLine(bundle)}`,
    "",
    "## 현재 경고",
    warningLines,
    "",
    "## 자동 제안 액션",
    actionLines,
    "",
    "## 장비 메타데이터 요약",
    equipmentLines,
    "",
    "짧고 실용적으로 지금 폼에서 먼저 바꿀 것과 장비에서 바로 확인할 것을 안내하라.",
  ].join("\n");
}

function buildFallbackAssistantMessage(
  bundle: TripBundle,
  message: string,
  warnings: string[],
  actions: PlanningAssistantAction[],
): string {
  const lines = [
    `### 계획 보조 요약`,
    `- 요청 메모: ${message.trim()}`,
    `- 현재 일정: ${bundle.trip.date?.start ?? "미입력"} ~ ${bundle.trip.date?.end ?? "미입력"}`,
    `- 장소: ${bundle.trip.location?.region ?? "미입력"}`,
    `- 차량: ${formatVehicleLine(bundle)}`,
  ];

  if (warnings[0]) {
    lines.push(`- 우선 경고: ${warnings[0]}`);
  }

  if (actions[0]) {
    lines.push(`- 바로 적용 추천: ${actions[0].title}`);
  } else {
    lines.push("- 바로 적용할 자동 액션은 없고, 폼 값 보완 후 다시 확인하는 편이 좋습니다.");
  }

  return lines.join("\n");
}

function buildEquipmentMetadataLines(bundle: TripBundle) {
  const items = bundle.durableEquipment.items;

  if (items.length === 0) {
    return "- 등록된 반복 장비가 없음";
  }

  return items
    .slice(0, 12)
    .map((item) => {
      const metadata = item.metadata;

      if (!metadata) {
        return `- ${item.name}: 메타데이터 없음`;
      }

      if (metadata.lookup_status === "not_found") {
        return `- ${item.name}: 재원 정보 미확인`;
      }

      if (metadata.lookup_status === "failed") {
        return `- ${item.name}: 메타데이터 수집 실패`;
      }

      const size = metadata.packing
        ? [
            metadata.packing.width_cm,
            metadata.packing.depth_cm,
            metadata.packing.height_cm,
          ]
            .filter((value): value is number => typeof value === "number")
            .join("x")
        : "";
      const weight =
        typeof metadata.packing?.weight_kg === "number"
          ? `${metadata.packing.weight_kg}kg`
          : "";
      const setup =
        typeof metadata.planning?.setup_time_minutes === "number"
          ? `${metadata.planning.setup_time_minutes}분`
          : "";

      return `- ${item.name}: ${
        [
          size ? `포장 ${size}cm` : "",
          weight ? `무게 ${weight}` : "",
          setup ? `설치 ${setup}` : "",
        ]
          .filter(Boolean)
          .join(", ") || "수집 완료"
      }`;
    })
    .join("\n");
}

function formatVehicleLine(bundle: TripBundle) {
  const vehicle = bundle.selected_vehicle;

  if (!vehicle) {
    return "미선택";
  }

  const parts = [vehicle.name];

  if (vehicle.passenger_capacity) {
    parts.push(`탑승 ${vehicle.passenger_capacity}명`);
  }

  if (vehicle.load_capacity_kg) {
    parts.push(`적재 ${vehicle.load_capacity_kg}kg`);
  }

  return parts.join(" / ");
}

function buildDurableSuggestion(input: {
  id: string;
  name: string;
  category: string;
  quantity: number;
  tags?: string[];
}): DurableEquipmentItem {
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    quantity: input.quantity,
    status: "ok",
    tags: input.tags,
  };
}

function buildPrecheckSuggestion(input: {
  id: string;
  name: string;
  category: string;
}): PrecheckItem {
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    status: "needs_check",
  };
}
