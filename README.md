# camping

로컬 웹 UI와 로컬 파일을 기반으로 캠핑 준비와 운영 기록을 관리하는 프로젝트입니다.

이 프로젝트는 사용자가 저장한 장비, 동행자, 취향, 캠핑 계획을 바탕으로 이번 캠핑에 필요한 장비와 개인 준비물을 분석하고, 계획이 끝난 뒤에는 히스토리로 아카이브하며, 날씨/장소/맛집 링크까지 한곳에서 관리하는 것을 목표로 합니다.

캠핑이 끝난 뒤에는 히스토리 상세에 후기와 회고를 누적해서 남길 수 있고, AI가 해당 회고를 분석해 `이번 캠핑에서 배운 점` 과 전역 `개인화 학습 프로필` 을 계속 갱신합니다. 이렇게 누적된 학습 결과는 이후 계획 분석과 AI 보조에 자동으로 반영되어, 후기를 많이 남길수록 사용자에게 더 맞는 추천이 나오도록 설계합니다.

초기 구조는 계속 `로컬 우선` 을 유지합니다. 브라우저 UI는 로컬 API를 호출하고, 로컬 API가 `.camping-data/` 의 YAML 데이터와 문서/프롬프트를 조합해 기본적으로 로컬 `codex CLI` 에 분석을 요청합니다. 필요하면 OpenAI Responses API를 fallback 백엔드로 사용할 수 있습니다.

## 핵심 방향

- 원격 서버 없이 시작하는 로컬 우선 구조
- 운영 데이터는 `./.camping-data/` 에 저장
- 브라우저 UI + 로컬 API + 로컬 Codex CLI 구조
- GitHub는 코드와 문서 저장소로만 사용
- 사람이 관리하는 데이터는 YAML, 결과는 Markdown으로 저장

## 현재 메뉴 구조

- `운영 허브`
  - `대시보드`: 예정 계획, 최근 히스토리, 재고/점검 경고, 외부 링크 현황
  - `캠핑 계획`: 날짜/장소/동행자/차량/조건 편집, 등록된 사람/차량 선택, AI 보조, 백그라운드 분석 실행, 누적 학습 요약 확인, 상태 표시, 결과 자동 저장
  - `캠핑 히스토리`: 완료된 계획 아카이브, 저장된 결과 Markdown 다시 열기, 당시 동행자/차량 스냅샷과 메모 확인, 후기/회고 추가, 이번 캠핑 학습 요약과 전역 개인화 학습 확인, 히스토리 삭제
- `준비 데이터`
  - `사람 관리`: 캠핑 인원 프로필, 건강 특이사항, 복용약, 민감도 관리
  - `차량 관리`: 자주 쓰는 차량, 탑승 인원, 적재량, 메모 관리
  - `장비 관리`: 반복 장비, 소모품, 출발 전 점검 항목 CRUD, 장비 섹션별 카테고리 셀렉트 기반 관리, 반복 장비 메타데이터 백그라운드 수집 상태 표시
  - `외부 링크`: 날씨, 장소, 맛집, 장보기 등 참고 링크 CRUD, 카테고리별 그룹 목록
- `관리 설정`
  - `카테고리 설정`: 장비 섹션별 카테고리 추가/수정/삭제, 표시 이름 관리, 수동 백업 실행
  - `보조 설명`: 주 작업 파일, 결과 Markdown, 히스토리 파일, 생성 규칙 안내

## 현재 구현 상태

현재 저장소에는 아래 운영형 로컬 관리 MVP가 포함되어 있습니다.

- `apps/api/`
  - `GET /api/health`
  - companions CRUD
  - vehicles CRUD
  - trip CRUD + 검증 + 날씨 수동/백그라운드 자동 수집 + 백그라운드 분석 + pending 작업 시 SSE 실시간 상태 반영 + 결과 저장
  - 저장된 결과 Markdown 조회
  - equipment CRUD + 반복 장비 메타데이터 백그라운드 수집/재수집 + pending 작업 시 SSE 실시간 상태 반영
  - equipment category CRUD
  - history 조회/수정/삭제 + trip 아카이브 + 동행자/차량 스냅샷 저장
  - history 회고 append 저장 + history learning 조회 + user learning 조회
  - 회고 기반 개인화 학습 백그라운드 갱신 + pending 작업 시 SSE 실시간 상태 반영
  - links CRUD
  - planning assistant 응답
