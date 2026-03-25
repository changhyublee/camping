# 데이터 모델

## 1. 문서 목적

이 문서는 `./.camping-data/` 에 저장하는 로컬 운영 데이터의 구조를 정의한다.

## 2. 핵심 원칙

### 원칙 1. 원본 입력과 AI 추천 결과를 분리한다

- 사용자가 입력하는 것: 장비, 계획, 동행자, 차량, 링크, 취향
- AI가 만드는 것: 개인 준비물, 장비 추천, 체크리스트, 여정 제안

### 원칙 2. 사람이 관리하는 데이터는 YAML로 둔다

- 장비
- 동행자
- 차량
- 계획
- 히스토리
- 링크

### 원칙 3. 결과 문서는 Markdown으로 둔다

- 분석 결과는 `outputs/*.md`

### 원칙 4. 분석 상태는 입력 파일과 분리한 JSON 캐시로 둔다

- 계획 원본인 `trips/*.yaml` 에 분석 상태를 섞지 않는다
- 분석 상태는 `cache/analysis-jobs/*.json` 으로 저장한다

### 원칙 5. 반복 장비 메타데이터 상태도 원본 장비 파일과 분리한 JSON 캐시로 둔다

- `equipment/durable.yaml` 에 메타데이터 작업 상태를 섞지 않는다
- 메타데이터 결과는 `cache/equipment-metadata/durable/*.json` 으로 저장한다
- 메타데이터 작업 상태는 `cache/equipment-metadata/jobs/durable/*.json` 으로 저장한다

### 원칙 6. 운영 데이터 백업은 별도 경로로 분리한다

- 시점별 백업은 `./.camping-backups/`
- 운영 데이터와 다른 루트에 둬서 초기화 작업이 백업까지 지우지 않게 한다

## 3. 디렉토리 구조

```text
./.camping-data/
├── profile.yaml
├── companions.yaml
├── vehicles.yaml
├── equipment/
│   ├── categories.yaml
│   ├── durable.yaml
│   ├── consumables.yaml
│   └── precheck.yaml
├── preferences/
│   ├── travel.yaml
│   └── food.yaml
├── trips/
├── history/
├── outputs/
├── links.yaml
└── cache/
    ├── analysis-jobs/
    ├── campsite-tips/
    ├── places/
    ├── weather/
    └── equipment-metadata/
        ├── durable/
        └── jobs/
            └── durable/

./.camping-backups/
└── <timestamp>/
    ├── backup.json
    └── data/
```

## 4. 데이터 분류

### 4.1 사용자 원본 데이터

- `profile.yaml`
- `companions.yaml`
- `vehicles.yaml`
- `equipment/*.yaml`
- `equipment/categories.yaml`
- `preferences/*.yaml`
- `trips/*.yaml`
- `history/*.yaml`
- `links.yaml`

### 4.2 파생 데이터

- 장비 추천
- 연령대별 개인 준비물 추천
- 누락 장비 목록
- 식단/요리 추천
- 이동/주변 추천
- 체크리스트

저장 위치:

- `outputs/*.md`

### 4.3 작업 상태 및 캐시 데이터

- 분석 작업 상태
- 반복 장비 메타데이터 작업 상태
- 날씨 캐시
- 장소 캐시
- 캠핑장 후기 tip 캐시

저장 위치:

- `cache/analysis-jobs/*.json`
- `cache/equipment-metadata/jobs/durable/*.json`
- `cache/weather/*.json`
- `cache/places/*.json`
- `cache/campsite-tips/*.json`

### 4.4 장비 메타데이터 캐시

- 반복 장비별 AI 수집 메타데이터

저장 위치:

- `cache/equipment-metadata/durable/*.json`

### 4.5 백업 스냅샷 데이터

- 수동 백업
- 서버 시작 시 자동 백업
- 예시 데이터로 재초기화하기 전 백업

저장 위치:

- `.camping-backups/<timestamp>/backup.json`
- `.camping-backups/<timestamp>/data/**`

## 5. 파일별 역할

### `companions.yaml`

- 동행자 프로필 원본 데이터
- 계획 화면에서 선택하는 `companion_ids` 의 기준 목록
- 이름, 연령대, 건강 특이사항, 복용약, 민감도 정보를 저장

### `vehicles.yaml`

