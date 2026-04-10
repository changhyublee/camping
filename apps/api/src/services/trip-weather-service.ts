import type { TripWeatherResearch } from "@camping/shared";
import { AppError } from "./app-error";

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

type NominatimSearchResponse = NominatimLocation[];

type NominatimLocation = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: {
    country?: string;
    state?: string;
    province?: string;
    region?: string;
    county?: string;
    city?: string;
    city_district?: string;
    district?: string;
    borough?: string;
    municipality?: string;
    town?: string;
    village?: string;
    suburb?: string;
    quarter?: string;
    hamlet?: string;
  };
};

type GeocodedLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  admin4?: string;
};

type OpenMeteoForecastResponse = {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  daily?: {
    time?: string[];
    weather_code?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
  };
  error?: boolean;
  reason?: string;
};

type ResolvedDateRange = {
  startDate: string;
  endDate: string;
};

type LookupDateRange = ResolvedDateRange & {
  clippedPastDays: boolean;
  clippedFutureDays: boolean;
};

type LocationLookupResult = {
  location: GeocodedLocation;
  geocodingUrl: string;
  queryUsed: string;
};

type DailyWeatherPoint = {
  date: string;
  weatherCode: number | null;
  minTempC: number | null;
  maxTempC: number | null;
  precipitationProbabilityMax: number | null;
  precipitationSum: number | null;
};

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_FORECAST_MAX_DAYS = 16;
const OPEN_METEO_SOURCE = "open-meteo";
const NOMINATIM_USER_AGENT = "camping-local-api/1.0 (local weather geocoding)";
const LOCATION_TRAILING_TERMS = [
  "오토 캠핑장",
  "오토캠핑장",
  "캠핑장",
  "캠핑",
  "야영장",
  "노지",
  "주차장",
] as const;

export class MissingTripWeatherClient implements TripWeatherSearchClient {
  constructor(private readonly message: string) {}

  async collectTripWeather(): Promise<TripWeatherResearch> {
    throw new AppError("DEPENDENCY_MISSING", this.message, 500);
  }
}

export class OpenMeteoTripWeatherClient implements TripWeatherSearchClient {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async collectTripWeather(input: TripWeatherCollectionInput): Promise<TripWeatherResearch> {
    validateCollectionInput(input);
    const query = buildWeatherQuery(input);
    const requestedDateRange = resolveRequestedDateRange(input);
    const lookupDateRange = resolveLookupDateRange(requestedDateRange);

    if (!lookupDateRange) {
      return createNotFoundResearch(input, query, {
        lookupUrl: buildGeocodingUrl(input.region.trim()),
        note: `Open-Meteo 예보는 오늘부터 최대 ${OPEN_METEO_FORECAST_MAX_DAYS}일까지만 제공되어 현재 일정 범위는 자동 수집할 수 없습니다.`,
      });
    }

    const locationLookup = await this.resolveLocation(input);

    if (!locationLookup) {
      return createNotFoundResearch(input, query, {
        lookupUrl: buildGeocodingUrl(buildGeocodingQueries(input).at(-1) ?? input.region.trim()),
        note: "입력한 지역 정보로 좌표를 찾지 못했습니다. 행정구역 중심 지역명이나 대표 장소명으로 다시 시도해 주세요.",
      });
    }

    const forecastUrl = buildForecastUrl(locationLookup.location, lookupDateRange);
    const forecastResponse = await this.fetchJson<OpenMeteoForecastResponse>(
      forecastUrl,
      input.signal,
      "Open-Meteo 예보",
    );

