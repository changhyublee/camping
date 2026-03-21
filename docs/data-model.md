# Data Model

## 1. 문서 목적

이 문서는 `./.camping-data/` 에 저장할 로컬 데이터의 구조를 정의한다.

목표는 다음과 같다.

- 사용자가 직접 입력해야 하는 데이터와
- AI가 분석 과정에서 생성하는 데이터와
- 외부 정보에서 가져오거나 캐시하는 데이터를

서로 섞이지 않게 분리하는 것이다.

## 2. 데이터 모델 원칙

### 원칙 1. 원본 입력과 추천 결과를 분리한다

예를 들어 개인 준비물은 사용자가 직접 `썬크림`, `우비`, `비상약` 을 하나씩 입력하는 구조가 아니다.
원본 입력은 `동행자 연령대`, `건강 특이사항`, `날씨`, `장소`, `기온` 이고,
개인 준비물은 이 원본 데이터를 기준으로 AI가 추천하는 결과다.

즉:

- 사용자가 입력하는 것: 사실 데이터
- AI가 만드는 것: 해석/추천 데이터

### 원칙 2. 사람이 직접 수정할 파일은 YAML로 둔다

사람이 자주 보는 파일은 YAML을 사용한다.

- profile
- companions
- equipment
- preferences
- trip request

### 원칙 3. 결과물은 Markdown으로 둔다

분석 결과는 읽기 쉬운 Markdown 문서로 저장한다.

### 원칙 4. 외부 조회 결과는 캐시로 분리한다

날씨, 장소, 맛집 같은 데이터는 사용자의 원본 데이터가 아니라
시점 의존적인 조회 결과이므로 캐시로 관리한다.

## 3. 디렉토리 구조

```text
./.camping-data/
├── profile.yaml
├── companions.yaml
├── equipment/
│   ├── durable.yaml
│   ├── consumables.yaml
│   └── precheck.yaml
├── preferences/
│   ├── travel.yaml
│   └── food.yaml
├── trips/
│   └── 2026-04-18-gapyeong.yaml
├── outputs/
│   └── 2026-04-18-gapyeong-plan.md
└── cache/
    ├── weather/
    └── places/
```

## 4. 데이터 분류

### 4.1 사용자 원본 데이터

사용자가 직접 입력하거나 관리하는 데이터다.

- `profile.yaml`
- `companions.yaml`
- `equipment/durable.yaml`
- `equipment/consumables.yaml`
- `equipment/precheck.yaml`
- `preferences/travel.yaml`
- `preferences/food.yaml`
- `trips/*.yaml`

### 4.2 파생 데이터

AI가 원본 데이터를 해석해서 만든 추천 결과다.

- 개인 준비물 추천 목록
- 장비 추천 목록
- 누락 장비 목록
- 과잉 장비 목록
- 식단/요리 추천
- 이동 경로 추천
- 주변 관광/맛집 추천
- 출발 전 체크리스트

이 데이터는 기본적으로 `outputs/*.md` 또는 추후 `outputs/*.json` 으로 저장한다.

### 4.3 외부 캐시 데이터

외부 조회 또는 수동 입력으로 확보한 시점 의존 데이터다.

- 날씨 예보
- 장소 정보
- 영업시간
- 주변 POI 정보

기본 저장 위치:

- `cache/weather/*.json`
- `cache/places/*.json`

## 5. 공통 규칙

### 식별자 규칙

- 파일명과 내부 ID는 소문자 kebab-case를 사용한다
- 예: `gapyeong-jarasum`, `family-suv`, `winter-blanket`
- `id` 는 각 레코드를 고유하게 식별하는 값이다
- 같은 종류의 장비가 여러 개 있더라도 각 장비 레코드는 서로 다른 `id` 를 가져야 한다
- 같은 종류를 묶고 싶으면 `kind` 같은 별도 필드를 둔다

예:

- `id: tunnel-tent-4p-khaki`
- `id: tunnel-tent-4p-sand`
- 두 레코드 모두 `kind: tunnel-tent-4p`

### 날짜 규칙

- 날짜는 `YYYY-MM-DD`
- 날짜 시간은 가능하면 ISO 8601

### 연령대 규칙