- 차량 기준 데이터
- 계획 화면에서 선택하는 차량 목록
- 표시 이름, 설명, 탑승 인원, 적재량, 차량 메모를 저장

### `equipment/categories.yaml`

- 장비 섹션별 카테고리 코드와 표시 이름
- 장비 화면 셀렉트와 카테고리 설정 화면의 기준 데이터

### `equipment/durable.yaml`

- 반복 사용 장비
- 카테고리와 수량 관리
- 사람이 직접 관리하는 원본 장비 정보와 선택적 `purchase_link` 저장

### `equipment/consumables.yaml`

- 소모품 재고
- 현재 수량과 부족 기준 관리
- 부족 여부는 저장값이 아니라 수량 기준으로 계산

### `equipment/precheck.yaml`

- 출발 전 점검 항목
- 상태와 마지막 점검 메모

### `trips/*.yaml`

- 앞으로 갈 캠핑 계획
- 분석 단위
- 선택한 동행자 ID와 차량 스냅샷을 함께 저장

### `history/*.yaml`

- 완료된 캠핑 기록
- 계획 스냅샷, 결과 문서 경로, 메모 보관
- 아카이브 당시 `companion_snapshots`, `vehicle_snapshot` 저장

### `links.yaml`

- 날씨, 장소, 맛집, 장보기 링크 북마크

### `cache/equipment-metadata/durable/*.json`

- 반복 장비별 AI 수집 메타데이터 캐시
- 포장 크기, 무게, 설치 시간, 수용 인원, 계절/날씨 메모, 출처, 검색 상태 저장
- `equipment/durable.yaml` 원본과 분리해 저장하고 API 응답에서 병합

### `cache/equipment-metadata/jobs/durable/*.json`

- 반복 장비별 백그라운드 메타데이터 수집 상태 캐시
- `status`, `requested_at`, `started_at`, `finished_at`, `error` 저장
- 성공 완료는 상태 파일 삭제로 처리하고, 파일이 없으면 해당 장비는 `idle` 로 간주한다
- 같은 `item_id` 중복 수집 방지와 실패/중단 상태 복원의 기준으로 사용한다

### `cache/analysis-jobs/*.json`

- 계획별 백그라운드 분석 상태 캐시
- `status`, `requested_at`, `started_at`, `finished_at`, `output_path`, `error` 저장
- `trips/*.yaml` 원본과 분리해 저장하고 UI는 상태 조회 API로 읽는다
- 같은 `trip_id` 가 `queued` 또는 `running` 이면 중복 분석 시작을 막는 기준으로 사용한다

### `.camping-backups/<timestamp>/backup.json`

- 백업 생성 시각
- 백업 생성 이유
- 원본 `.camping-data/` 경로

### `.camping-backups/<timestamp>/data/**`

- 특정 시점의 `.camping-data/` 전체 스냅샷
- 복원 기준 데이터

## 6. 도메인 규칙

- 개인 준비물은 사용자가 직접 입력하는 인벤토리가 아니다
- 사람과 차량은 기준 데이터로 미리 관리하고 계획에서는 선택만 한다
- 장비 카테고리 코드는 영어 기반 식별값으로 유지하고, 사용자가 보는 이름은 `categories.yaml` 에서 관리한다
- 히스토리는 계획 완료 후 별도 파일로 생성하고, 아카이브가 끝나면 원래 계획 파일은 `trips/` 에서 제거한다
- 히스토리의 사람/차량 스냅샷은 이후 기준 데이터가 바뀌어도 당시 기록으로 유지한다
- 링크는 외부 API 캐시가 아니라 사용자가 관리하는 북마크 데이터다
- 반복 장비 메타데이터는 사용자가 직접 입력하는 원본 장비 목록이 아니라 AI가 웹 검색으로 수집한 보강 정보다
- 반복 장비 메타데이터 작업 상태는 원본 장비 YAML에 저장하지 않고 별도 상태 파일로 분리한다
- `trip_id` 는 계획, 히스토리, 결과 Markdown 참조를 보호하기 위해 재사용하지 않는다
- 분석 상태는 계획 원본 YAML에 저장하지 않고 별도 캐시 파일로 분리한다
- API 서버가 재시작되면 남아 있던 `queued` 또는 `running` 상태는 `interrupted` 로 전환한다
- 백업 스냅샷은 운영 데이터와 분리된 별도 경로에 누적 저장한다