    if (forecastResponse.error) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        `Open-Meteo 예보 응답이 실패했습니다. ${forecastResponse.reason ?? "원인을 알 수 없습니다."}`,
        502,
      );
    }

    const dailyPoints = selectDailyWeatherPoints(forecastResponse, lookupDateRange);

    if (dailyPoints.length === 0) {
      return createNotFoundResearch(input, query, {
        lookupUrl: forecastUrl,
        note: "Open-Meteo 예보 응답에서 일정에 맞는 일별 날씨 데이터를 찾지 못했습니다.",
        sources: buildSources(locationLookup.geocodingUrl, forecastUrl),
      });
    }

    return buildResearchFromForecast({
      input,
      query,
      locationLookup,
      forecastUrl,
      forecastResponse,
      requestedDateRange,
      lookupDateRange,
      dailyPoints,
    });
  }

  private async resolveLocation(
    input: TripWeatherCollectionInput,
  ): Promise<LocationLookupResult | null> {
    for (const query of buildGeocodingQueries(input)) {
      const geocodingUrl = buildGeocodingUrl(query);
      const response = await this.fetchJson<NominatimSearchResponse>(
        geocodingUrl,
        input.signal,
        "지역 검색",
      );

      const location = response.find(isValidNominatimLocation);

      if (location) {
        return {
          location: toGeocodedLocation(location),
          geocodingUrl,
          queryUsed: query,
        };
      }
    }

    return null;
  }

  private async fetchJson<T>(
    url: string,
    signal: AbortSignal | undefined,
    label: string,
  ): Promise<T> {
    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        headers: {
          "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          "user-agent": NOMINATIM_USER_AGENT,
        },
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        error instanceof Error
          ? `${label} 요청에 실패했습니다. ${error.message}`
          : `${label} 요청에 실패했습니다.`,
        502,
      );
    }

    if (!response.ok) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        `${label} 응답이 실패했습니다. status=${response.status}`,
        502,
      );
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new AppError(
        "OPENAI_REQUEST_FAILED",
        error instanceof Error
          ? `${label} JSON 파싱에 실패했습니다. ${error.message}`
          : `${label} JSON 파싱에 실패했습니다.`,
        502,
      );
    }
  }
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

function buildWeatherQuery(input: TripWeatherCollectionInput) {
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

function resolveRequestedDateRange(input: TripWeatherCollectionInput): ResolvedDateRange {
  const startDate = (input.startDate ?? input.endDate)?.trim();
  const endDate = (input.endDate ?? input.startDate)?.trim();

  if (!startDate || !endDate) {
    throw new AppError(
      "TRIP_INVALID",
      "날씨 수집에는 시작일 또는 종료일이 필요합니다.",
      400,
    );
  }

  const startTimestamp = toUtcDayTimestamp(startDate);
  const endTimestamp = toUtcDayTimestamp(endDate);

  if (startTimestamp === null || endTimestamp === null) {
    throw new AppError(
      "TRIP_INVALID",
      "날씨 수집 날짜는 YYYY-MM-DD 형식이어야 합니다.",
      400,
    );
  }

  if (startTimestamp > endTimestamp) {
    throw new AppError(
      "TRIP_INVALID",
      "날씨 수집 시작일은 종료일보다 늦을 수 없습니다.",
      400,
    );
  }

  return { startDate, endDate };
}

function buildGeocodingQueries(input: TripWeatherCollectionInput) {
  const regionVariants = buildLocationQueryVariants(input.region);
  const campsiteVariants = input.campsiteName
    ? buildLocationQueryVariants(input.campsiteName)
    : [];
  const queries: string[] = [];

  if (campsiteVariants.length > 0 && regionVariants.length > 0) {
    queries.push(`${campsiteVariants[0]} ${regionVariants[0]}`);
  }

  queries.push(...campsiteVariants, ...regionVariants);

  return queries
    .map(normalizeLocationText)
    .filter((value) => value.length > 0)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function buildGeocodingUrl(query: string) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "10",
    addressdetails: "1",
    "accept-language": "ko,en",
    countrycodes: "kr",
  });

  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

