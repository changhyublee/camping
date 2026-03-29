# 디렉토리 구조

## 1. 문서 목적

이 문서는 현재 저장소와 로컬 운영 데이터의 경로 책임을 정의한다.

## 2. 최상위 구조

```text
.
├── README.md
├── docs/
├── apps/
├── prompts/
├── schemas/
├── scripts/
├── skills/
├── shared/
├── .camping-backups/
└── .camping-data/
```

## 3. 주요 디렉토리 책임

- `docs/`
  - 설계 문서, 예시 파일
- `apps/web/`
  - 메뉴형 로컬 UI
- `apps/api/`
  - 로컬 API 서버
- `prompts/`
  - 분석 실행과 회고 기반 학습에 사용하는 프롬프트 파일
- `schemas/`
  - Codex CLI 분석/학습 출력 JSON 스키마
- `scripts/`
  - 시드와 보조 자동화 스크립트
- `shared/`
  - 공통 타입과 스키마
- `skills/`
  - 현재 저장소에서 재사용하는 로컬 Codex skill 패키지
- `.camping-backups/`
  - 로컬 운영 데이터 스냅샷 백업
- `.camping-data/`
  - 실제 운영 데이터

## 4. `.camping-backups/` 내부 구조

```text
.camping-backups/
└── <timestamp>/
    ├── backup.json
    └── data/
        └── ...
```

- `<timestamp>`: 백업 생성 시각 기반 디렉토리
- `backup.json`: 백업 생성 시각, 이유, 원본 경로 메타데이터
- `data/`: 당시의 `.camping-data/` 스냅샷

## 5. `.camping-data/` 내부 구조

```text
.camping-data/
├── profile.yaml
├── companions.yaml
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
    ├── analysis-results/
    ├── equipment-metadata/
    │   ├── durable/
    │   └── jobs/
    │       └── durable/
    ├── history-learning/
    ├── user-learning/
    │   ├── jobs/
    │   │   └── profile.json
    │   └── profile.json
    ├── weather/
    ├── places/
    └── campsite-tips/
```

## 6. 경로별 책임

- `trips/`: 예정된 캠핑 계획
- `history/`: 완료된 캠핑 히스토리
- `outputs/`: 분석 결과 Markdown
- `cache/analysis-jobs/`: 계획별 백그라운드 분석 상태 JSON
- `cache/analysis-results/`: 계획별 섹션 누적 결과 JSON
- `cache/history-learning/`: 히스토리별 AI 회고 분석 결과 JSON
- `cache/user-learning/profile.json`: 전역 개인화 학습 프로필 JSON
- `cache/user-learning/jobs/profile.json`: 전역 개인화 학습 작업 상태 JSON
- `links.yaml`: 사용자 북마크 링크
- `equipment/categories.yaml`: 장비 섹션별 카테고리 코드와 표시 이름
- `.camping-backups/<timestamp>/`: 특정 시점의 로컬 운영 데이터 백업 스냅샷
