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
- `POST /api/trips/weather/collect`
- `POST /api/trips/:tripId/analysis-email`
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
- 전역 중단 응답은 `cancelled_analysis_trip_count`, `cancelled_analysis_category_count`, `cancelled_metadata_item_count`, `cancelled_user_learning_job_count` 를 함께 반환한다
- `POST /api/trips/:tripId/analysis-email` 은 전체 분석이 모두 모였을 때만 동작한다
- 요청 본문은 `{ "recipient_companion_ids": ["self", "child-1"] }` 형식을 사용한다
- 수신 대상은 현재 계획 `party.companion_ids` 안에 있으면서 메일 주소가 등록된 동행자만 허용한다
- 발송 성공 시 현재 선택한 `recipient_companion_ids` 는 `trips/<trip-id>.yaml` 의 `notifications.email_recipient_companion_ids` 에 함께 저장한다
- `POST /api/trips/weather/collect` 는 `region`, `start_date`, `end_date`, `campsite_name` 을 받아 Nominatim geocoding + Open-Meteo forecast API로 날씨 요약을 구조화한다
- Open-Meteo 예보는 현재 시점부터 최대 16일까지만 조회한다
- 요청 기간이 예보 가능 범위와 일부만 겹치면 가능한 날짜만 조회하고, 제외된 날짜는 `notes` 에 남긴다
- `POST /api/trips` 와 `PUT /api/trips/:tripId` 는 저장된 계획의 날씨 입력이 비어 있고 지역과 일정이 있으면 백그라운드 날씨 수집을 자동으로 시작한다
- 자동 수집은 저장 응답을 막지 않고 별도로 진행하며, 성공 시 `trips/<trip-id>.yaml` 의 `conditions.expected_weather` 와 `cache/weather/<trip-id>-weather.json` 을 함께 갱신한다

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
- 이벤트 타입은 `ready`, `heartbeat`, `analysis-status`, `durable-metadata-status`, `durable-metadata-completed`, `user-learning-status` 를 사용한다
- `analysis-status` 는 전체 `AnalyzeTripResponse` payload를 보낸다
- `durable-metadata-status` 는 전체 `DurableMetadataJobStatusResponse` payload를 보낸다
- `durable-metadata-completed` 는 `{ item_id, completed_at }` payload를 보낸다
- `user-learning-status` 는 전체 `UserLearningJobStatusResponse` payload를 보낸다
- 클라이언트는 pending 분석, 메타데이터 수집, 개인화 학습 작업이 있을 때만 SSE 연결을 유지한다
- pending 작업이 모두 사라지면 클라이언트는 SSE 연결을 닫고, 이후 페이지 재진입이나 새 작업 시작 시 상태 조회 API로 현재 상태를 다시 맞춘다
- SSE 재연결 직후에는 기존 상태 조회 API로 재동기화한다

### 캠핑 히스토리

- `GET /api/history`
- `GET /api/history/:historyId`
- `GET /api/history/:historyId/learning`
- `POST /api/history/:historyId/retrospectives`
- `PUT /api/history/:historyId`
- `DELETE /api/history/:historyId`

### 개인화 학습

- `GET /api/user-learning`

히스토리 아카이브 규칙:

- `POST /api/trips/:tripId/archive` 시 당시 계획의 `companion_snapshots`, `vehicle_snapshot` 이 함께 저장된다
- 히스토리 상세는 이후 기준 데이터가 바뀌어도 스냅샷을 우선 보여준다
- `GET /api/history/:historyId` 는 `retrospectives` 배열까지 포함한 전체 히스토리를 반환한다
- `POST /api/history/:historyId/retrospectives` 는 회고 엔트리를 append 저장하고 `202 Accepted` 로 현재 `learning_status` 를 함께 반환한다
- `PUT /api/history/:historyId` 는 메모 같은 일반 히스토리 필드 수정용으로 유지하고, `retrospectives` 변경은 무시한다
- 회고 저장은 항상 원문 저장이 우선이고, 이후 개인화 학습은 별도 백그라운드 작업으로 갱신한다
- `GET /api/history/:historyId/learning` 은 해당 히스토리의 AI 회고 분석 결과를 반환한다
- `DELETE /api/history/:historyId` 시 회고가 있던 히스토리를 삭제하면 전역 개인화 학습 프로필을 다시 합성한다

개인화 학습 규칙:

