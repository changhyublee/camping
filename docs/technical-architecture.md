# 기술 아키텍처

## 1. 문서 목적

이 문서는 현재 프로젝트를 `운영형 로컬 캠핑 관리자` 로 구현하기 위한 기술 방향을 정리한다.

## 2. 핵심 전제

- 원격 서버 없이 로컬 우선 구조를 유지한다
- 브라우저 UI는 로컬 API만 호출한다
- 실제 운영 데이터는 `./.camping-data/` 에 저장한다
- 운영 데이터 백업은 `./.camping-backups/` 에 시점별 스냅샷으로 저장한다
- 동행자, 차량, 장비, 계획, 히스토리, 링크는 YAML로 저장한다
- 분석 결과는 Markdown으로 저장한다
- 분석 실행 상태는 `cache/analysis-jobs/*.json` 으로 분리해 저장한다
- 섹션별 분석 fragment 는 `cache/analysis-results/*.json` 으로 분리해 저장한다
- 반복 장비 메타데이터 수집 상태는 `cache/equipment-metadata/jobs/durable/*.json` 으로 분리해 저장한다
- 히스토리 회고 원문은 `history/*.yaml` 안에 append-only 로 저장한다
- 히스토리별 학습 결과는 `cache/history-learning/*.json` 으로 분리해 저장한다
- 전역 개인화 학습 프로필과 작업 상태는 `cache/user-learning/` 아래 JSON으로 분리해 저장한다
- 기본 분석 백엔드는 로컬 `codex exec` 이다
- 반복 장비 메타데이터처럼 AI가 수집한 보강 정보는 `cache/` 아래 별도 파일로 저장하고 API에서 병합한다
- 개인화 학습 결과도 사람이 관리하는 `profile.yaml`, `preferences/*.yaml` 와 분리해 cache 로만 저장한다

## 3. 권장 구조

```text
브라우저 UI
  -> 로컬 API
    -> SSE 이벤트 채널로 분석/메타데이터/개인화 학습 상태 push
    -> .camping-data/ YAML 읽기/쓰기
    -> .camping-backups/ 시점별 백업 생성
    -> docs/, prompts/, schemas/ 참조
    -> analyze-trip 요청은 작업 상태를 queued/running 으로 저장하고 즉시 응답
    -> durable metadata refresh 요청도 작업 상태를 queued/running 으로 저장하고 즉시 응답
    -> history retrospective 저장 후 user learning rebuild 요청도 queued/running 으로 저장하고 즉시 응답
    -> 로컬 codex CLI 또는 fallback AI 백엔드를 백그라운드에서 호출
    -> outputs/*.md 저장
    -> cache/analysis-jobs/*.json 상태 갱신
    -> cache/analysis-results/*.json fragment 저장
    -> cache/equipment-metadata/durable/*.json 저장
    -> cache/equipment-metadata/jobs/durable/*.json 상태 갱신
    -> cache/history-learning/*.json 저장
    -> cache/user-learning/profile.json 저장
    -> cache/user-learning/jobs/profile.json 상태 갱신
```

## 4. 상위 역할 분리

- `apps/web`
  - 대시보드
  - 사람 관리
  - 차량 관리
  - 장비 관리
  - 카테고리 설정
  - 보조 설명
  - 캠핑 계획 편집/분석
  - 히스토리 관리와 회고/학습 결과 표시
  - 외부 링크 관리
- `apps/api`
  - CRUD 요청 검증
  - YAML 파일 읽기/쓰기
  - 동행자 CRUD
  - 차량 CRUD
  - 장비 카테고리 CRUD
  - 계획 아카이브
  - 분석 실행
  - 회고 기반 개인화 학습 실행
  - AI 보조 응답 생성
- `.camping-data`
  - 운영 데이터 저장
- `.camping-backups`
  - 운영 데이터 백업 스냅샷 저장

## 4.1 웹 프런트엔드 계층 규칙

