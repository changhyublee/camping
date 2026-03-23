# 로컬 API 계약

## 1. 문서 목적

이 문서는 로컬 웹 UI와 로컬 API 사이의 현재 계약을 정의한다.

## 2. 기본 원칙

- 모든 API는 로컬 환경에서만 실행한다
- 브라우저는 OpenAI API를 직접 호출하지 않는다
- 운영 데이터는 `.camping-data/` 에 저장한다
- `trip_id`, `history_id`, 동행자 `id`, 차량 `id`, 링크 `id` 는 소문자 kebab-case를 사용한다
- `trip_id` 는 `trips/`, `history/`, `outputs/` 와 충돌하지 않게 유지한다

## 3. 엔드포인트

### 공통

- `GET /api/health`
- `GET /api/data-backups`
- `POST /api/data-backups`

### 동행자

- `GET /api/companions`
- `POST /api/companions`
- `PUT /api/companions/:companionId`
- `DELETE /api/companions/:companionId`

### 차량

- `GET /api/vehicles`
- `POST /api/vehicles`
- `PUT /api/vehicles/:vehicleId`
- `DELETE /api/vehicles/:vehicleId`

### 캠핑 계획

- `GET /api/trips`
- `POST /api/trips`
- `GET /api/trips/:tripId`
- `PUT /api/trips/:tripId`
- `DELETE /api/trips/:tripId`
- `POST /api/trips/:tripId/archive`
- `GET /api/trips/:tripId/analysis-status`
- `POST /api/trips/:tripId/assistant`
- `POST /api/validate-trip`
- `POST /api/analyze-trip`
- `GET /api/outputs/:tripId`
- `POST /api/outputs`

분석 실행 규칙:

- `POST /api/analyze-trip` 는 백그라운드 작업을 등록하고 현재 분석 상태를 즉시 반환한다
- 새 작업이 등록되거나 이미 같은 계획 분석이 진행 중이면 `202 Accepted` 로 응답한다
- `GET /api/trips/:tripId/analysis-status` 는 현재 계획의 분석 상태를 조회한다
- 상태 값은 `idle`, `queued`, `running`, `completed`, `failed`, `interrupted` 를 사용한다
- `save_output` 을 생략하거나 `true` 로 보내면 완료 후 `.camping-data/outputs/<trip-id>-plan.md` 에 저장한다
- `save_output` 을 `false` 로 보내는 비동기 분석 요청은 지원하지 않으며 `TRIP_INVALID` 로 거절한다
- 같은 `trip_id` 가 이미 `queued` 또는 `running` 상태면 새 분석을 만들지 않고 기존 상태를 그대로 반환한다
- 분석이 진행 중이면 `DELETE /api/trips/:tripId` 와 `POST /api/trips/:tripId/archive` 는 `CONFLICT` 로 거절한다
- API 서버 재시작 시 남아 있던 `queued` 또는 `running` 상태는 `interrupted` 로 복구된다

### 장비 관리

- `GET /api/equipment`
- `GET /api/equipment/categories`
- `POST /api/equipment/categories/:section`
- `PUT /api/equipment/categories/:section/:categoryId`
- `DELETE /api/equipment/categories/:section/:categoryId`
- `POST /api/equipment/:section/items`
- `PUT /api/equipment/:section/items/:itemId`
- `POST /api/equipment/durable/items/:itemId/metadata/refresh`
- `DELETE /api/equipment/:section/items/:itemId`

`section` 값:

- `durable`
- `consumables`
- `precheck`

장비 카테고리 생성 규칙:

- `id` 를 반드시 보내야 한다
- 카테고리 코드는 영문 소문자, 숫자, `-`, `_` 형식을 사용한다
- `id` 가 없거나 형식이 맞지 않으면 `TRIP_INVALID` 로 거절한다

### 캠핑 히스토리

- `GET /api/history`
- `GET /api/history/:historyId`
- `PUT /api/history/:historyId`
- `DELETE /api/history/:historyId`