v1에서는 자유 텍스트보다 제한된 enum을 권장한다.

권장 값:

- `adult`
- `preschooler`
- `elementary`
- `middle_school`
- `high_school`
- `senior`

표시명은 UI 또는 출력 문서에서 한글로 바꿔서 보여준다.

### 상태값 규칙

재고/점검 상태 같은 값은 가능한 한 enum으로 관리한다.

예:

- `ok`
- `low`
- `empty`
- `needs_check`
- `needs_repair`

## 6. 파일별 데이터 모델

## 6.1 `profile.yaml`

목적:

- 사용자 기본 프로필과 공통 운영 조건 저장

권장 필드:

```yaml
version: 1
owner:
  name: leech
home_region: seoul
default_vehicle_id: family-suv
default_party_size: 2
units:
  temperature: celsius
  distance: km
  weight: kg
```

필드 설명:

- `version`: 파일 포맷 버전
- `owner.name`: 사용자 식별용 이름
- `home_region`: 자주 출발하는 지역
- `default_vehicle_id`: 기본 차량 ID
- `default_party_size`: 기본 인원수
- `units`: 표시 단위

## 6.2 `companions.yaml`

목적:

- 동행자 정보 저장
- 개인 준비물 추천의 핵심 입력값 제공

권장 구조:

```yaml
version: 1
companions:
  - id: self
    name: 본인
    age_group: adult
    birth_year: 1990
    health_notes: []
    required_medications: []
    traits:
      cold_sensitive: false
      heat_sensitive: false
      rain_sensitive: false
  - id: child-1
    name: 첫째
    age_group: preschooler
    birth_year: 2021
    health_notes:
      - skin_sensitive
    required_medications:
      - pediatric-fever-medicine
    traits:
      cold_sensitive: true
      heat_sensitive: false
      rain_sensitive: true
```

핵심 포인트:

- 사용자는 개인 준비물 목록을 직접 적지 않는다
- 대신 AI가 준비물 추천에 필요한 `연령대`, `건강 특이사항`, `복용약`, `체질 특성` 을 입력한다

## 6.3 `equipment/durable.yaml`

목적:

- 반복 사용 가능한 캠핑 장비 저장

권장 구조:

```yaml
version: 1
items:
  - id: tunnel-tent-4p-khaki
    kind: tunnel-tent-4p
    name: 4인용 터널 텐트 카키
    model: A사 패밀리 터널 4P
    category: shelter
    quantity: 1
    capacity:
      people: 4
    season_support:
      spring: true
      summer: true
      autumn: true
      winter: false
    tags:
      - family
      - rain_cover
    status: ok
    notes: 여름에는 타프와 함께 사용 권장
  - id: tunnel-tent-4p-sand
    kind: tunnel-tent-4p
    name: 4인용 터널 텐트 샌드
    model: B사 리빙쉘 4P
    category: shelter
    quantity: 1
    capacity:
      people: 4
    season_support:
      spring: true
      summer: true
      autumn: true
      winter: false
    tags:
      - family
      - rain_cover
    status: ok
  - id: sleeping-bag-3season-adult
    kind: sleeping-bag-3season
    name: 3계절 침낭 어른용
    model: 머미형 800g
    category: sleeping
    quantity: 1
    season_support:
      spring: true
      summer: true
      autumn: true
      winter: false
    tags:
      - family
      - adult
    status: ok
  - id: sleeping-bag-3season-kid
    kind: sleeping-bag-3season
    name: 3계절 침낭 키즈용
    model: 키즈형
    category: sleeping
    quantity: 1
    season_support:
      spring: true
      summer: true
      autumn: true
      winter: false
    tags:
      - family
      - kid
    status: ok
  - id: firepit-basic
    name: 화로대
    category: cooking_fire
    quantity: 1
    season_support:
      spring: true
      summer: true
      autumn: true
      winter: true
    tags:
      - bbq
    status: ok
```

필드 해석:

- `id`: 각 장비 레코드의 고유 식별자
- `kind`: 같은 종류의 장비를 묶는 분류 키
- `model`: 같은 종류 안에서 모델/사양/버전을 구분하는 설명 필드
- `quantity`: 완전히 동일한 장비가 몇 개인지 나타내는 수량

