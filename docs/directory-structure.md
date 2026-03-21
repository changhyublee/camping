# 디렉토리 구조

## 1. 문서 목적

이 문서는 프로젝트 디렉토리 구조와 각 경로의 책임을 정의한다.

목표는 다음과 같다.

- 코드, 문서, 예시, 로컬 운영 데이터를 분리
- 로컬 웹 UI와 로컬 API가 읽어야 할 파일 위치를 명확히 함
- v1 구현 시 파일 배치를 흔들리지 않게 고정

## 2. 최상위 구조

권장 구조:

```text
.
├── README.md
├── docs/
├── apps/
├── prompts/
├── schemas/
├── scripts/
├── shared/
└── .camping-data/
```

## 3. 디렉토리별 책임

### `/`

- 저장소 루트
- 프로젝트 소개와 주요 진입점 위치

포함:

- `README.md`
- `docs/`
- `apps/`
- `prompts/`
- `schemas/`
- `scripts/`
- `shared/`

### `docs/`

- 프로젝트 설계 문서
- 예시 파일
- 구현 범위 문서

포함 예:

- 요구사항 문서
- 아키텍처 문서
- 전환 계획 문서
- 로컬 API 계약 문서
- UI 흐름 문서
- 데이터 모델 문서
- 워크플로우 문서
- 프롬프트 설계 문서
- 예시 YAML/Markdown

### `apps/web/`

- 로컬 브라우저 UI
- 사용자 입력, 실행, 결과 표시를 담당

권장 하위 구조:

```text
apps/web/
├── src/
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   ├── api/
│   └── styles/
└── public/
```

### `apps/api/`

- 로컬 API 서버
- 파일 읽기, 입력 검증, AI 백엔드 호출, 결과 저장을 담당

권장 하위 구조:

```text
apps/api/
├── src/
│   ├── routes/
│   ├── services/
│   ├── prompts/
│   ├── validators/
│   └── file-store/
└── tests/
```

### `shared/`

- 프론트엔드와 API가 공통으로 쓰는 타입/상수/유틸

권장 파일:

```text
shared/
├── types/
├── constants/
└── utils/
```

### `prompts/`

- OpenAI 분석용 프롬프트 소스

권장 파일:

```text
prompts/
├── system.md
├── trip-analysis.md
└── output-format.md
```

### `schemas/`

- YAML/JSON 데이터 구조 검증 스키마

권장 파일:

```text
schemas/
├── profile.schema.json
├── companions.schema.json
├── equipment-durable.schema.json
├── equipment-consumables.schema.json
├── equipment-precheck.schema.json
├── preferences-travel.schema.json
├── preferences-food.schema.json
└── trip-request.schema.json
```

### `scripts/`

- 로컬 보조 스크립트
- 반복 작업 자동화

권장 파일:

```text
scripts/
├── analyze-trip.(ts|js)
├── validate-data.(ts|js)
├── create-trip-template.(ts|js)
└── export-backup.(ts|js)
```

### `.camping-data/`

- 실제 운영 데이터 저장소
- Git 추적 대상이 아닌 로컬 사용자 데이터

주의:

- `.gitignore` 에 반드시 포함

## 4. `.camping-data/` 내부 구조

```text
.camping-data/
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
│   └── <trip-id>.yaml
├── outputs/
│   └── <trip-id>-plan.md
└── cache/
    ├── weather/
    └── places/
```

## 5. 경로별 책임

### `.camping-data/profile.yaml`

- 사용자 기본 설정
- 기본 출발지
- 기본 차량
- 단위 설정

### `.camping-data/companions.yaml`

- 동행자 목록
- 연령대
- 건강 특이사항
- 복용약

### `.camping-data/equipment/`

- 공용 장비 정보
- 소모품 재고
- 출발 전 점검 항목

### `.camping-data/preferences/`

- 이동 취향
- 음식/요리 취향

### `.camping-data/trips/`

- 분석 단위가 되는 요청 파일

### `.camping-data/outputs/`

- 결과 Markdown

### `.camping-data/cache/`

- 외부 조회 결과 또는 수동 수집 데이터

## 6. `docs/examples/` 의 역할

`docs/examples/` 는 운영 데이터가 아니라 문서용 예시 세트다.

용도:

- 샘플 입력 구조 제시
- 초기 세팅 참고
- 테스트용 템플릿 초안

중요:

- 실제 실행 데이터는 `.camping-data/`
- 문서 예시는 `docs/examples/`

## 7. `.gitignore` 권장 항목

프로젝트 세팅 시 아래 경로는 Git 추적에서 제외하는 것을 권장한다.

```gitignore
.camping-data/
.env
.env.local
.env.*.local
node_modules/
dist/
.DS_Store
```

## 8. 파일 네이밍 규칙

### trip 파일

권장 패턴:

```text
YYYY-MM-DD-region.yaml
```

예:

```text
2026-04-18-gapyeong.yaml
2026-07-25-gangneung.yaml
```

### output 파일

권장 패턴:

```text
YYYY-MM-DD-region-plan.md
```

예:

```text
2026-04-18-gapyeong-plan.md
```

## 9. v1에서 꼭 필요한 최소 구조

v1 최소 구조는 아래만 있어도 된다.

```text
.
├── README.md
├── docs/
├── apps/
│   ├── web/
│   └── api/
├── prompts/
├── .camping-data/
│   ├── profile.yaml
│   ├── companions.yaml
│   ├── equipment/
│   ├── preferences/
│   ├── trips/
│   └── outputs/
```

즉, `schemas/`, `scripts/`, `shared/` 는 초기에 비어 있어도 된다.

## 10. 현재 결정 사항

- 운영 데이터는 `.camping-data/` 에 둔다
- 문서 예시는 `docs/examples/` 에 둔다
- 결과 파일은 Markdown으로 저장한다
- trip 파일이 분석 실행의 기준 경로다
- 로컬 웹 UI는 `apps/web/`, 로컬 API는 `apps/api/` 를 기본 경로로 한다