- `GET /api/user-learning` 은 `{ profile, status }` 를 반환한다
- `profile` 이 없으면 `null` 을 반환하고 `status` 는 `idle` 또는 현재 진행 상태를 유지한다
- 상태 값은 `idle`, `queued`, `running`, `completed`, `failed`, `interrupted` 를 사용한다
- 회고 저장 직후에는 전역 개인화 학습 작업을 `queued` 로 올리고, 실행 중 새 회고가 들어오면 현재 작업이 끝난 뒤 최신 입력 기준으로 한 번 더 재합성한다
- `POST /api/ai-jobs/cancel-all` 은 실행 중인 개인화 학습도 함께 중단한다

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
      "email": "self@example.com",
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

### `POST /api/trips/:tripId/analysis-email`

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "sent_at": "2026-03-24T11:00:00.000Z",
  "sent_count": 2,
  "recipients": [
    {
      "companion_id": "self",
      "name": "본인",
      "email": "self@example.com"
    },
    {
      "companion_id": "child-1",
      "name": "첫째",
      "email": "child-1@example.com"
    }
  ],
  "output_path": ".camping-data/outputs/2026-04-18-gapyeong-plan.md"
}
```

### `POST /api/trips/weather/collect`

```json
{
  "item": {
    "lookup_status": "found",
    "searched_at": "2026-04-10T14:12:00.000Z",
    "query": "gapyeong 자라섬 캠핑장 2026-04-18 2026-04-19 날씨",
    "region": "gapyeong",
    "campsite_name": "자라섬 캠핑장",
    "start_date": "2026-04-18",
    "end_date": "2026-04-19",
    "summary": "대체로 맑은 날씨 예상입니다.",
    "min_temp_c": 8,
    "max_temp_c": 18,
    "precipitation": "뚜렷한 강수 예보는 약합니다. 최대 강수 확률 15%, 예상 누적 강수량 0.2mm",
    "search_result_excerpt": "Gapyeong, Gyeonggi-do, South Korea 기준 2026-04-18~2026-04-19 예보, 최저 8°C / 최고 18°C, 최대 강수 확률 15%, 누적 강수량 0.2mm",
    "source": "open-meteo",
    "lookup_url": "https://api.open-meteo.com/v1/forecast?latitude=37.83&longitude=127.51&daily=weather_code%2Ctemperature_2m_min%2Ctemperature_2m_max%2Cprecipitation_probability_max%2Cprecipitation_sum&timezone=auto&start_date=2026-04-18&end_date=2026-04-19",
    "notes": [
      "좌표 기준 위치: Gapyeong, Gyeonggi-do, South Korea (37.830, 127.510)",
      "기간 전체 일별 예보를 합쳐 최저/최고 기온과 최대 강수 확률을 요약했습니다.",
      "예보 시간대: KST"
    ],
    "sources": [
      {
        "title": "Nominatim Search API",
        "url": "https://nominatim.openstreetmap.org/search?q=%EA%B2%BD%EA%B8%B0%EB%8F%84+%EA%B0%80%ED%8F%89%EA%B5%B0&format=jsonv2&limit=10&addressdetails=1&accept-language=ko%2Cen&countrycodes=kr",
        "domain": "nominatim.openstreetmap.org"
      },
      {
        "title": "Open-Meteo Forecast API",
        "url": "https://api.open-meteo.com/v1/forecast?latitude=37.83&longitude=127.51&daily=weather_code%2Ctemperature_2m_min%2Ctemperature_2m_max%2Cprecipitation_probability_max%2Cprecipitation_sum&timezone=auto&start_date=2026-04-18&end_date=2026-04-19",
        "domain": "api.open-meteo.com"
      }
    ]
  },
  "expected_weather": {
    "source": "open-meteo",
    "summary": "대체로 맑은 날씨 예상입니다.",
    "min_temp_c": 8,
    "max_temp_c": 18,
    "precipitation": "뚜렷한 강수 예보는 약합니다. 최대 강수 확률 15%, 예상 누적 강수량 0.2mm"
  }
}
```

## 5. 환경 변수

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

메일 발송은 SMTP 설정이 모두 준비되지 않으면 `DEPENDENCY_MISSING` 으로 거절한다.

- `SMTP_HOST` 와 `SMTP_FROM` 은 항상 필요하다.
- SMTP 인증을 쓰는 환경이면 `SMTP_USER` 와 `SMTP_PASS` 를 함께 설정해야 한다.
- 날씨 자동 수집, 반복 장비 메타데이터 수집, 캠핑장 tip 조사는 메일 설정과 별개로 보조 웹 조사 모델 설정을 사용한다.

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

### `POST /api/history/:historyId/retrospectives`

```json
{
  "item": {
    "history_id": "2026-03-08-yangpyeong",
    "title": "3월 양평 주말 캠핑",
    "retrospectives": [
      {
        "entry_id": "retro-2026-03-09T09-10-00-000Z",
        "created_at": "2026-03-09T09:10:00.000Z",
        "overall_satisfaction": 4,
        "used_durable_item_ids": ["family-tent"],
        "unused_items": ["여벌 랜턴 1개는 과했다"],
        "missing_or_needed_items": ["방수 수납백을 더 챙기면 좋다"],
        "meal_feedback": ["아침 국물 메뉴가 더 잘 맞았다"],
        "route_feedback": ["출발 시간을 더 당기면 체크인이 편하다"],
        "site_feedback": ["그늘이 부족해서 타프 체감이 컸다"],
        "issues": ["새벽 바람이 강했다"],
        "next_time_requests": ["차광막을 먼저 설치하고 싶다"],
        "freeform_note": "아이 낮잠 시간 전에는 세팅을 끝내는 편이 훨씬 수월했다."
      }
    ]
  },
  "learning_status": {
    "status": "queued",
    "trigger_history_id": "2026-03-08-yangpyeong",
    "source_history_ids": [],
    "source_entry_count": 0,
    "requested_at": "2026-03-09T09:10:00.000Z",
    "started_at": null,
    "finished_at": null
  }
}
```

### `GET /api/history/:historyId/learning`

```json
{
  "item": {
    "history_id": "2026-03-08-yangpyeong",
    "updated_at": "2026-03-09T09:10:08.000Z",
    "source_entry_count": 2,
    "summary": "차광과 빠른 세팅, 아침 국물 메뉴 선호가 반복적으로 드러났다.",
    "behavior_patterns": ["도착 직후 핵심 세팅을 먼저 끝내는 편이 만족도가 높다."],
    "equipment_hints": ["차광막과 방수 수납 준비를 우선순위로 둔다."],
    "meal_hints": ["아침에는 따뜻한 국물 메뉴 만족도가 높다."],
    "route_hints": ["체크인 혼잡 전에 도착하는 일정을 선호한다."],
    "campsite_hints": ["그늘 부족과 바람 노출을 먼저 본다."],
    "avoidances": ["과한 조명 장비 중복 적재를 줄인다."],
    "issues": ["새벽 강풍 대응이 필요했다."],
    "next_time_requests": ["세팅 동선을 더 단순화하고 싶다."],
    "next_trip_focus": ["차광과 방풍, 빠른 세팅 순서 최적화"]
  }
}
```

### `GET /api/user-learning`

```json
{
  "profile": {
    "updated_at": "2026-03-09T09:10:10.000Z",
    "source_history_ids": ["2026-03-08-yangpyeong"],
    "source_entry_count": 2,
    "summary": "빠른 세팅, 차광/방풍 우선, 아침 국물 메뉴 선호가 누적됐다.",
    "behavior_patterns": ["현장 도착 후 핵심 거주 환경부터 먼저 안정화하는 편이다."],
    "equipment_hints": ["차광막, 방수 수납, 바람 대응 장비 우선 확인"],
    "meal_hints": ["아침은 따뜻한 메뉴, 저녁은 준비가 단순한 메뉴 선호"],
    "route_hints": ["체크인 혼잡 전 도착 일정 선호"],
    "campsite_hints": ["그늘과 바람 노출 여부를 먼저 본다."],
    "avoidances": ["중복 조명 장비 과적을 피한다."],
    "next_trip_focus": ["차광과 방풍, 세팅 동선 단순화"]
  },
  "status": {
    "status": "completed",
    "trigger_history_id": "2026-03-08-yangpyeong",
    "source_history_ids": ["2026-03-08-yangpyeong"],
    "source_entry_count": 2,
    "requested_at": "2026-03-09T09:10:00.000Z",
    "started_at": "2026-03-09T09:10:01.000Z",
    "finished_at": "2026-03-09T09:10:10.000Z"
  }
}
```

### `POST /api/ai-jobs/cancel-all`

```json
{
  "status": "cancelled",
  "cancelled_analysis_trip_count": 1,
  "cancelled_analysis_category_count": 3,
  "cancelled_metadata_item_count": 1,
  "cancelled_user_learning_job_count": 1
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
