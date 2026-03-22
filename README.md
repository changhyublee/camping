# camping

로컬 웹 UI와 로컬 파일을 기반으로 캠핑 준비와 운영 기록을 관리하는 프로젝트입니다.

이 프로젝트는 사용자가 저장한 장비, 동행자, 취향, 캠핑 계획을 바탕으로 이번 캠핑에 필요한 장비와 개인 준비물을 분석하고, 계획이 끝난 뒤에는 히스토리로 아카이브하며, 날씨/장소/맛집 링크까지 한곳에서 관리하는 것을 목표로 합니다.

초기 구조는 계속 `로컬 우선` 을 유지합니다. 브라우저 UI는 로컬 API를 호출하고, 로컬 API가 `.camping-data/` 의 YAML 데이터와 문서/프롬프트를 조합해 기본적으로 로컬 `codex CLI` 에 분석을 요청합니다. 필요하면 OpenAI Responses API를 fallback 백엔드로 사용할 수 있습니다.

## 핵심 방향

- 원격 서버 없이 시작하는 로컬 우선 구조
- 운영 데이터는 `./.camping-data/` 에 저장
- 브라우저 UI + 로컬 API + 로컬 Codex CLI 구조
- GitHub는 코드와 문서 저장소로만 사용
- 사람이 관리하는 데이터는 YAML, 결과는 Markdown으로 저장

## 현재 메뉴 구조

- `대시보드`
  - 예정 계획, 최근 히스토리, 재고/점검 경고, 외부 링크 현황
- `장비 관리`
  - 반복 장비, 소모품, 출발 전 점검 항목 CRUD
  - 장비 섹션별 카테고리 셀렉트 기반 관리
- `캠핑 계획`
  - 날짜/장소/동행자/차량/조건 편집
  - 동행자 프로필 빠른 등록/수정
  - AI 보조 대화
  - 분석 실행과 결과 저장
- `캠핑 히스토리`
  - 완료된 계획 아카이브
  - 저장된 결과 Markdown 다시 열기
  - 인원/메모 수정
  - 히스토리 삭제
- `외부 링크`
  - 날씨, 장소, 맛집, 장보기 등 참고 링크 CRUD
  - 카테고리별 그룹 목록
- `관리 설정`
  - 장비 섹션별 카테고리 추가/수정/삭제
  - 장비 카테고리 표시 이름 관리
  - 자동 생성이 어려운 경우 영문 카테고리 코드 직접 입력

## 현재 구현 상태

현재 저장소에는 아래 운영형 로컬 관리 MVP가 포함되어 있습니다.

- `apps/api/`
  - `GET /api/health`
  - companions CRUD
  - trip CRUD + 검증 + 분석 + 결과 저장
  - 저장된 결과 Markdown 조회
  - equipment CRUD
  - equipment category CRUD
  - history 조회/수정/삭제 + trip 아카이브
  - links CRUD
  - planning assistant 응답
- `apps/web/`
  - 대시보드
  - 장비 관리
  - 캠핑 계획 편집/분석 + 동행자 인라인 관리
  - 히스토리 관리 + 결과 다시 열기
  - 외부 링크 카테고리 그룹 관리
- `shared/`
  - 공통 타입
  - CRUD 요청/응답 스키마
  - 데이터 모델 스키마
- `prompts/`
  - `system.md`
  - `trip-analysis.md`
- `scripts/seed-local-data.ts`
  - `docs/examples/` 를 `.camping-data/` 로 복사

## 빠른 시작

사전 조건:

- Node.js 22 이상
- pnpm 10 이상
- `codex` CLI 설치 및 로그인

실행 순서:

```bash
pnpm install
cp .env.example .env
codex login
pnpm seed
pnpm dev:api
pnpm dev:web
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

## 문서 시작점

- 문서 인덱스: [`docs/index.md`](docs/index.md)
- 메뉴 구조: [`docs/menu-structure.md`](docs/menu-structure.md)
- 요구사항: [`docs/requirements.md`](docs/requirements.md)
- 기술 아키텍처: [`docs/technical-architecture.md`](docs/technical-architecture.md)
- 로컬 API 계약: [`docs/local-api-contract.md`](docs/local-api-contract.md)
- UI 흐름: [`docs/ui-flow.md`](docs/ui-flow.md)
- 데이터 모델: [`docs/data-model.md`](docs/data-model.md)
- 분석 워크플로우: [`docs/trip-analysis-workflow.md`](docs/trip-analysis-workflow.md)
- 현재 범위: [`docs/mvp-scope.md`](docs/mvp-scope.md)
- 예시 파일: [`docs/example-files.md`](docs/example-files.md)

## 참고 메모

- `.camping-data/` 는 Git 추적 대상이 아닙니다.
- 개인 준비물은 사용자가 직접 입력하는 목록이 아니라 분석 결과입니다.
- 외부 링크는 사용자가 직접 관리하는 링크 데이터입니다.
- 장비 카테고리는 `equipment/categories.yaml` 에서 관리하며 장비 화면에서는 셀렉트로 선택합니다.
- 브라우저에서 OpenAI API를 직접 호출하지 않습니다.