function buildForecastUrl(
  location: Pick<GeocodedLocation, "latitude" | "longitude">,
  dateRange: ResolvedDateRange,
) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: [
      "weather_code",
      "temperature_2m_min",
      "temperature_2m_max",
      "precipitation_probability_max",
      "precipitation_sum",
    ].join(","),
    timezone: "auto",
    start_date: dateRange.startDate,
    end_date: dateRange.endDate,
  });

  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
}

function resolveLookupDateRange(dateRange: ResolvedDateRange): LookupDateRange | null {
  const today = currentLocalDateString();
  const latestSupported = addUtcDays(today, OPEN_METEO_FORECAST_MAX_DAYS - 1);
  const startDate = dateRange.startDate < today ? today : dateRange.startDate;
  const endDate = dateRange.endDate > latestSupported ? latestSupported : dateRange.endDate;

  if (dateRange.endDate < today || dateRange.startDate > latestSupported || startDate > endDate) {
    return null;
  }

  return {
    startDate,
    endDate,
    clippedPastDays: startDate !== dateRange.startDate,
    clippedFutureDays: endDate !== dateRange.endDate,
  };
}

function selectDailyWeatherPoints(
  response: OpenMeteoForecastResponse,
  dateRange: ResolvedDateRange,
): DailyWeatherPoint[] {
  const dates = response.daily?.time;

  if (!Array.isArray(dates)) {
    return [];
  }

  return dates
    .map((date, index) => ({
      date,
      weatherCode: readNumberArrayItem(response.daily?.weather_code, index),
      minTempC: readNumberArrayItem(response.daily?.temperature_2m_min, index),
      maxTempC: readNumberArrayItem(response.daily?.temperature_2m_max, index),
      precipitationProbabilityMax: readNumberArrayItem(
        response.daily?.precipitation_probability_max,
        index,
      ),
      precipitationSum: readNumberArrayItem(response.daily?.precipitation_sum, index),
    }))
    .filter((point) => point.date >= dateRange.startDate && point.date <= dateRange.endDate);
}

function buildResearchFromForecast(input: {
  input: TripWeatherCollectionInput;
  query: string;
  locationLookup: LocationLookupResult;
  forecastUrl: string;
  forecastResponse: OpenMeteoForecastResponse;
  requestedDateRange: ResolvedDateRange;
  lookupDateRange: LookupDateRange;
  dailyPoints: DailyWeatherPoint[];
}): TripWeatherResearch {
  const minTempC = minValue(input.dailyPoints.map((point) => point.minTempC));
  const maxTempC = maxValue(input.dailyPoints.map((point) => point.maxTempC));
  const precipitationProbabilityMax = maxValue(
    input.dailyPoints.map((point) => point.precipitationProbabilityMax),
  );
  const precipitationSum = sumValues(input.dailyPoints.map((point) => point.precipitationSum));
  const primaryWeatherCode = selectPrimaryWeatherCode(input.dailyPoints);
  const locationLabel = formatLocationLabel(input.locationLookup.location);
  const excerpt = buildForecastExcerpt({
    locationLabel,
    dateRange: input.lookupDateRange,
    minTempC,
    maxTempC,
    precipitationProbabilityMax,
    precipitationSum,
  });

  return {
    lookup_status: "found",
    searched_at: new Date().toISOString(),
    query: input.query,
    region: input.input.region.trim(),
    campsite_name: input.input.campsiteName?.trim(),
    start_date: input.input.startDate,
    end_date: input.input.endDate,
    summary: buildWeatherSummary(primaryWeatherCode, precipitationProbabilityMax, precipitationSum),
    min_temp_c: minTempC ?? undefined,
    max_temp_c: maxTempC ?? undefined,
    precipitation: buildPrecipitationSummary(
      precipitationProbabilityMax,
      precipitationSum,
    ),
    search_result_excerpt: excerpt,
    source: OPEN_METEO_SOURCE,
    lookup_url: input.forecastUrl,
    notes: buildWeatherNotes({
      requestedDateRange: input.requestedDateRange,
      lookupDateRange: input.lookupDateRange,
      locationLabel,
      location: input.locationLookup.location,
      geocodingQuery: input.locationLookup.queryUsed,
      timezone:
        input.forecastResponse.timezone_abbreviation ?? input.forecastResponse.timezone,
      pointCount: input.dailyPoints.length,
    }),
    sources: buildSources(input.locationLookup.geocodingUrl, input.forecastUrl),
  };
}

