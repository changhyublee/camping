import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  companionsSchema,
  consumableEquipmentSchema,
  durableEquipmentSchema,
  externalLinksSchema,
  foodPreferencesSchema,
  getHistoryFilename,
  getTripOutputFilename,
  getTripOutputRelativePath,
  historyRecordSchema,
  isTripId,
  precheckSchema,
  profileSchema,
  toTripSummary,
  travelPreferencesSchema,
  tripSchema,
  type ConsumableEquipmentData,
  type ConsumableEquipmentItem,
  type ConsumableEquipmentItemInput,
  type DurableEquipmentData,
  type DurableEquipmentItem,
  type DurableEquipmentItemInput,
  type EquipmentCatalog,
  type EquipmentSection,
  type ExternalLink,
  type ExternalLinkInput,
  type ExternalLinksData,
  type GetOutputResponse,
  type HistoryRecord,
  type PrecheckData,
  type PrecheckItem,
  type PrecheckItemInput,
  type TripBundle,
  type TripData,
  type TripDraft,
  type TripId,
  type TripSummary,
} from "@camping/shared";
import { parse, stringify } from "yaml";
import type { AppConfig } from "../config";
import { AppError } from "../services/app-error";

const REQUIRED_DOC_PATHS = [
  "README.md",
  "docs/requirements.md",
  "docs/technical-architecture.md",
  "docs/data-model.md",
  "docs/trip-analysis-workflow.md",
];

type NamedTextFile = {
  name: string;
  content: string;
};

type EquipmentItemInput =
  | DurableEquipmentItemInput
  | ConsumableEquipmentItemInput
  | PrecheckItemInput;

type EquipmentItem = DurableEquipmentItem | ConsumableEquipmentItem | PrecheckItem;

export class CampingRepository {
  constructor(private readonly config: AppConfig) {}

  async listTripSummaries(): Promise<TripSummary[]> {
    const tripFiles = await this.listYamlFiles(this.getTripsDir());
    const items = await Promise.all(
      tripFiles.map(async (fileName) => {
        const tripId = fileName.replace(/\.ya?ml$/u, "");

        if (!isTripId(tripId)) {
          return null;
        }

        try {
          const trip = await this.readTrip(tripId);
          return {
            ...toTripSummary(trip),
            trip_id: tripId,
          };
        } catch {
          return null;
        }
      }),
    );

    return items
      .filter((item): item is TripSummary => item !== null)
      .sort(sortTripSummaries);
  }

  async readTrip(tripId: TripId): Promise<TripData> {
    const trip = await this.readYamlFile(
      this.getTripFilePath(tripId),
      tripSchema,
      "TRIP_NOT_FOUND",
      `trip 파일을 찾을 수 없습니다: ${tripId}`,
      "TRIP_INVALID",
      `trip 파일 형식이 올바르지 않습니다: ${tripId}`,
    );

    if (trip.trip_id !== tripId) {
      throw new AppError(
        "TRIP_INVALID",
        `trip 파일 내부 trip_id 와 파일명이 일치하지 않습니다: ${tripId}`,
        400,
      );
    }

    return trip;
  }

  async createTrip(draft: TripDraft): Promise<TripData> {
    const tripId = draft.trip_id ?? (await this.createUniqueTripId(draft));
    const trip = normalizeTripDraft(draft, tripId);
    await this.ensureTripIdAvailable(tripId);

    await this.writeYamlFile(this.getTripFilePath(tripId), trip);
    return trip;
  }

  async updateTrip(tripId: TripId, draft: TripDraft): Promise<TripData> {
    await this.readTrip(tripId);

    const trip = normalizeTripDraft(draft, tripId);
    await this.writeYamlFile(this.getTripFilePath(tripId), trip);
    return trip;
  }

  async deleteTrip(tripId: TripId): Promise<void> {
    await this.readTrip(tripId);
    await rm(this.getTripFilePath(tripId), { force: true });
    await rm(this.getTripOutputPath(tripId), { force: true });
  }