- `apps/web/`
  - 대시보드
  - 사람 관리
  - 차량 관리
  - 장비 관리
  - 캠핑 계획 편집/분석 + 등록된 사람/차량 선택
  - 히스토리 관리 + 결과 다시 열기 + 당시 동행자/차량 요약 확인
  - 히스토리 후기/회고 입력, 회고 누적 목록, 캠핑별 학습 요약, 전역 개인화 학습 요약
  - 외부 링크 카테고리 그룹 관리
  - 카테고리 설정 / 보조 설명
  - `App.tsx` 는 `AppShell` 진입점만 담당하고, 메뉴/경로 동기화는 `src/app/`, 화면 엔트리는 `src/pages/` 로 분리
- `shared/`
  - 공통 타입
  - Zod 기반 요청/응답 스키마
  - 공통 상수와 유틸
- `prompts/`
  - `system.md`
  - `trip-analysis.md`
  - `history-retrospective-learning.md`
  - `user-learning-profile.md`
- `schemas/`
  - `codex-trip-analysis-output.schema.json`
  - `codex-history-retrospective-learning-output.schema.json`
  - `codex-user-learning-profile-output.schema.json`
- `scripts/seed-local-data.ts`
  - 새 환경에서만 `docs/examples/` 를 `.camping-data/` 로 복사
  - `--replace` 사용 시 현재 `.camping-data/` 를 `.camping-backups/` 에 먼저 백업
  - `cache/weather`, `cache/places`, `cache/campsite-tips` 디렉토리 생성
- `scripts/backup-local-data.ts`
  - 현재 `.camping-data/` 상태를 `.camping-backups/<timestamp>/` 아래에 수동 백업
- `skills/`
  - 저장소 로컬 Codex skill 패키지
  - 현재 `repeat-review-fix` 스킬 포함

## 빠른 시작

사전 조건:

- Node.js 22 이상
- pnpm 10 이상
- `codex` CLI 설치 및 로그인

선택 설정:

- `cp .env.example .env` 를 하면 보조 웹 조사 관련 선택 키도 함께 복사됩니다. 이 키들은 주석 상태로 포함되어 있으니 필요할 때만 주석을 해제해 사용합니다.
- 기본 `codex-cli` 백엔드에서 장비 메타데이터 수집과 캠핑장 후기 tip 조사를 별도로 조정하려면 `.env` 에 `CODEX_METADATA_MODEL`, `CODEX_METADATA_REASONING_EFFORT` 를 설정할 수 있습니다.
- 이 보조 웹 조사 모델은 반복 장비 메타데이터와 캠핑장 후기 tip 조사에 공통으로 사용합니다.
- `openai` fallback 백엔드에서 같은 보조 웹 조사 모델을 별도로 조정하려면 `.env` 에 `OPENAI_METADATA_MODEL` 을 설정할 수 있습니다.
- 별도 설정이 없으면 보조 웹 조사는 `CODEX_METADATA_MODEL=gpt-5.4-mini`, `CODEX_METADATA_REASONING_EFFORT=low`, `OPENAI_METADATA_MODEL=gpt-5-mini` 기본값을 사용합니다.
- 계획 날씨 자동 수집은 Open-Meteo geocoding + forecast API를 직접 사용하며 별도 API key가 필요 없습니다.

실행 순서:

```bash
pnpm install
cp .env.example .env
codex login
# 새 환경에서 예시 데이터를 처음 채울 때만 실행
pnpm seed
pnpm dev:api
pnpm dev:web
```

한 번에 두 앱을 같이 띄우려면 아래 명령도 사용할 수 있습니다.

```bash
pnpm dev
```

기본 주소:

- web: `http://localhost:5173`
- api: `http://localhost:8787`

검증 명령:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 로컬 데이터 시드와 백업

`pnpm seed` 는 일반 운영 명령이 아니라 `새 저장소를 처음 실행할 때 예시 데이터를 채우는 초기화 명령` 입니다.

- 언제 해야 하나: 새로 clone 한 뒤 `.camping-data/` 가 아직 없을 때
- 왜 필요한가: 로컬 UI와 API를 바로 확인할 수 있도록 `docs/examples/` 내용을 운영 데이터 위치로 복사하기 위해
- 하면 안 되는 때: 이미 내가 입력한 장비, 동행자, 계획, 히스토리가 `.camping-data/` 에 들어 있는 상태

현재는 안전장치가 들어가 있어서 `.camping-data/` 가 이미 있으면 `pnpm seed` 가 그대로 중단됩니다.

- 예시 데이터로 정말 다시 초기화하고 싶으면 `pnpm seed -- --replace`
- 이 경우 현재 데이터는 먼저 `.camping-backups/<timestamp>/` 아래에 자동 백업됩니다.
- 수동 백업만 하고 싶으면 `pnpm backup:data`
- 로컬 API 서버를 시작할 때도 현재 `.camping-data/` 가 있으면 `.camping-backups/<timestamp>/` 아래에 자동 백업을 1회 생성합니다.

