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
- `POST /api/ai-jobs/cancel-all`
- `GET /api/ai-jobs/events`

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
- `GET /api/ai-jobs/events` 는 분석 상태 변경을 SSE로 push 한다
- 상태 값은 `idle`, `queued`, `running`, `completed`, `failed`, `interrupted` 를 사용한다
- 분석 섹션 값은 `summary`, `equipment`, `personal_items`, `shortage`, `precheck`, `meals`, `travel_route`, `nearby_places`, `campsite_tips`, `risks_limits`, `next_camping` 을 사용한다
- `categories` 를 보내면 선택한 섹션만 queue 에 넣고, 생략하면 전체 섹션을 요청한 것으로 본다
- 같은 `trip_id` 안에서는 섹션 job 을 순차 실행하고, 섹션별 상태는 응답의 `categories` 배열로 확인한다
- `force_refresh: true` 는 이미 결과가 있는 섹션도 다시 수집할 때 사용한다
- `save_output` 을 생략하거나 `true` 로 보내면 완료 후 `.camping-data/outputs/<trip-id>-plan.md` 에 저장한다
- `save_output` 을 `false` 로 보내는 비동기 분석 요청은 지원하지 않으며 `TRIP_INVALID` 로 거절한다
- 같은 `trip_id` 와 같은 섹션이 이미 `queued` 또는 `running` 상태면 새 job 을 만들지 않고 기존 상태를 그대로 반환한다
- 분석이 진행 중이면 `DELETE /api/trips/:tripId` 와 `POST /api/trips/:tripId/archive` 는 `CONFLICT` 로 거절한다
- API 서버 재시작 시 남아 있던 `queued` 또는 `running` 상태는 `interrupted` 로 복구된다
- `POST /api/ai-jobs/cancel-all` 는 실행 중인 분석 요청을 중단하고 남아 있던 섹션 queue 를 비운다
- 전역 중단 응답은 `cancelled_analysis_trip_count`, `cancelled_analysis_category_count`, `cancelled_metadata_item_count` 를 함께 반환한다

### 장비 관리

- `GET /api/equipment`
- `GET /api/equipment/categories`
- `POST /api/equipment/categories/:section`
- `PUT /api/equipment/categories/:section/:categoryId`
- `DELETE /api/equipment/categories/:section/:categoryId`
- `POST /api/equipment/:section/items`
- `PUT /api/equipment/:section/items/:itemId`
- `GET /api/equipment/durable/metadata-statuses`
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

반복 장비 메타데이터 수집 규칙:

- `POST /api/equipment/durable/items/:itemId/metadata/refresh` 는 메타데이터 수집 작업을 백그라운드에 등록하고 `202 Accepted` 로 현재 작업 상태를 반환한다
- `GET /api/equipment/durable/metadata-statuses` 는 현재 durable 메타데이터 작업 상태 목록을 반환한다
- `GET /api/ai-jobs/events` 는 durable 메타데이터 상태 변경과 성공 완료 이벤트를 SSE로 push 한다
- 상태 값은 `queued`, `running`, `failed`, `interrupted` 를 사용한다
- 같은 `item_id` 가 이미 `queued` 또는 `running` 이면 새 수집을 만들지 않고 기존 상태를 그대로 반환한다
- 서로 다른 durable item 은 최대 3건까지 동시에 수집하고 초과 요청은 `queued` 로 대기한다
- 성공 완료는 별도 `completed` 상태를 저장하지 않고 상태 파일 삭제로 `idle` 로 복귀한다
- 실패 또는 중단 상태는 상태 파일에 남겨 두고 UI가 다시 읽어 경고와 재시도 상태를 복원한다
- 수집 중 장비명, 모델명, 구매 링크, 카테고리 같은 검색 입력이 바뀌면 현재 시도 결과는 버리고 최신 입력 기준으로 다시 수집한다
- durable item 삭제 시 메타데이터 결과 파일과 상태 파일을 함께 정리하고, 이미 실행 중이던 작업 결과도 저장하지 않는다
- API 서버 재시작 시 남아 있던 `queued` 또는 `running` 상태는 `interrupted` 로 복구한다
- `POST /api/ai-jobs/cancel-all` 는 실행 중인 durable 메타데이터 수집도 함께 중단하고 대기 queue 를 비운다

실시간 이벤트 규칙:

- `GET /api/ai-jobs/events` 는 `text/event-stream` SSE 연결을 유지한다
- 이벤트 타입은 `ready`, `heartbeat`, `analysis-status`, `durable-metadata-status`, `durable-metadata-completed` 를 사용한다
- `analysis-status` 는 전체 `AnalyzeTripResponse` payload를 보낸다
- `durable-metadata-status` 는 전체 `DurableMetadataJobStatusResponse` payload를 보낸다
- `durable-metadata-completed` 는 `{ item_id, completed_at }` payload를 보낸다
- 클라이언트는 SSE를 기본 실시간 채널로 사용하고, 재연결 직후에는 기존 상태 조회 API로 재동기화한다

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
  "categories": [
    {
      "category": "campsite_tips",
      "label": "9. 캠핑장 tip",
      "sections": [
        { "order": 9, "title": "캠핑장 tip" }
      ],
      "status": "queued",
      "has_result": false,
      "requested_at": "2026-03-24T10:15:00.000Z",
      "started_at": null,
      "finished_at": null,
      "collected_at": null
    }
  ],
  "completed_category_count": 0,
  "total_category_count": 11,
  "error": null
}
```

### `POST /api/equipment/durable/items/:itemId/metadata/refresh`

```json
{
  "item_id": "family-tent",
  "status": "queued",
  "requested_at": "2026-03-24T10:20:00.000Z",
  "started_at": null,
  "finished_at": null,
  "error": null
}
```

### `GET /api/equipment/durable/metadata-statuses`

```json
{
  "items": [
    {
      "item_id": "family-tent",
      "status": "running",
      "requested_at": "2026-03-24T10:20:00.000Z",
      "started_at": "2026-03-24T10:20:01.000Z",
      "finished_at": null,
      "error": null
    }
  ]
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
  "categories": [
    {
      "category": "equipment",
      "label": "2. 추천 장비",
      "sections": [{ "order": 2, "title": "추천 장비" }],
      "status": "completed",
      "has_result": true,
      "requested_at": "2026-03-24T10:15:00.000Z",
      "started_at": "2026-03-24T10:15:01.000Z",
      "finished_at": "2026-03-24T10:15:04.000Z",
      "collected_at": "2026-03-24T10:15:04.000Z"
    }
  ],
  "completed_category_count": 1,
  "total_category_count": 11,
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
- 반복 장비 저장 또는 추가 뒤에는 UI가 필요한 경우 메타데이터 수집 API를 자동 호출할 수 있다
- `POST /api/equipment/durable/items/:itemId/metadata/refresh` 응답은 메타데이터 본문이 아니라 작업 상태다
- 메타데이터를 찾지 못하면 오류 대신 `metadata.lookup_status: not_found` 를 메타데이터 캐시에 저장한다

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
