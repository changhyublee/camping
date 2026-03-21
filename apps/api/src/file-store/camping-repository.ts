import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  companionsSchema,
  consumableEquipmentSchema,
  durableEquipmentSchema,
  foodPreferencesSchema,
  getTripOutputFilename,
  getTripOutputRelativePath,
  isTripId,
  precheckSchema,
  profileSchema,
  toTripSummary,
  travelPreferencesSchema,
  tripSchema,
  type TripBundle,
  type TripData,
  type TripId,
  type TripSummary,
} from "@camping/shared";
import { parse } from "yaml";
import { AppError } from "../services/app-error";
import type { AppConfig } from "../config";

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

export class CampingRepository {
  constructor(private readonly config: AppConfig) {}

  async listTripSummaries(): Promise<TripSummary[]> {
    const tripFiles = await this.listTripFiles();
    const items = await Promise.all(
      tripFiles.map(async (fileName) => {
        const tripId = fileName.replace(/\.ya?ml$/, "");

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

    return items.filter((item): item is TripSummary => item !== null);
  }

  async readTrip(tripId: TripId): Promise<TripData> {
    const trip = await this.readYamlFile(
      path.join(this.config.dataDir, "trips", `${tripId}.yaml`),
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
      this.readYamlFile(
        path.join(this.config.dataDir, "equipment", "durable.yaml"),
        durableEquipmentSchema,
        "DEPENDENCY_MISSING",
        "equipment/durable.yaml 파일이 필요합니다.",
        "TRIP_INVALID",
        "equipment/durable.yaml 형식이 올바르지 않습니다.",
      ),
      this.readYamlFile(
        path.join(this.config.dataDir, "equipment", "consumables.yaml"),
        consumableEquipmentSchema,
        "DEPENDENCY_MISSING",
        "equipment/consumables.yaml 파일이 필요합니다.",
        "TRIP_INVALID",
        "equipment/consumables.yaml 형식이 올바르지 않습니다.",
      ),
      this.readYamlFile(
        path.join(this.config.dataDir, "equipment", "precheck.yaml"),
        precheckSchema,
        "DEPENDENCY_MISSING",
        "equipment/precheck.yaml 파일이 필요합니다.",
        "TRIP_INVALID",
        "equipment/precheck.yaml 형식이 올바르지 않습니다.",
      ),
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
    const outputPath = path.join(
      this.config.dataDir,
      "outputs",
      getTripOutputFilename(tripId),
    );

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

  private async listTripFiles(): Promise<string[]> {
    const tripsDir = path.join(this.config.dataDir, "trips");

    try {
      const entries = await readdir(tripsDir, { withFileTypes: true });
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
    errorCode: "DEPENDENCY_MISSING" | "TRIP_NOT_FOUND",
    notFoundMessage: string,
  ): Promise<string> {
    try {
      await stat(filePath);
      return await readFile(filePath, "utf8");
    } catch {
      throw new AppError(errorCode, notFoundMessage, errorCode === "TRIP_NOT_FOUND" ? 404 : 500);
    }
  }

  private async readYamlFile<T>(
    filePath: string,
    schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
    missingCode: "DEPENDENCY_MISSING" | "TRIP_NOT_FOUND",
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
        missingCode === "TRIP_NOT_FOUND" ? 404 : 500,
      );
    }

    let parsed: unknown;

    try {
      parsed = parse(raw);
    } catch {
      throw new AppError(invalidCode, invalidMessage, 400);
    }

    const result = schema.safeParse(parsed);

    if (!result.success) {
      throw new AppError(invalidCode, invalidMessage, 400);
    }

    return result.data;
  }
}