function createNotFoundResearch(
  input: TripWeatherCollectionInput,
  query: string,
  options: {
    lookupUrl?: string;
    note: string;
    sources?: TripWeatherResearch["sources"];
  },
): TripWeatherResearch {
  return {
    lookup_status: "not_found",
    searched_at: new Date().toISOString(),
    query,
    region: input.region.trim(),
    campsite_name: input.campsiteName?.trim(),
    start_date: input.startDate,
    end_date: input.endDate,
    source: OPEN_METEO_SOURCE,
    lookup_url: options.lookupUrl,
    notes: [options.note],
    sources: options.sources ?? buildFallbackSources(options.lookupUrl),
  };
}

function buildFallbackSources(lookupUrl?: string): TripWeatherResearch["sources"] {
  if (!lookupUrl) {
    return [];
  }

  return [
    {
      title: "지역/예보 조회 URL",
      url: lookupUrl,
      domain: extractDomain(lookupUrl) ?? "nominatim.openstreetmap.org",
    },
  ];
}

function buildSources(
  geocodingUrl: string,
  forecastUrl: string,
): TripWeatherResearch["sources"] {
  return [
    {
      title: "Nominatim Search API",
      url: geocodingUrl,
      domain: "nominatim.openstreetmap.org",
    },
    {
      title: "Open-Meteo Forecast API",
      url: forecastUrl,
      domain: "api.open-meteo.com",
    },
  ];
}

function buildForecastExcerpt(input: {
  locationLabel: string;
  dateRange: ResolvedDateRange;
  minTempC: number | null;
  maxTempC: number | null;
  precipitationProbabilityMax: number | null;
  precipitationSum: number | null;
}) {
  const dateLabel =
    input.dateRange.startDate === input.dateRange.endDate
      ? input.dateRange.startDate
      : `${input.dateRange.startDate}~${input.dateRange.endDate}`;
  const parts = [`${input.locationLabel} 기준 ${dateLabel} 예보`];

  if (input.minTempC !== null || input.maxTempC !== null) {
    parts.push(
      `최저 ${formatTemp(input.minTempC)} / 최고 ${formatTemp(input.maxTempC)}`,
    );
  }

  if (input.precipitationProbabilityMax !== null) {
    parts.push(`최대 강수 확률 ${Math.round(input.precipitationProbabilityMax)}%`);
  }

  if (input.precipitationSum !== null) {
    parts.push(`누적 강수량 ${formatMillimeters(input.precipitationSum)}`);
  }

  return parts.join(", ");
}

function buildWeatherNotes(input: {
  requestedDateRange: ResolvedDateRange;
  lookupDateRange: LookupDateRange;
  locationLabel: string;
  location: GeocodedLocation;
  geocodingQuery: string;
  timezone?: string;
  pointCount: number;
}) {
  const notes = [
    `좌표 기준 위치: ${input.locationLabel} (${input.location.latitude.toFixed(3)}, ${input.location.longitude.toFixed(3)})`,
  ];

  if (input.geocodingQuery !== input.location.name) {
    notes.push(`지역 검색 질의는 "${input.geocodingQuery}" 를 사용했습니다.`);
  }

  if (input.lookupDateRange.clippedPastDays) {
    notes.push(
      `요청 기간 중 지난 날짜(${input.requestedDateRange.startDate}~${addUtcDays(
        input.lookupDateRange.startDate,
        -1,
      )})는 예보 범위를 벗어나 제외했습니다.`,
    );
  }

  if (input.lookupDateRange.clippedFutureDays) {
    notes.push(
      `요청 기간 중 ${addUtcDays(input.lookupDateRange.endDate, 1)} 이후 날짜는 Open-Meteo 예보 제공 범위를 넘어 제외했습니다.`,
    );
  }

  if (
    input.lookupDateRange.startDate !== input.lookupDateRange.endDate &&
    input.pointCount > 1
  ) {
    notes.push("기간 전체 일별 예보를 합쳐 최저/최고 기온과 최대 강수 확률을 요약했습니다.");
  }

  if (input.timezone) {
    notes.push(`예보 시간대: ${input.timezone}`);
  }

  return notes;
}

