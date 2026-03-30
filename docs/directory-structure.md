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
│   ├── browser-helpers.ts
│   ├── common-formatters.ts
│   ├── effects/
│   │   ├── useEquipmentStateEffects.ts
│   │   ├── useHistoryStateEffects.ts
│   │   └── useUiStateEffects.ts
│   ├── equipment-category-helpers.ts
│   ├── equipment-metadata-helpers.ts
│   ├── equipment-view-helpers.ts
│   ├── navigation.ts
│   ├── planning-history-helpers.ts
│   ├── state/
│   │   ├── useEquipmentState.ts
│   │   ├── useHistoryState.ts
│   │   ├── usePlanningState.ts
│   │   ├── useReferenceDataState.ts
│   │   └── useUiShellState.ts
│   ├── tab-helpers.ts
│   ├── ui-state.ts
│   ├── view-model-drafts.ts
│   ├── view-model-types.ts
│   └── useAppViewModel.tsx
├── features/
│   ├── categories/
│   ├── companions/
│   │   └── actions.ts
│   ├── dashboard/
│   ├── equipment/
│   ├── help/
│   ├── history/
│   │   └── actions.ts
│   ├── links/
│   │   └── actions.ts
│   ├── planning/
│   ├── shared/
│   └── vehicles/
│       └── actions.ts
├── pages/
│   ├── DashboardPage.tsx
│   ├── PlanningPage.tsx
│   ├── HistoryPage.tsx
│   ├── CompanionsPage.tsx
│   ├── VehiclesPage.tsx
│   ├── EquipmentPage.tsx
│   ├── LinksPage.tsx
│   ├── CategoriesPage.tsx
│   └── HelpPage.tsx
├── components/
├── api/
├── styles/
│   ├── app.css
│   ├── index.css
│   ├── responsive.css
│   └── tokens.css
└── test/
    ├── app-test-helpers.tsx
    ├── mock-state.ts
    └── setup.ts
```

- `App.tsx`: 앱 진입점
- `app/AppShell.tsx`: 메뉴, 경로 동기화, 전역 배너와 오버레이 조합
- `app/browser-helpers.ts`: 브라우저 상호작용처럼 `window` 의존이 있는 작은 helper
- `app/common-formatters.ts`: 문자열/날짜/에러 메시지 같은 공통 변환 helper
- `app/effects/*`: 세션 복원, body lock, 선택 대상 reset, 장비 표시 상태 동기화 같은 side effect 전용 hook
- `app/equipment-*.ts`: 장비 카테고리/메타데이터 관련 순수 helper
- `app/navigation.ts`: 페이지 키, 라벨, 경로, 네비게이션 그룹 메타데이터
- `app/planning-history-helpers.ts`: 계획/히스토리 선택, 차량/분석 상태 helper
- `app/state/*`: 도메인별 `useState`/`useRef` 묶음과 state hook 경계
- `app/tab-helpers.ts`: 탭/세그먼트 접근성 helper와 focus 이동 규칙
- `app/ui-state.ts`: 페이지 탭 메타데이터와 `sessionStorage` 기반 UI 복원 규칙
- `app/view-model-drafts.ts`: draft 기본값과 저장용 변환 helper
- `app/view-model-types.ts`: view model 과 feature 사이에서 공유하는 드래프트/맵 타입
- `app/useAppViewModel.tsx`: state hook, helper, feature panel 을 조합하는 view model adapter
- `features/*/*PageContent.tsx`: page intro, page tab, 상세 panel 조합을 맡는 page-local content
- `features/*/*Panel*.tsx`: 계획/히스토리/장비처럼 길어지는 detail panel 분리 파일
- `features/*/actions.ts`: 동행자, 차량, 링크, 히스토리처럼 도메인별 CRUD 핸들러를 view model 밖으로 뺀 action 모듈
- `features/`: 도메인별 화면 조각과 helper
- `pages/*Page.tsx`: 메뉴별 route entry
- `components/`: 재사용 표시 컴포넌트
- `api/`: 로컬 API 클라이언트
- `styles/index.css`: 웹 스타일 entry
- `styles/tokens.css`: 색상, 폰트, base reset 같은 전역 토큰
- `styles/responsive.css`: 반응형 media query 전용 파일
- `test/app-test-helpers.tsx`: 브라우저 상호작용과 fetch/EventSource mock helper
- `test/mock-state.ts`: 기본 mock 상태와 타입 정의
