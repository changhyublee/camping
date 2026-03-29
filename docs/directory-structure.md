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

## 7. `apps/web/src/` 구조

```text
apps/web/src/
├── App.tsx
├── main.tsx
├── app/
│   ├── AppShell.tsx
│   ├── navigation.ts
│   └── useAppViewModel.tsx
├── pages/
│   ├── DashboardPage.tsx
│   ├── PlanningPage.tsx
│   ├── HistoryPage.tsx
│   ├── CompanionsPage.tsx
│   ├── VehiclesPage.tsx
│   ├── EquipmentPage.tsx
│   ├── LinksPage.tsx
│   ├── CategoriesPage.tsx
│   ├── HelpPage.tsx
│   └── PageHost.tsx
├── components/
├── api/
└── styles/
```

- `App.tsx`: 앱 진입점
- `app/AppShell.tsx`: 메뉴, 경로 동기화, 전역 배너와 오버레이 조합
- `app/navigation.ts`: 페이지 키, 라벨, 경로, 네비게이션 그룹 메타데이터
- `app/useAppViewModel.tsx`: 현재 웹 상태 조합과 페이지 렌더용 view model
- `pages/*Page.tsx`: 메뉴별 page entry
- `pages/PageHost.tsx`: 현재 page entry가 공통 조합을 위임하는 host
- `components/`: 재사용 표시 컴포넌트
- `api/`: 로컬 API 클라이언트