  async archiveTrip(tripId: TripId): Promise<HistoryRecord> {
    const trip = await this.readTrip(tripId);
    const outputPath = (await fileExists(this.getTripOutputPath(tripId)))
      ? getTripOutputRelativePath(tripId)
      : null;
    const historyPath = this.getHistoryFilePath(tripId);

    if (await fileExists(historyPath)) {
      throw new AppError(
        "CONFLICT",
        `같은 history_id 의 히스토리가 이미 존재합니다: ${tripId}`,
        409,
      );
    }

    const history = historyRecordSchema.parse({
      version: 1,
      history_id: tripId,
      source_trip_id: tripId,
      title: trip.title,
      date: trip.date,
      location: {
        campsite_name: trip.location?.campsite_name,
        region: trip.location?.region,
      },
      companion_ids: trip.party.companion_ids,
      attendee_count: trip.party.companion_ids.length,
      notes: trip.notes ?? [],
      archived_at: new Date().toISOString(),
      output_path: outputPath,
      trip_snapshot: trip,
    });

    await this.writeYamlFile(this.getHistoryFilePath(history.history_id), history);
    await rm(this.getTripFilePath(tripId), { force: true });

    return history;
  }

  async listHistory(): Promise<HistoryRecord[]> {
    const historyFiles = await this.listYamlFiles(this.getHistoryDir());
    const items = await Promise.all(
      historyFiles.map(async (fileName) => {
        const historyId = fileName.replace(/\.ya?ml$/u, "");

        try {
          return await this.readHistory(historyId);
        } catch {
          return null;
        }
      }),
    );

    return items
      .filter((item): item is HistoryRecord => item !== null)
      .sort((a, b) => b.archived_at.localeCompare(a.archived_at));
  }

  async readHistory(historyId: string): Promise<HistoryRecord> {
    return this.readYamlFile(
      this.getHistoryFilePath(historyId),
      historyRecordSchema,
      "RESOURCE_NOT_FOUND",
      `history 파일을 찾을 수 없습니다: ${historyId}`,
      "TRIP_INVALID",
      `history 파일 형식이 올바르지 않습니다: ${historyId}`,
    );
  }

  async updateHistory(historyId: string, history: HistoryRecord): Promise<HistoryRecord> {
    const nextHistory = historyRecordSchema.parse({
      ...history,
      history_id: historyId,
    });

    await this.writeYamlFile(this.getHistoryFilePath(historyId), nextHistory);
    return nextHistory;
  }

  async deleteHistory(historyId: string): Promise<void> {
    await this.readHistory(historyId);
    await rm(this.getHistoryFilePath(historyId), { force: true });
  }

  async readLinks(): Promise<ExternalLinksData> {
    const linksPath = this.getLinksPath();

    if (!(await fileExists(linksPath))) {
      return {
        version: 1,
        items: [],
      };
    }

    return this.readYamlFile(
      linksPath,
      externalLinksSchema,
      "RESOURCE_NOT_FOUND",
      "links.yaml 파일을 찾을 수 없습니다.",
      "TRIP_INVALID",
      "links.yaml 형식이 올바르지 않습니다.",
    );
  }

  async createLink(input: ExternalLinkInput): Promise<ExternalLink> {
    const links = await this.readLinks();
    const linkId = input.id ?? (await this.createUniqueLinkId(input.name));

    if (links.items.some((item) => item.id === linkId)) {
      throw new AppError(
        "CONFLICT",
        `같은 id 의 링크가 이미 존재합니다: ${linkId}`,
        409,
      );
    }

    const link = {
      ...input,
      id: linkId,
      sort_order:
        input.sort_order ??
        Math.max(0, ...links.items.map((item) => item.sort_order)) + 1,
    } satisfies ExternalLink;

    const nextLinks = {
      version: links.version,
      items: [...links.items, link].sort(sortLinks),
    };

    await this.writeYamlFile(this.getLinksPath(), nextLinks);
    return link;
  }

