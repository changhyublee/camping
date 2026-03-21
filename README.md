# camping

로컬 웹 UI와 로컬 파일을 기반으로 캠핑 준비를 분석하는 프로젝트입니다.

이 프로젝트는 사용자가 저장한 캠핑 장비, 동행자, 취향, trip 요청 파일을 읽고 이번 캠핑에 필요한 장비, 연령대별 개인 준비물, 요리, 이동 동선, 주변 추천까지 한 번에 정리하는 것을 목표로 합니다.

초기 버전은 원격 서버 없이 로컬에서 실행되는 웹 UI와 로컬 API를 중심으로 구성합니다. 로컬 API가 문서, 프롬프트, `.camping-data/` 의 YAML 데이터를 조합해 기본적으로 로컬 `codex CLI` 에 분석을 요청하고, 필요하면 OpenAI Responses API를 fallback 백엔드로 사용하며, 결과를 화면에 노출하거나 Markdown으로 저장합니다.

## 핵심 방향

- 원격 서버 없이 시작하는 로컬 우선 구조
- 운영 데이터는 `./.camping-data/` 에 저장
- 브라우저 UI + 로컬 API + 로컬 Codex CLI 구조
- GitHub는 코드와 문서 저장소로만 사용
- 결과는 Markdown 문서로 생성

## 동작 방식

1. 사용자가 `.camping-data/` 에 기본 데이터를 저장합니다.
2. 사용자가 UI 또는 YAML 파일로 `trips/<trip-id>.yaml` 요청을 준비합니다.
3. 로컬 API가 문서, 프롬프트, 로컬 데이터를 모아 분석용 컨텍스트를 구성합니다.
4. 로컬 Codex CLI가 캠핑 추천 결과를 생성합니다.
5. UI가 결과를 화면에 보여주고 필요하면 `outputs/` 에 저장합니다.

## 현재 구현 상태

현재 저장소에는 아래 MVP 구현이 포함되어 있습니다.

- `apps/api/`
  - `GET /api/health`
  - `GET /api/trips`
  - `GET /api/trips/:tripId`
  - `POST /api/validate-trip`
  - `POST /api/analyze-trip`
  - `POST /api/outputs`
  - 기본 분석 백엔드: `codex exec`
  - 선택 fallback 백엔드: OpenAI Responses API
- `apps/web/`
  - trip 목록 선택
  - trip 상세/검증 경고 표시
  - 분석 실행
  - Markdown 결과 렌더링
  - 결과 저장
- `shared/`
  - 공통 타입
  - `trip_id` 와 요청/응답 검증 스키마
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

백엔드 기본값:

- `AI_BACKEND=codex-cli`
- `CODEX_BIN=codex`
- `CODEX_MODEL=gpt-5.4`
- `OPENAI_API_KEY` 는 선택 fallback 백엔드용

검증 명령:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 문서 시작점

- 문서 인덱스: [`docs/index.md`](docs/index.md)
- 요구사항: [`docs/requirements.md`](docs/requirements.md)
- 기술 아키텍처: [`docs/technical-architecture.md`](docs/technical-architecture.md)
- 전환 계획: [`docs/local-ui-transition-plan.md`](docs/local-ui-transition-plan.md)
- 로컬 API 계약: [`docs/local-api-contract.md`](docs/local-api-contract.md)
- UI 흐름: [`docs/ui-flow.md`](docs/ui-flow.md)
- 데이터 모델: [`docs/data-model.md`](docs/data-model.md)
- 분석 워크플로우: [`docs/trip-analysis-workflow.md`](docs/trip-analysis-workflow.md)
- MVP 범위: [`docs/mvp-scope.md`](docs/mvp-scope.md)
- 예시 파일: [`docs/example-files.md`](docs/example-files.md)

## 참고 메모

- `.camping-data/` 는 Git 추적 대상이 아닙니다.
- 개인 준비물은 사용자가 직접 입력하는 목록이 아니라 분석 결과입니다.
- 외부 날씨/장소 자동 수집은 v1 필수 범위가 아닙니다.
- 기본 인증 방식은 API 키가 아니라 로컬 `codex login` 세션입니다.
