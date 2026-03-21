# 문서 인덱스

## 목적

이 문서는 현재 프로젝트 문서의 역할과 읽는 순서를 정리한다.

현재 프로젝트 문서는 제목과 본문을 한글로 작성하는 것을 기본 원칙으로 한다.

## 권장 읽기 순서

1. [`README.md`](../README.md)
2. [`requirements.md`](requirements.md)
3. [`technical-architecture.md`](technical-architecture.md)
4. [`local-ui-transition-plan.md`](local-ui-transition-plan.md)
5. [`local-api-contract.md`](local-api-contract.md)
6. [`ui-flow.md`](ui-flow.md)
7. [`data-model.md`](data-model.md)
8. [`trip-analysis-workflow.md`](trip-analysis-workflow.md)
9. [`mvp-scope.md`](mvp-scope.md)
10. [`directory-structure.md`](directory-structure.md)
11. [`prompt-design.md`](prompt-design.md)
12. [`example-files.md`](example-files.md)
13. [`project-setup-checklist.md`](project-setup-checklist.md)

## 문서별 역할

### 제품/방향

- [`README.md`](../README.md)
  - 프로젝트 소개와 현재 상태
- [`requirements.md`](requirements.md)
  - 제품 요구사항과 컨셉 원문

### 기술 설계

- [`technical-architecture.md`](technical-architecture.md)
  - 로컬 웹 UI, 로컬 API, 로컬 파일 저장 구조
- [`local-ui-transition-plan.md`](local-ui-transition-plan.md)
  - CLI 중심 설계에서 UI 중심 설계로 전환하는 이유와 작업 목록
- [`local-api-contract.md`](local-api-contract.md)
  - 로컬 API 엔드포인트와 요청/응답 규약
- [`ui-flow.md`](ui-flow.md)
  - 로컬 UI 화면 흐름과 사용자 액션
- [`data-model.md`](data-model.md)
  - 로컬 데이터 구조와 필드 정의
- [`directory-structure.md`](directory-structure.md)
  - 저장소 디렉토리 책임과 배치 기준

### 실행 흐름

- [`trip-analysis-workflow.md`](trip-analysis-workflow.md)
  - UI 입력부터 결과 출력까지의 워크플로우
- [`prompt-design.md`](prompt-design.md)
  - AI 응답 생성에 사용하는 프롬프트 설계

### 범위와 착수

- [`mvp-scope.md`](mvp-scope.md)
  - v1에 포함할 범위와 제외할 범위
- [`project-setup-checklist.md`](project-setup-checklist.md)
  - 실제 세팅 순서와 체크리스트

### 예시

- [`example-files.md`](example-files.md)
  - 예시 파일 설명과 샘플 데이터 위치
- [`docs/examples/profile.yaml`](examples/profile.yaml)
- [`docs/examples/companions.yaml`](examples/companions.yaml)
- [`docs/examples/equipment/durable.yaml`](examples/equipment/durable.yaml)
- [`docs/examples/equipment/consumables.yaml`](examples/equipment/consumables.yaml)
- [`docs/examples/equipment/precheck.yaml`](examples/equipment/precheck.yaml)
- [`docs/examples/preferences/travel.yaml`](examples/preferences/travel.yaml)
- [`docs/examples/preferences/food.yaml`](examples/preferences/food.yaml)
- [`docs/examples/trips/2026-04-18-gapyeong.yaml`](examples/trips/2026-04-18-gapyeong.yaml)
- [`docs/examples/outputs/2026-04-18-gapyeong-plan.md`](examples/outputs/2026-04-18-gapyeong-plan.md)

## 현재 상태

현재 저장소에는 아래 MVP 구현이 포함되어 있다.

- `apps/web/` 로컬 UI
- `apps/api/` 로컬 API
- `shared/` 공통 타입과 검증 스키마
- `prompts/` 실제 분석 프롬프트
- `schemas/` Codex CLI 출력 스키마
- `scripts/seed-local-data.ts` 시드 스크립트

## 현재 권장 실행 순서

1. `pnpm install`
2. `cp .env.example .env`
3. `codex login`
4. `pnpm seed`
5. `pnpm dev:api`
6. `pnpm dev:web`
7. 필요하면 `pnpm typecheck`, `pnpm test`, `pnpm build`