  async updateLink(linkId: string, input: ExternalLinkInput): Promise<ExternalLink> {
    const links = await this.readLinks();
    const index = links.items.findIndex((item) => item.id === linkId);

    if (index < 0) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        `수정할 링크를 찾을 수 없습니다: ${linkId}`,
        404,
      );
    }

    const current = links.items[index];
    const nextLink: ExternalLink = {
      ...current,
      ...input,
      id: linkId,
    };

    links.items[index] = nextLink;
    links.items.sort(sortLinks);
    await this.writeYamlFile(this.getLinksPath(), links);
    return nextLink;
  }

  async deleteLink(linkId: string): Promise<void> {
    const links = await this.readLinks();
    const nextItems = links.items.filter((item) => item.id !== linkId);

    if (nextItems.length === links.items.length) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        `삭제할 링크를 찾을 수 없습니다: ${linkId}`,
        404,
      );
    }

    await this.writeYamlFile(this.getLinksPath(), {
      version: links.version,
      items: nextItems,
    });
  }

  async readEquipmentCatalog(): Promise<EquipmentCatalog> {
    const [durable, consumables, precheck] = await Promise.all([
      this.readDurableEquipment(),
      this.readConsumables(),
      this.readPrecheck(),
    ]);

    return {
      durable,
      consumables,
      precheck,
    };
  }

  async createEquipmentItem(
    section: EquipmentSection,
    input: EquipmentItemInput,
  ): Promise<EquipmentItem> {
    switch (section) {
      case "durable":
        return this.createDurableItem(input as DurableEquipmentItemInput);
      case "consumables":
        return this.createConsumableItem(input as ConsumableEquipmentItemInput);
      case "precheck":
        return this.createPrecheckItem(input as PrecheckItemInput);
    }
  }

  async updateEquipmentItem(
    section: EquipmentSection,
    itemId: string,
    input: EquipmentItemInput,
  ): Promise<EquipmentItem> {
    switch (section) {
      case "durable":
        return this.updateDurableItem(itemId, input as DurableEquipmentItemInput);
      case "consumables":
        return this.updateConsumableItem(
          itemId,
          input as ConsumableEquipmentItemInput,
        );
      case "precheck":
        return this.updatePrecheckItem(itemId, input as PrecheckItemInput);
    }
  }

  async deleteEquipmentItem(
    section: EquipmentSection,
    itemId: string,
  ): Promise<void> {
    switch (section) {
      case "durable":
        await this.deleteDurableItem(itemId);
        return;
      case "consumables":
        await this.deleteConsumableItem(itemId);
        return;
      case "precheck":
        await this.deletePrecheckItem(itemId);
        return;
    }
  }

  async loadTripBundle(tripId: TripId): Promise<TripBundle> {
    const trip = await this.readTrip(tripId);

    const [
      profile,
      companions,
      durableEquipment,
      consumables,
      precheck,
      travelPreferences,
      foodPreferences,
      caches,
    ] = await Promise.all([
      this.readYamlFile(
        path.join(this.config.dataDir, "profile.yaml"),
        profileSchema,
        "DEPENDENCY_MISSING",
        "profile.yaml 파일이 필요합니다.",
        "TRIP_INVALID",
        "profile.yaml 형식이 올바르지 않습니다.",
      ),
      this.readYamlFile(
        path.join(this.config.dataDir, "companions.yaml"),
        companionsSchema,
        "DEPENDENCY_MISSING",
        "companions.yaml 파일이 필요합니다.",
        "TRIP_INVALID",
        "companions.yaml 형식이 올바르지 않습니다.",
      ),
      this.readDurableEquipment(),
      this.readConsumables(),
      this.readPrecheck(),
      this.readYamlFile(
        path.join(this.config.dataDir, "preferences", "travel.yaml"),
        travelPreferencesSchema,
        "DEPENDENCY_MISSING",
        "preferences/travel.yaml 파일이 필요합니다.",
        "TRIP_INVALID",
        "preferences/travel.yaml 형식이 올바르지 않습니다.",
      ),
      this.readYamlFile(
        path.join(this.config.dataDir, "preferences", "food.yaml"),
        foodPreferencesSchema,
        "DEPENDENCY_MISSING",
        "preferences/food.yaml 파일이 필요합니다.",
        "TRIP_INVALID",
        "preferences/food.yaml 형식이 올바르지 않습니다.",
      ),
      this.loadRelevantCaches(trip),
    ]);

    return {
      profile,
      companions,
      durableEquipment,
      consumables,
      precheck,
      travelPreferences,
      foodPreferences,
      trip,
      caches,
    };
  }

  async loadPromptFiles(): Promise<{ system: string; analysis: string }> {
    const [system, analysis] = await Promise.all([
      this.readTextFile(
        path.join(this.config.promptsDir, "system.md"),
        "DEPENDENCY_MISSING",
        "prompts/system.md 파일이 필요합니다.",
      ),
      this.readTextFile(
        path.join(this.config.promptsDir, "trip-analysis.md"),
        "DEPENDENCY_MISSING",
        "prompts/trip-analysis.md 파일이 필요합니다.",
      ),
    ]);

    return { system, analysis };
  }

  async loadReferenceDocuments(): Promise<NamedTextFile[]> {
    return Promise.all(
      REQUIRED_DOC_PATHS.map(async (relativePath) => ({
        name: relativePath,
        content: await this.readTextFile(
          path.join(this.config.projectRoot, relativePath),
          "DEPENDENCY_MISSING",
          `${relativePath} 파일이 필요합니다.`,
        ),
      })),
    );
  }

  async saveOutput(tripId: TripId, markdown: string): Promise<string> {
    const outputPath = this.getTripOutputPath(tripId);

    try {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, markdown, "utf8");
      return getTripOutputRelativePath(tripId);
    } catch {
      throw new AppError(
        "OUTPUT_SAVE_FAILED",
        `분석 결과를 저장하지 못했습니다: ${tripId}`,
        500,
      );
    }
  }

  async readOutput(tripId: TripId): Promise<GetOutputResponse> {
    return {
      trip_id: tripId,
      output_path: getTripOutputRelativePath(tripId),
      markdown: await this.readTextFile(
        this.getTripOutputPath(tripId),
        "RESOURCE_NOT_FOUND",
        `분석 결과 파일을 찾을 수 없습니다: ${tripId}`,
      ),
    };
  }

  private async createDurableItem(
    input: DurableEquipmentItemInput,
  ): Promise<DurableEquipmentItem> {
    const data = await this.readDurableEquipment();
    const itemId =
      input.id ?? (await this.createUniqueEquipmentId("durable", input.name));

    if (data.items.some((item) => item.id === itemId)) {
      throw new AppError(
        "CONFLICT",
        `같은 id 의 장비가 이미 존재합니다: ${itemId}`,
        409,
      );
    }

    const item: DurableEquipmentItem = {
      ...input,
      id: itemId,
    };

    data.items.push(item);
    data.items.sort(sortByName);
    await this.writeYamlFile(this.getDurablePath(), data);
    return item;
  }

  private async updateDurableItem(
    itemId: string,
    input: DurableEquipmentItemInput,
  ): Promise<DurableEquipmentItem> {
    const data = await this.readDurableEquipment();
    const index = data.items.findIndex((item) => item.id === itemId);

    if (index < 0) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        `수정할 장비를 찾을 수 없습니다: ${itemId}`,
        404,
      );
    }

    const item: DurableEquipmentItem = {
      ...data.items[index],
      ...input,
      id: itemId,
    };

    data.items[index] = item;
    data.items.sort(sortByName);
    await this.writeYamlFile(this.getDurablePath(), data);
    return item;
  }

  private async deleteDurableItem(itemId: string): Promise<void> {
    const data = await this.readDurableEquipment();
    const nextItems = data.items.filter((item) => item.id !== itemId);

    if (nextItems.length === data.items.length) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        `삭제할 장비를 찾을 수 없습니다: ${itemId}`,
        404,
      );
    }

    await this.writeYamlFile(this.getDurablePath(), {
      version: data.version,
      items: nextItems,
    });
  }

  private async createConsumableItem(
    input: ConsumableEquipmentItemInput,
  ): Promise<ConsumableEquipmentItem> {
    const data = await this.readConsumables();
    const itemId =
      input.id ?? (await this.createUniqueEquipmentId("consumable", input.name));

    if (data.items.some((item) => item.id === itemId)) {
      throw new AppError(
        "CONFLICT",
        `같은 id 의 소모품이 이미 존재합니다: ${itemId}`,
        409,
      );
    }

    const item: ConsumableEquipmentItem = {
      ...input,
      id: itemId,
    };

    data.items.push(item);
    data.items.sort(sortByName);
    await this.writeYamlFile(this.getConsumablesPath(), data);
    return item;
  }

  private async updateConsumableItem(
    itemId: string,
    input: ConsumableEquipmentItemInput,
  ): Promise<ConsumableEquipmentItem> {
    const data = await this.readConsumables();
    const index = data.items.findIndex((item) => item.id === itemId);

    if (index < 0) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        `수정할 소모품을 찾을 수 없습니다: ${itemId}`,
        404,
      );
    }

    const item: ConsumableEquipmentItem = {
      ...data.items[index],
      ...input,
      id: itemId,
    };

    data.items[index] = item;
    data.items.sort(sortByName);
    await this.writeYamlFile(this.getConsumablesPath(), data);
    return item;
  }

  private async deleteConsumableItem(itemId: string): Promise<void> {
    const data = await this.readConsumables();
    const nextItems = data.items.filter((item) => item.id !== itemId);

    if (nextItems.length === data.items.length) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        `삭제할 소모품을 찾을 수 없습니다: ${itemId}`,
        404,
      );
    }

    await this.writeYamlFile(this.getConsumablesPath(), {
      version: data.version,
      items: nextItems,
    });
  }

  private async createPrecheckItem(input: PrecheckItemInput): Promise<PrecheckItem> {
    const data = await this.readPrecheck();
    const itemId =
      input.id ?? (await this.createUniqueEquipmentId("precheck", input.name));

    if (data.items.some((item) => item.id === itemId)) {
      throw new AppError(
        "CONFLICT",
        `같은 id 의 점검 항목이 이미 존재합니다: ${itemId}`,
        409,
      );
    }

    const item: PrecheckItem = {
      ...input,
      id: itemId,
    };

    data.items.push(item);
    data.items.sort(sortByName);
    await this.writeYamlFile(this.getPrecheckPath(), data);
    return item;
  }

  private async updatePrecheckItem(
    itemId: string,
    input: PrecheckItemInput,
  ): Promise<PrecheckItem> {
    const data = await this.readPrecheck();
    const index = data.items.findIndex((item) => item.id === itemId);

    if (index < 0) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        `수정할 점검 항목을 찾을 수 없습니다: ${itemId}`,
        404,
      );
    }

    const item: PrecheckItem = {
      ...data.items[index],
      ...input,
      id: itemId,
    };

    data.items[index] = item;
    data.items.sort(sortByName);
    await this.writeYamlFile(this.getPrecheckPath(), data);
    return item;
  }

  private async deletePrecheckItem(itemId: string): Promise<void> {
    const data = await this.readPrecheck();
    const nextItems = data.items.filter((item) => item.id !== itemId);

    if (nextItems.length === data.items.length) {
      throw new AppError(
        "RESOURCE_NOT_FOUND",
        `삭제할 점검 항목을 찾을 수 없습니다: ${itemId}`,
        404,
      );
    }

    await this.writeYamlFile(this.getPrecheckPath(), {
      version: data.version,
      items: nextItems,
    });
  }

  private async readDurableEquipment(): Promise<DurableEquipmentData> {
    return this.readYamlFile(
      this.getDurablePath(),
      durableEquipmentSchema,
      "DEPENDENCY_MISSING",
      "equipment/durable.yaml 파일이 필요합니다.",
      "TRIP_INVALID",
      "equipment/durable.yaml 형식이 올바르지 않습니다.",
    );
  }

  private async readConsumables(): Promise<ConsumableEquipmentData> {
    return this.readYamlFile(
      this.getConsumablesPath(),
      consumableEquipmentSchema,
      "DEPENDENCY_MISSING",
      "equipment/consumables.yaml 파일이 필요합니다.",
      "TRIP_INVALID",
      "equipment/consumables.yaml 형식이 올바르지 않습니다.",
    );
  }

  private async readPrecheck(): Promise<PrecheckData> {
    return this.readYamlFile(
      this.getPrecheckPath(),
      precheckSchema,
      "DEPENDENCY_MISSING",
      "equipment/precheck.yaml 파일이 필요합니다.",
      "TRIP_INVALID",
      "equipment/precheck.yaml 형식이 올바르지 않습니다.",
    );
  }

  private async listYamlFiles(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  private async loadRelevantCaches(
    trip: TripData,
  ): Promise<TripBundle["caches"]> {
    const tokens = [trip.trip_id, trip.location?.region]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    const weather = await this.loadCacheCategory("weather", tokens);
    const places = await this.loadCacheCategory("places", tokens);

    return { weather, places };
  }

  private async loadCacheCategory(
    category: "weather" | "places",
    tokens: string[],
  ): Promise<Array<{ name: string; content: unknown }>> {
    const categoryDir = path.join(this.config.dataDir, "cache", category);

    try {
      const entries = await readdir(categoryDir, { withFileTypes: true });
      const files = entries.filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          (tokens.length === 0 ||
            tokens.some((token) => entry.name.toLowerCase().includes(token))),
      );

      const values = await Promise.all(
        files.map(async (entry) => {
          const absolutePath = path.join(categoryDir, entry.name);

          try {
            const content = await readFile(absolutePath, "utf8");
            return {
              name: entry.name,
              content: JSON.parse(content),
            };
          } catch {
            return null;
          }
        }),
      );

      return values.filter(
        (value): value is { name: string; content: unknown } => value !== null,
      );
    } catch {
      return [];
    }
  }

  private async readTextFile(
    filePath: string,
    errorCode: "DEPENDENCY_MISSING" | "TRIP_NOT_FOUND" | "RESOURCE_NOT_FOUND",
    notFoundMessage: string,
  ): Promise<string> {
    try {
      await stat(filePath);
      return await readFile(filePath, "utf8");
    } catch {
      throw new AppError(
        errorCode,
        notFoundMessage,
        errorCode === "DEPENDENCY_MISSING" ? 500 : 404,
      );
    }
  }

  private async readYamlFile<T>(
    filePath: string,
    schema: {
      safeParse: (
        value: unknown,
      ) => { success: true; data: T } | { success: false };
    },
    missingCode: "DEPENDENCY_MISSING" | "TRIP_NOT_FOUND" | "RESOURCE_NOT_FOUND",
    missingMessage: string,
    invalidCode: "TRIP_INVALID",
    invalidMessage: string,
  ): Promise<T> {
    let raw: string;

    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      throw new AppError(
        missingCode,
        missingMessage,
        missingCode === "DEPENDENCY_MISSING" ? 500 : 404,
      );
    }

    try {
      const parsed = schema.safeParse(parse(raw));

      if (!parsed.success) {
        throw new Error("invalid");
      }

      return parsed.data;
    } catch {
      throw new AppError(invalidCode, invalidMessage, 400);
    }
  }

  private async writeYamlFile(filePath: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, stringify(value), "utf8");
  }

  private getTripsDir() {
    return path.join(this.config.dataDir, "trips");
  }

  private getTripFilePath(tripId: string) {
    return path.join(this.getTripsDir(), `${tripId}.yaml`);
  }

  private getTripOutputPath(tripId: string) {
    return path.join(this.config.dataDir, "outputs", getTripOutputFilename(tripId));
  }

  private getHistoryDir() {
    return path.join(this.config.dataDir, "history");
  }

  private getHistoryFilePath(historyId: string) {
    return path.join(this.getHistoryDir(), getHistoryFilename(historyId));
  }

  private getLinksPath() {
    return path.join(this.config.dataDir, "links.yaml");
  }

  private getDurablePath() {
    return path.join(this.config.dataDir, "equipment", "durable.yaml");
  }

  private getConsumablesPath() {
    return path.join(this.config.dataDir, "equipment", "consumables.yaml");
  }

  private getPrecheckPath() {
    return path.join(this.config.dataDir, "equipment", "precheck.yaml");
  }

  private async createUniqueTripId(draft: TripDraft): Promise<TripId> {
    return this.createUniqueId(
      derivePreferredId(
        [draft.date?.start, draft.location?.region, draft.title],
        "trip",
      ),
      async (candidate) => !(await this.isTripArtifactPresent(candidate)),
    ) as Promise<TripId>;
  }

  private async ensureTripIdAvailable(tripId: string): Promise<void> {
    if (await this.isTripArtifactPresent(tripId)) {
      throw new AppError(
        "CONFLICT",
        `같은 trip_id 의 계획 또는 기록이 이미 존재합니다: ${tripId}`,
        409,
      );
    }
  }

  private async isTripArtifactPresent(tripId: string): Promise<boolean> {
    const [tripExists, historyExists, outputExists] = await Promise.all([
      fileExists(this.getTripFilePath(tripId)),
      fileExists(this.getHistoryFilePath(tripId)),
      fileExists(this.getTripOutputPath(tripId)),
    ]);

    return tripExists || historyExists || outputExists;
  }

  private async createUniqueLinkId(name: string): Promise<string> {
    return this.createUniqueId(
      derivePreferredId([name], "link"),
      async (candidate) => {
        const links = await this.readLinks();
        return !links.items.some((item) => item.id === candidate);
      },
    );
  }

  private async createUniqueEquipmentId(
    prefix: string,
    name: string,
  ): Promise<string> {
    return this.createUniqueId(
      derivePreferredId([prefix, name], prefix),
      async (candidate) => {
        const catalog = await this.readEquipmentCatalog();
        return ![
          ...catalog.durable.items,
          ...catalog.consumables.items,
          ...catalog.precheck.items,
        ].some((item) => item.id === candidate);
      },
    );
  }

  private async createUniqueId(
    baseId: string,
    isAvailable: (candidate: string) => Promise<boolean>,
  ): Promise<string> {
    let suffix = 1;
    let candidate = baseId;

    while (!(await isAvailable(candidate))) {
      suffix += 1;
      candidate = `${baseId}-${suffix}`;
    }

    return candidate;
  }
}