권장 입력 원칙:

- 동일 모델이 2개면 `quantity: 2`
- 같은 종류지만 서로 다른 모델이면 레코드를 2개 만들고 `id` 를 다르게 둔다
- AI는 `kind` 와 `model` 을 함께 보고 어떤 장비를 추천할지 판단한다

권장 카테고리 예시:

- `shelter`
- `sleeping`
- `lighting`
- `cooking`
- `cooking_fire`
- `furniture`
- `heating`
- `cooling`
- `safety`
- `etc`

## 6.4 `equipment/consumables.yaml`

목적:

- 사용량이 줄어드는 소모품 저장

권장 구조:

```yaml
version: 1
items:
  - id: butane-gas
    name: 부탄가스
    category: fuel
    quantity_on_hand: 6
    unit: can
    low_stock_threshold: 2
    status: ok
  - id: mosquito-coil
    name: 모기향
    category: insect_repellent
    quantity_on_hand: 3
    unit: pack
    low_stock_threshold: 1
    status: ok
  - id: kerosene
    name: 난로용 등유
    category: fuel
    quantity_on_hand: 4
    unit: liter
    low_stock_threshold: 2
    status: low
```

## 6.5 `equipment/precheck.yaml`

목적:

- 출발 전 점검이 필요한 항목 저장

권장 구조:

```yaml
version: 1
items:
  - id: lantern-battery
    name: 랜턴 배터리
    category: battery
    status: needs_check
    last_checked_at: 2026-03-20
    notes: 충전식 랜턴 2개
  - id: powerbank-charge
    name: 보조배터리 충전 상태
    category: battery
    status: ok
    last_checked_at: 2026-03-21
  - id: vehicle-load-space
    name: 차량 적재 가능 상태
    category: vehicle
    status: needs_check
```

## 6.6 `preferences/travel.yaml`

목적:

- 여행 동선과 주변 즐길거리 추천에 필요한 취향 저장

권장 구조:

```yaml
version: 1
travel_style:
  preferred_stop_count: 1
  max_extra_drive_minutes: 60
  avoid_heavy_traffic: true
interests:
  - nature
  - river_walk
  - local_market
constraints:
  pet_friendly_required: false
  child_friendly_preferred: true
  indoor_backup_needed: true
```

## 6.7 `preferences/food.yaml`

목적:

- 캠핑 요리와 맛집 추천에 필요한 음식 취향 저장

권장 구조:

```yaml
version: 1
favorite_styles:
  - bbq
  - stew
  - simple_breakfast
disliked_ingredients:
  - cilantro
allergies:
  - peanut
meal_preferences:
  breakfast: light
  lunch: local_restaurant
  dinner: campsite_cooking
cooking_preferences:
  preferred_difficulty: easy
  preferred_time_minutes: 40
  prefer_hot_food_in_cold_weather: true
```

## 6.8 `trips/*.yaml`

목적:

- 특정 캠핑 일정에 대한 입력 요청 저장

이 파일이 실제 분석의 중심 입력이다.

권장 구조:

```yaml
version: 1
trip_id: 2026-04-18-gapyeong
title: 4월 가평 가족 캠핑
date:
  start: 2026-04-18
  end: 2026-04-19
location:
  campsite_name: 자라섬 캠핑장
  region: gapyeong
  coordinates:
    lat: 37.818
    lng: 127.521
departure:
  region: seoul
party:
  companion_ids:
    - self
    - child-1
vehicle:
  id: family-suv
  load_capacity_kg: 400
  passenger_capacity: 5
conditions:
  electricity_available: true
  cooking_allowed: true
  expected_weather:
    source: manual
    summary: 낮에는 따뜻하고 밤에는 쌀쌀함
    min_temp_c: 8
    max_temp_c: 19
    precipitation: none
meal_plan:
  use_ai_recommendation: true
  requested_dishes:
    - bbq
travel_plan:
  use_ai_recommendation: true
  requested_stops: []
notes:
  - 아이와 함께 가는 첫 봄 캠핑
```

핵심 규칙:

- 날씨 정보가 없으면 분석 시점에 수동 입력 또는 외부 조회 결과를 결합한다
- `meal_plan` 과 `travel_plan` 은 사용자가 일부 입력하고 나머지를 AI가 보완할 수 있다