히스토리 아카이브 규칙:

- `POST /api/trips/:tripId/archive` 시 당시 계획의 `companion_snapshots`, `vehicle_snapshot` 이 함께 저장된다
- 히스토리 상세는 이후 기준 데이터가 바뀌어도 스냅샷을 우선 보여준다

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

### `GET /api/companions`

```json
{
  "items": [
    {
      "id": "self",
      "name": "본인",
      "age_group": "adult"
    }
  ]
}
```

### `GET /api/vehicles`

```json
{
  "items": [
    {
      "id": "family-suv",
      "name": "패밀리 SUV",
      "description": "가족 캠핑용 기본 차량",
      "passenger_capacity": 5,
      "load_capacity_kg": 400,
      "notes": []
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

### `POST /api/analyze-trip`

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "status": "queued",
  "requested_at": "2026-03-24T10:15:00.000Z",
  "started_at": null,
  "finished_at": null,
  "output_path": null,
  "error": null
}
```

### `GET /api/trips/:tripId/analysis-status`

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "status": "completed",
  "requested_at": "2026-03-24T10:15:00.000Z",
  "started_at": "2026-03-24T10:15:01.000Z",
  "finished_at": "2026-03-24T10:15:12.000Z",
  "output_path": ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
  "error": null
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

반복 장비 응답 추가 필드:

- `purchase_link`
- `metadata.lookup_status`
- `metadata.searched_at`
- `metadata.query`
- `metadata.product`
- `metadata.packing`
- `metadata.planning`
- `metadata.summary`
- `metadata.sources`

메타데이터 수집 규칙:

- 구매 링크가 있으면 AI 메타데이터 수집 시 참고 자료로 우선 사용한다
- `POST /api/equipment/durable/items/:itemId/metadata/refresh` 는 반복 장비 1건의 메타데이터를 재수집한다
- 메타데이터를 찾지 못하면 오류 대신 `metadata.lookup_status: not_found` 로 저장해 반환한다

### `GET /api/equipment/categories`

```json
{
  "version": 1,
  "durable": [
    {
      "id": "shelter",
      "label": "쉘터/텐트",
      "sort_order": 1
    }
  ],
  "consumables": [
    {
      "id": "fuel",
      "label": "연료",
      "sort_order": 1
    }
  ],
  "precheck": [
    {
      "id": "battery",
      "label": "배터리",
      "sort_order": 1
    }
  ]
}
```

### `GET /api/history`

```json
{
  "items": [
    {
      "history_id": "2026-03-08-yangpyeong",
      "title": "3월 양평 주말 캠핑",
      "companion_snapshots": [
        {
          "id": "self",
          "name": "본인",
          "age_group": "adult"
        }
      ],
      "vehicle_snapshot": {
        "id": "family-suv",
        "name": "패밀리 SUV"
      }
    }
  ]
}
```

### `GET /api/outputs/:tripId`

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "output_path": ".camping-data/outputs/2026-04-18-gapyeong-plan.md",
  "markdown": "# 4월 가평 가족 캠핑 분석 결과"
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

### `GET /api/data-backups`

```json
{
  "items": [
    {
      "created_at": "2026-03-23T14:30:00.000Z",
      "reason": "manual",
      "source_path": "/path/to/project/.camping-data",
      "backup_path": "/path/to/project/.camping-backups/2026-03-23T14-30-00.000Z",
      "data_path": "/path/to/project/.camping-backups/2026-03-23T14-30-00.000Z/data"
    }
  ]
}
```

### `POST /api/data-backups`

```json
{
  "item": {
    "created_at": "2026-03-23T14:30:00.000Z",
    "reason": "manual",
    "source_path": "/path/to/project/.camping-data",
    "backup_path": "/path/to/project/.camping-backups/2026-03-23T14-30-00.000Z",
    "data_path": "/path/to/project/.camping-backups/2026-03-23T14-30-00.000Z/data"
  }
}
```