function buildWeatherSummary(
  weatherCode: number | null,
  precipitationProbabilityMax: number | null,
  precipitationSum: number | null,
) {
  const phrase = weatherCode !== null ? weatherCodeToPhrase(weatherCode) : null;
  const hasMeaningfulPrecipitation =
    (precipitationProbabilityMax ?? 0) >= 30 || (precipitationSum ?? 0) >= 0.5;

  if (!phrase) {
    return hasMeaningfulPrecipitation ? "강수 가능성이 있습니다." : undefined;
  }

  if (isDirectPrecipitationCode(weatherCode)) {
    return `${phrase} 예상입니다.`;
  }

  if (hasMeaningfulPrecipitation) {
    return `${phrase}이며 비 가능성이 있습니다.`;
  }

  return `${phrase} 예상입니다.`;
}

function buildPrecipitationSummary(
  precipitationProbabilityMax: number | null,
  precipitationSum: number | null,
) {
  if (precipitationProbabilityMax === null && precipitationSum === null) {
    return undefined;
  }

  const hasMeaningfulPrecipitation =
    (precipitationProbabilityMax ?? 0) >= 30 || (precipitationSum ?? 0) >= 0.5;
  const prefix = hasMeaningfulPrecipitation
    ? (precipitationProbabilityMax ?? 0) >= 60 || (precipitationSum ?? 0) >= 5
      ? "강수 가능성이 높습니다."
      : "강수 가능성이 있습니다."
    : "뚜렷한 강수 예보는 약합니다.";
  const details: string[] = [];

  if (precipitationProbabilityMax !== null) {
    details.push(`최대 강수 확률 ${Math.round(precipitationProbabilityMax)}%`);
  }

  if (precipitationSum !== null) {
    details.push(`예상 누적 강수량 ${formatMillimeters(precipitationSum)}`);
  }

  return details.length > 0 ? `${prefix} ${details.join(", ")}` : prefix;
}

function selectPrimaryWeatherCode(points: DailyWeatherPoint[]) {
  return points.reduce<number | null>((selected, point) => {
    if (point.weatherCode === null) {
      return selected;
    }

    if (selected === null) {
      return point.weatherCode;
    }

    return weatherSeverity(point.weatherCode) > weatherSeverity(selected)
      ? point.weatherCode
      : selected;
  }, null);
}

function weatherSeverity(code: number) {
  if ([95, 96, 99].includes(code)) {
    return 90;
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 80;
  }

  if ([66, 67].includes(code)) {
    return 75;
  }

  if ([80, 81, 82, 61, 63, 65].includes(code)) {
    return 70;
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return 60;
  }

  if ([45, 48].includes(code)) {
    return 40;
  }

  if (code === 3) {
    return 30;
  }

  if (code === 2) {
    return 20;
  }

  if (code === 1) {
    return 10;
  }

  return 0;
}

function weatherCodeToPhrase(code: number) {
  if (code === 0) {
    return "맑은 날씨";
  }

  if (code === 1) {
    return "대체로 맑은 날씨";
  }

  if (code === 2) {
    return "구름이 조금 있는 날씨";
  }

  if (code === 3) {
    return "흐린 날씨";
  }

  if ([45, 48].includes(code)) {
    return "안개 낀 날씨";
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return "가벼운 비";
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return "비";
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return "눈";
  }

  if ([95, 96, 99].includes(code)) {
    return "뇌우";
  }

  return "변화가 있는 날씨";
}