## 6.9 `outputs/*.md`

목적:

- AI 분석 결과 저장

권장 포함 항목:

- 캠핑 개요
- 추천 장비 목록
- 연령대별 개인 준비물 목록
- 부족한 소모품 목록
- 출발 전 점검 체크리스트
- 추천 식단 및 요리
- 이동 중 추천 장소
- 캠핑장 주변 추천 장소
- 주의사항

예시 파일명:

```text
2026-04-18-gapyeong-plan.md
```

## 6.10 `cache/weather/*.json`

목적:

- 특정 날짜/지역의 날씨 조회 결과 저장

예시 키:

- 조회 시각
- 제공자
- 예보 날짜
- 최저/최고 기온
- 강수 확률
- 풍속
- 특이 기상

## 6.11 `cache/places/*.json`

목적:

- 캠핑장 주변 장소, 맛집, 관광지 등의 조회 결과 저장

예시 키:

- 이름
- 카테고리
- 좌표
- 운영 시간
- 휴무일
- 주차 여부
- 아동 친화 여부
- 반려동물 가능 여부

## 7. 추천 로직에 직접 연결되는 핵심 관계

### 관계 1. 동행자 정보 -> 개인 준비물 추천

입력:

- `companions.yaml`
- `trips/*.yaml.conditions`
- `trips/*.yaml.location`

출력 예:

- 성인: 썬글라스, 썬크림, 우비, 방풍 자켓
- 유치원생: 여벌 옷, 방수 장갑, 체온 조절용 외투, 아동용 비상약

### 관계 2. 장비 + 조건 -> 장비 추천/누락 탐지

입력:

- `equipment/*.yaml`
- `trips/*.yaml`

출력 예:

- 챙겨야 할 장비
- 불필요한 장비
- 부족한 소모품

### 관계 3. 음식 취향 + 조건 -> 메뉴 추천

입력:

- `preferences/food.yaml`
- `trips/*.yaml.meal_plan`
- 날씨/기온 정보

출력 예:

- 저녁: 바비큐 + 어묵탕
- 아침: 간단한 샌드위치 + 컵스프

### 관계 4. 이동 선호 + 장소 조건 -> 여행/맛집 추천

입력:

- `preferences/travel.yaml`
- `trips/*.yaml.departure`
- `trips/*.yaml.location`
- 장소 캐시 데이터

출력 예:

- 이동 중 경유지
- 캠핑장 근처 카페
- 비 오는 날 대체 실내 장소

## 8. v1에서 의도적으로 제외하는 데이터

아래 데이터는 나중에 필요해지면 추가한다.

- 사용자 계정/로그인 정보
- 결제 정보
- 예약 상태 동기화
- 다중 사용자 권한 모델
- 실시간 위치 추적
- 자동 차량 센서 연동 데이터

## 9. 스키마 설계 메모

추후 `schemas/` 디렉토리에는 아래 스키마를 추가한다.

- `profile.schema.json`
- `companions.schema.json`
- `equipment-durable.schema.json`
- `equipment-consumables.schema.json`
- `equipment-precheck.schema.json`
- `preferences-travel.schema.json`
- `preferences-food.schema.json`
- `trip-request.schema.json`

목적:

- YAML 구조 검증
- 잘못된 enum 값 방지
- 필수 필드 누락 탐지

## 10. 현재 결정 사항

- 운영 데이터는 `./.camping-data/` 에 저장한다
- 사람이 직접 입력하는 데이터는 YAML을 사용한다
- 분석 결과는 Markdown으로 저장한다
- 개인 준비물은 사용자 직접 입력이 아니라 AI 추천 결과로 본다
- 개인 준비물 추천의 핵심 입력은 동행자 연령대와 건강/상황 정보다
- 여행지/맛집/날씨 정보는 원본 데이터가 아니라 캐시 또는 보조 입력으로 본다

## 11. 다음 문서 제안

이 문서 다음으로는 아래 순서를 권장한다.

1. `docs/directory-structure.md`
2. `docs/trip-analysis-workflow.md`
3. `docs/mvp-scope.md`
