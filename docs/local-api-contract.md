# 로컬 API 계약

## 1. 문서 목적

이 문서는 로컬 웹 UI와 로컬 API 사이의 현재 계약을 정의한다.

## 2. 기본 원칙

- 모든 API는 로컬 환경에서만 실행한다
- 브라우저는 OpenAI API를 직접 호출하지 않는다
- 운영 데이터는 `.camping-data/` 에 저장한다
- `trip_id`, `history_id`, 링크 `id` 는 소문자 kebab-case를 사용한다

## 3. 엔드포인트

### 공통

- `GET /api/health`

### 캠핑 계획

- `GET /api/trips`
- `POST /api/trips`
- `GET /api/trips/:tripId`
- `PUT /api/trips/:tripId`
- `DELETE /api/trips/:tripId`
- `POST /api/trips/:tripId/archive`
- `POST /api/trips/:tripId/assistant`
- `POST /api/validate-trip`
- `POST /api/analyze-trip`
- `POST /api/outputs`

### 장비 관리

- `GET /api/equipment`
- `POST /api/equipment/:section/items`
- `PUT /api/equipment/:section/items/:itemId`
- `DELETE /api/equipment/:section/items/:itemId`

`section` 값:

- `durable`
- `consumables`
- `precheck`

### 캠핑 히스토리

- `GET /api/history`
- `GET /api/history/:historyId`
- `PUT /api/history/:historyId`
- `DELETE /api/history/:historyId`

### 외부 링크

- `GET /api/links`
- `POST /api/links`
- `PUT /api/links/:linkId`
- `DELETE /api/links/:linkId`

## 4. 주요 응답 형태

### `GET /api/trips`

```json
{
  "items": [
    {
      "trip_id": "2026-04-18-gapyeong",
      "title": "4월 가평 가족 캠핑",
      "start_date": "2026-04-18",
      "region": "gapyeong",
      "companion_count": 2
    }
  ]
}
```

### `POST /api/trips/:tripId/assistant`

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "warnings": [],
  "assistant_message": "### 계획 보조\n- 우천 대비 장비를 먼저 확인하세요.",
  "actions": [
    {
      "id": "add-rain-cover",
      "section": "durable",
      "action": "add_item",
      "title": "우천 대비 타프 추가",
      "reason": "우천 가능성이 있는데 빗물 가림용 장비가 확인되지 않습니다."
    }
  ]
}
```

### `GET /api/equipment`

```json
{
  "durable": { "version": 1, "items": [] },
  "consumables": { "version": 1, "items": [] },
  "precheck": { "version": 1, "items": [] }
}
```

### `GET /api/history`

```json
{
  "items": [
    {
      "history_id": "2026-03-08-yangpyeong",
      "title": "3월 양평 주말 캠핑"
    }
  ]
}
```

### `GET /api/links`

```json
{
  "items": [
    {
      "id": "weather-kma",
      "category": "weather",
      "name": "기상청",
      "url": "https://www.weather.go.kr"
    }
  ]
}
```

## 5. 오류 모델

권장 오류 코드:

- `INVALID_TRIP_ID_FORMAT`
- `TRIP_NOT_FOUND`
- `TRIP_INVALID`
- `DEPENDENCY_MISSING`
- `OPENAI_REQUEST_FAILED`
- `OUTPUT_SAVE_FAILED`
- `RESOURCE_NOT_FOUND`
- `CONFLICT`
- `INTERNAL_ERROR`