function normalizeTripDraft(draft: TripDraft, tripId: string): TripData {
  const parsed = tripSchema.safeParse({
    version: draft.version ?? 1,
    trip_id: tripId,
    title: draft.title,
    date: draft.date,
    location: draft.location,
    departure: draft.departure,
    party: {
      companion_ids: draft.party?.companion_ids ?? [],
    },
    vehicle: draft.vehicle,
    conditions: draft.conditions,
    meal_plan: draft.meal_plan,
    travel_plan: draft.travel_plan,
    notes: draft.notes ?? [],
  });

  if (!parsed.success) {
    throw new AppError("TRIP_INVALID", "trip 저장 형식이 올바르지 않습니다.", 400);
  }

  return parsed.data;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function derivePreferredId(
  parts: Array<string | undefined | null>,
  fallback: string,
): string {
  const normalized = parts
    .map((part) =>
      (part ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-"),
    )
    .filter(Boolean);

  return normalized.join("-") || fallback;
}

function sortByName<T extends { name: string }>(left: T, right: T) {
  return left.name.localeCompare(right.name, "ko");
}

function sortLinks(left: ExternalLink, right: ExternalLink) {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.name.localeCompare(right.name, "ko");
}

function sortTripSummaries(left: TripSummary, right: TripSummary) {
  const leftDate = left.start_date ?? "9999-99-99";
  const rightDate = right.start_date ?? "9999-99-99";

  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  return left.title.localeCompare(right.title, "ko");
}