- 웹 UI 상위 구조는 `App.tsx -> app/AppShell.tsx -> pages/*Page.tsx` 순서로 유지한다.
- `App.tsx` 는 앱 셸 진입점만 담당하고, 도메인 상태/비동기 호출/폼 상세 렌더링을 직접 넣지 않는다.
- `app/AppShell.tsx` 는 메뉴, 경로 동기화, 전역 배너와 레이어 같은 셸 조합만 담당한다.
- `app/ui-state.ts` 는 페이지 탭 메타데이터와 `sessionStorage` 기반 UI 복원 규칙만 담당한다.
- `app/state/*` 는 `planning`, `equipment`, `history`, `reference-data`, `ui-shell` 처럼 도메인별 state hook 경계만 담당한다.
- `app/effects/*` 는 state 간 연쇄 반응, 선택 대상 reset, body lock, 세션 복원 저장처럼 side effect 전용 hook만 담당한다.
- 새 `useState` / `useRef` 묶음은 기본적으로 `app/state/*` 나 feature-local hook으로 분리하고, `useAppViewModel.tsx` 에 직접 누적하지 않는다.
- `app/common-formatters.ts`, `app/view-model-drafts.ts`, `app/planning-history-helpers.ts`, `app/equipment-*-helpers.ts` 는 view model 밖으로 뺀 순수 helper 모듈만 담당한다.
- `app/browser-helpers.ts` 는 `window.confirm` 같은 작은 브라우저 상호작용 helper만 담당한다.
- `app/tab-helpers.ts` 와 `app/view-model-types.ts` 는 도메인 공통 UI helper 와 shared type 경계만 담당한다.
- 동행자, 차량, 링크, 히스토리 같은 CRUD 핸들러는 `features/*/actions.ts` 처럼 도메인 action 모듈로 분리하고, `useAppViewModel.tsx` 에서 직접 긴 async handler 본문을 유지하지 않는다.
- `pages/*Page.tsx` 는 각 메뉴의 route entry 역할만 맡고, 실제 page intro, page tab, 상세 panel 조합은 `features/*/*PageContent.tsx` 나 하위 panel component로 위임한다.
- `features/*` 는 장비, 히스토리, 계획, 공통 UI처럼 여러 화면에서 재사용하거나 page 안에서 길어지는 panel/component 를 도메인 단위로 분리하는 위치다.
- 페이지 안에서 `목록`, `편집`, `결과`, `보조 작업` 처럼 목적이 다른 major section 이 3개 이상 생기면 별도 컴포넌트나 훅으로 분리한다.
- 비동기 호출은 앱 셸이 아니라 해당 도메인 주변 모듈에서 격리하고, `App.tsx` 와 `AppShell.tsx` 에서 직접 `apiClient` 를 호출하지 않는다.
- `useAppViewModel.tsx` 는 state hook, helper, feature panel을 조합하는 adapter로만 두고, 새 도메인 섹션이나 탭/세션 구현을 여기에 직접 추가하지 않는다.
- 전역 shell state가 아닌 새 draft, 선택 상태, reset version, request ref는 기본적으로 `app/state/*` 나 feature-local hook으로 먼저 배치한다.
- 구조 가드는 테스트로 유지한다. `App.tsx` 는 얇은 진입점 크기를 넘기지 않고, page 엔트리도 직접 API 호출을 하지 않도록 검증한다.
- `app/*.ts` 상위 모듈도 예외 없이 라인 수 가드를 둬서, 탭 메타데이터나 경로 규칙 같은 공통 모듈이 다시 거대한 단일 파일이 되지 않도록 유지한다.
- `app/effects/*.ts` 도 라인 수 가드를 둬서, 여러 도메인의 side effect 를 다시 하나의 거대한 `useEffect` 묶음으로 되돌리지 않도록 유지한다.
- `app/state/*.ts` 도 라인 수 가드를 둬서, state hook 하나가 다시 거대한 단일 store 역할을 하지 않도록 유지한다.
- `features/*` 파일도 라인 수 가드를 둬서, 새 feature component 가 다시 거대한 단일 파일로 커지지 않도록 유지한다.
- 테스트도 같은 원칙을 따른다. `App.test.tsx` 는 브라우저 시나리오 본문만 유지하고, fetch/EventSource mock 과 기본 상태 팩토리는 `src/test/` 아래 helper 모듈로 분리한다.
- PR에서 `PageHost` 같은 공통 page host를 다시 도입해 여러 화면 JSX를 한 파일로 되돌리는 변경은 구조 원칙 위반으로 본다.

## 5. 로컬 저장 구조

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
    ├── analysis-results/
    ├── campsite-tips/
    ├── history-learning/
    ├── places/
    ├── user-learning/
    │   ├── jobs/
    │   │   └── profile.json
    │   └── profile.json
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

## 6. 메뉴별 기술 책임

### 대시보드

- 여러 API 응답을 조합해 현황을 계산한다
- 별도 저장 데이터는 만들지 않는다

### 사람 관리

- `companions.yaml` 에 직접 CRUD 한다
- 이름, 연령대, 건강 특이사항, 복용약, 민감도를 기준 데이터로 관리한다

### 차량 관리

- `vehicles.yaml` 에 직접 CRUD 한다
- 표시 이름, 설명, 탑승 인원, 적재량, 메모를 기준 데이터로 관리한다

### 장비 관리