function isDirectPrecipitationCode(code: number | null) {
  if (code === null) {
    return false;
  }

  return (
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]
      .includes(code)
  );
}

function isValidNominatimLocation(
  location: NominatimLocation | undefined,
): location is NominatimLocation {
  return Boolean(
    location &&
      typeof location.display_name === "string" &&
      typeof location.lat === "string" &&
      typeof location.lon === "string" &&
      Number.isFinite(Number.parseFloat(location.lat)) &&
      Number.isFinite(Number.parseFloat(location.lon)),
  );
}

function readNumberArrayItem(
  values: Array<number | null> | undefined,
  index: number,
): number | null {
  const value = values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function minValue(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);
  return filtered.length > 0 ? Math.min(...filtered) : null;
}

function maxValue(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);
  return filtered.length > 0 ? Math.max(...filtered) : null;
}

function sumValues(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);
  return filtered.length > 0 ? filtered.reduce((sum, value) => sum + value, 0) : null;
}

function formatLocationLabel(location: GeocodedLocation) {
  return [
    location.name,
    location.admin4,
    location.admin3,
    location.admin2,
    location.admin1,
    location.country,
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");
}

function formatTemp(value: number | null) {
  if (value === null) {
    return "정보 없음";
  }

  return `${Math.round(value)}°C`;
}

function formatMillimeters(value: number) {
  return `${Math.round(value * 10) / 10}mm`;
}

function currentLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addUtcDays(dateString: string, days: number) {
  const timestamp = toUtcDayTimestamp(dateString);

  if (timestamp === null) {
    throw new AppError("TRIP_INVALID", "날짜 계산에 실패했습니다.", 400);
  }

  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function toUtcDayTimestamp(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const timestamp = Date.UTC(year, month - 1, day);
  const candidate = new Date(timestamp);

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function extractDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function buildLocationQueryVariants(input: string) {
  const normalized = normalizeLocationText(input);

  if (!normalized) {
    return [];
  }

  const variants = [normalized];
  let current = normalized;

  while (true) {
    const stripped = stripTrailingLocationTerm(current);

    if (!stripped || stripped === current) {
      break;
    }

    variants.push(stripped);
    current = stripped;
  }

  const tokens = current.split(" ").filter(Boolean);

  for (let end = tokens.length - 1; end >= 2; end -= 1) {
    variants.push(tokens.slice(0, end).join(" "));
  }

  return variants.filter((value, index, values) => values.indexOf(value) === index);
}

function normalizeLocationText(input: string) {
  return input.trim().replace(/\s+/gu, " ");
}

function stripTrailingLocationTerm(input: string) {
  for (const term of LOCATION_TRAILING_TERMS) {
    if (input.endsWith(term)) {
      return normalizeLocationText(input.slice(0, -term.length));
    }
  }

  return null;
}

function toGeocodedLocation(location: NominatimLocation): GeocodedLocation {
  const address = location.address ?? {};

  return {
    name:
      location.name ??
      address.town ??
      address.city ??
      address.village ??
      address.suburb ??
      location.display_name?.split(",")[0]?.trim() ??
      "위치",
    latitude: Number.parseFloat(location.lat ?? "NaN"),
    longitude: Number.parseFloat(location.lon ?? "NaN"),
    country: address.country,
    admin1: address.province ?? address.state ?? address.region,
    admin2: address.county ?? address.city ?? address.municipality,
    admin3:
      address.city_district ??
      address.district ??
      address.borough ??
      address.town ??
      address.city,
    admin4: address.suburb ?? address.quarter ?? address.village ?? address.hamlet,
  };
}
