# 데이터 모델

## 1. 문서 목적

이 문서는 `./.camping-data/` 에 저장하는 로컬 운영 데이터의 구조를 정의한다.

## 2. 핵심 원칙

### 원칙 1. 원본 입력과 AI 추천 결과를 분리한다

- 사용자가 입력하는 것: 장비, 계획, 동행자, 링크, 취향
- AI가 만드는 것: 개인 준비물, 장비 추천, 체크리스트, 여정 제안

### 원칙 2. 사람이 관리하는 데이터는 YAML로 둔다

- 장비
- 계획
- 히스토리
- 링크

### 원칙 3. 결과 문서는 Markdown으로 둔다

- 분석 결과는 `outputs/*.md`

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
├── history/
├── outputs/
├── links.yaml
└── cache/
```

## 4. 데이터 분류

### 4.1 사용자 원본 데이터

- `profile.yaml`
- `companions.yaml`
- `equipment/*.yaml`
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

### 4.3 외부 캐시 데이터

- 날씨 캐시
- 장소 캐시

저장 위치:

- `cache/weather/*.json`
- `cache/places/*.json`

## 5. 파일별 역할

### `equipment/durable.yaml`

- 반복 사용 장비
- 카테고리와 수량 관리

### `equipment/consumables.yaml`

- 소모품 재고
- 부족 상태 관리

### `equipment/precheck.yaml`

- 출발 전 점검 항목
- 상태와 마지막 점검 메모

### `companions.yaml`

- 동행자 프로필 원본 데이터
- 계획 화면에서 참조하는 `companion_ids` 의 기준 목록
- 이름, 연령대, 건강 특이사항, 복용약, 민감도 정보를 저장

### `trips/*.yaml`

- 앞으로 갈 캠핑 계획
- 분석 단위

### `history/*.yaml`

- 완료된 캠핑 기록
- 계획 스냅샷, 결과 문서 경로, 메모 보관

### `links.yaml`

- 날씨, 장소, 맛집, 장보기 링크 북마크

## 6. 도메인 규칙

- 개인 준비물은 사용자가 직접 입력하는 인벤토리가 아니다
- 히스토리는 계획 완료 후 별도 파일로 생성하고, 아카이브가 끝나면 원래 계획 파일은 `trips/` 에서 제거한다
- 링크는 외부 API 캐시가 아니라 사용자가 관리하는 북마크 데이터다
- `trip_id` 는 계획, 히스토리, 결과 Markdown 참조를 보호하기 위해 재사용하지 않는다