## 문서 시작점

- 문서 인덱스: [`docs/index.md`](docs/index.md)
- 메뉴 구조: [`docs/menu-structure.md`](docs/menu-structure.md)
- 요구사항: [`docs/requirements.md`](docs/requirements.md)
- 기술 아키텍처: [`docs/technical-architecture.md`](docs/technical-architecture.md)
- 로컬 UI 전환 계획: [`docs/local-ui-transition-plan.md`](docs/local-ui-transition-plan.md)
- 디자인 스펙: [`docs/design-spec.md`](docs/design-spec.md)
- 로컬 API 계약: [`docs/local-api-contract.md`](docs/local-api-contract.md)
- UI 흐름: [`docs/ui-flow.md`](docs/ui-flow.md)
- 데이터 모델: [`docs/data-model.md`](docs/data-model.md)
- 분석 워크플로우: [`docs/trip-analysis-workflow.md`](docs/trip-analysis-workflow.md)
- 현재 범위: [`docs/mvp-scope.md`](docs/mvp-scope.md)
- 예시 파일: [`docs/example-files.md`](docs/example-files.md)
- 로컬 스킬: [`docs/local-skills.md`](docs/local-skills.md)

## 웹 구조 규칙

- `apps/web/src/App.tsx` 는 앱 셸 진입점만 담당하고, 도메인 UI나 API 호출을 직접 넣지 않습니다.
- 상위 구조는 `App.tsx -> app/AppShell.tsx -> pages/*Page.tsx` 순서로 유지합니다.
- 실제 화면 조합은 `features/*/*PageContent.tsx` 와 하위 panel/component로 나누고, `pages/*Page.tsx` 는 route entry만 담당합니다.
- 새 화면 로직은 feature component, page-local panel, helper 모듈로 추가하고, `App.tsx` 나 공통 host 파일로 다시 되돌리지 않습니다.
- 페이지 안에서 major section 이 3개 이상 생기면 별도 컴포넌트로 분리하고, 비동기 호출은 상위 셸이 아니라 해당 페이지 주변의 훅이나 모듈로 격리합니다.
- `app/effects/*` 는 세션 복원, body lock, 선택 대상 reset 같은 side effect 전용 hook만 담당합니다.
- 계획/장비를 포함한 도메인별 CRUD·AI 핸들러는 `features/*/actions.ts` 로 분리하고, `useAppViewModel.tsx` 에 긴 async handler 본문을 직접 쌓지 않습니다.
- 테스트는 `App.test.tsx` 시나리오 본문과 `src/test/` helper로 나누고, 스타일 진입은 `styles/index.css` 하나만 `main.tsx` 에서 불러옵니다.

## 참고 메모

- `.camping-data/` 는 Git 추적 대상이 아닙니다.
- `.camping-backups/` 도 Git 추적 대상이 아닙니다.
- 개인 준비물은 사용자가 직접 입력하는 목록이 아니라 분석 결과입니다.
- 외부 링크는 사용자가 직접 관리하는 링크 데이터입니다.
- 장비 카테고리는 `equipment/categories.yaml` 에서 관리하며 장비 화면에서는 셀렉트로 선택합니다.
- 반복 장비는 선택적으로 `purchase_link` 를 저장할 수 있고, 로컬 API의 AI 메타데이터 수집 시 참고 자료로 사용합니다.
- 반복 장비 메타데이터 상태는 `.camping-data/cache/equipment-metadata/jobs/durable/*.json` 에 저장하고, 실제 수집 결과는 `.camping-data/cache/equipment-metadata/durable/*.json` 에 저장합니다.
- 반복 장비 메타데이터 수집은 같은 장비 중복 실행을 막고 최대 3건까지 병렬로 실행합니다.
- 히스토리 회고 원문은 `history/*.yaml` 안의 `retrospectives` 배열에 append-only 로 저장합니다.
- 캠핑별 학습 결과는 `.camping-data/cache/history-learning/*.json` 에 저장하고, 전역 개인화 학습 프로필은 `.camping-data/cache/user-learning/profile.json` 에 저장합니다.
- 전역 개인화 학습 작업 상태는 `.camping-data/cache/user-learning/jobs/profile.json` 에 저장하고, 계획 분석/AI 보조는 이 프로필을 자동으로 함께 읽습니다.
- 브라우저에서 OpenAI API를 직접 호출하지 않습니다.
- `pnpm seed` 는 새 환경 초기화용 명령이며, 기존 데이터가 있으면 중단됩니다.
- `pnpm seed -- --replace` 는 기존 `.camping-data/` 를 `.camping-backups/<timestamp>/` 에 백업한 뒤 `docs/examples/` 기준으로 다시 생성합니다.