- `equipment/*.yaml` 에 직접 CRUD 한다
- 반복 장비, 소모품, 점검 항목을 분리한다
- 카테고리는 자유 입력이 아니라 `equipment/categories.yaml` 기반 셀렉트로 선택한다
- 기존 장비에만 남아 있는 카테고리 값도 화면에서 깨지지 않도록 병합해 표시한다
- 반복 장비 메타데이터 수집은 별도 `EquipmentMetadataJobManager` 가 담당한다
- 서로 다른 durable item 은 최대 3건까지 병렬 수집하고, 같은 `item_id` 는 중복 실행하지 않는다
- 성공 완료는 메타데이터 결과만 남기고 상태 파일은 삭제해 `idle` 로 복귀한다
- 실패 또는 중단 상태는 상태 파일에 남겨 두고 UI가 SSE와 상태 조회 API로 버튼과 배지를 복원한다
- 수집 중 검색 입력이 바뀌면 이전 시도 결과는 저장하지 않고 최신 입력 기준으로 다시 수집한다

### 카테고리 설정

- `equipment/categories.yaml` 에 섹션별 카테고리 코드와 표시 이름을 저장한다
- 반복 장비, 소모품, 출발 전 점검 섹션별 카테고리를 추가/수정/삭제한다
- 이미 사용 중인 카테고리와 마지막 남은 카테고리는 삭제를 막는다
- 같은 화면에서 로컬 데이터 백업을 실행한다

### 보조 설명

- 작업 파일 경로와 생성 규칙 같은 읽기 전용 설명성 정보를 모아 보여준다
- 운영 흐름을 방해하지 않도록 별도 메뉴로 격리한다

### 캠핑 계획

- `trips/*.yaml` 를 CRUD 한다
- `companions.yaml`, `vehicles.yaml` 을 참조해 선택형 입력을 제공한다
- 계획에는 선택한 사람 ID와 차량 스냅샷을 함께 저장한다
- AI 보조는 제안을 반환하지만 자동 저장하지 않는다
- 분석 결과 저장은 `outputs/*.md` 로 분리한다
- 분석 상태는 `cache/analysis-jobs/<trip-id>.json` 에 저장한다
- 섹션별 결과는 `cache/analysis-results/<trip-id>.json` 에 누적 저장한다
- 전역 개인화 학습 프로필은 `loadTripBundle()` 단계에서 함께 읽어 분석 프롬프트와 AI 보조에 자동 포함한다
- UI는 `GET /api/ai-jobs/events` SSE를 pending 작업이 있을 때만 실시간 채널로 열고, 재진입/재연결 시 상태 조회 API로 다시 맞춘다
- 같은 `trip_id` 안에서는 섹션 job 을 순차 실행하고, 이미 `queued` 또는 `running` 인 섹션은 중복 실행하지 않는다
- 분석 중에는 계획 삭제와 히스토리 아카이브를 막는다
- API 서버가 재시작되면 남아 있던 `queued` 또는 `running` 상태는 `interrupted` 로 전환한다

초기 로딩 원칙:

- `companions`, `vehicles`, `categories` 조회 실패는 경고로 격리하고 다른 메뉴 데이터 로딩은 계속 진행한다

### 캠핑 히스토리

- 계획 완료 시 `history/*.yaml` 로 아카이브한다
- 히스토리는 계획과 다른 파일 단위로 관리한다
- 아카이브 시점의 동행자/차량 스냅샷을 기록에 고정한다
- 사용자가 남긴 회고 엔트리는 `retrospectives` 배열에 append-only 로 누적한다
- 히스토리별 회고 분석 결과는 `cache/history-learning/<history-id>.json` 으로 저장한다
- 모든 히스토리 학습 결과를 합산한 전역 개인화 학습 프로필은 `cache/user-learning/profile.json` 으로 저장한다
- 개인화 학습 상태는 SSE와 상태 조회 API를 함께 사용해 UI에 복원한다

### 외부 링크

- `links.yaml` 하나로 관리한다
- 외부 API 연동이 아니라 사용자 북마크 CRUD 를 우선한다

### 로컬 데이터 백업

- 서버 시작 시 현재 `.camping-data/` 가 있으면 `.camping-backups/<timestamp>/` 아래에 자동 백업을 만든다
- 수동 백업도 같은 구조의 시점별 스냅샷으로 누적 저장한다
- 백업 경로는 운영 데이터 경로와 분리해 `seed` 같은 초기화 작업이 백업까지 지우지 않도록 한다

## 7. OpenAI 연동 원칙

- 브라우저에서 직접 OpenAI API를 호출하지 않는다
- 로컬 API가 `codex login` 세션 또는 `OPENAI_API_KEY` 를 사용한다
- 계획 보조와 분석 실행 모두 서버를 통해서만 모델을 호출한다
- 모델이 응답하지 못해도 UI CRUD 자체는 계속 동작해야 한다
