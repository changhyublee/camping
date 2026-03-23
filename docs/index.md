# 문서 인덱스

## 목적

이 문서는 현재 프로젝트 문서의 역할과 읽는 순서를 정리한다.

## 권장 읽기 순서

1. [`README.md`](../README.md)
2. [`requirements.md`](requirements.md)
3. [`menu-structure.md`](menu-structure.md)
4. [`technical-architecture.md`](technical-architecture.md)
5. [`local-ui-transition-plan.md`](local-ui-transition-plan.md)
6. [`design-spec.md`](design-spec.md)
7. [`local-api-contract.md`](local-api-contract.md)
8. [`ui-flow.md`](ui-flow.md)
9. [`data-model.md`](data-model.md)
10. [`trip-analysis-workflow.md`](trip-analysis-workflow.md)
11. [`mvp-scope.md`](mvp-scope.md)
12. [`directory-structure.md`](directory-structure.md)
13. [`example-files.md`](example-files.md)
14. [`project-setup-checklist.md`](project-setup-checklist.md)
15. [`local-skills.md`](local-skills.md)

## 문서별 역할

### 제품/방향

- [`README.md`](../README.md)
  - 프로젝트 소개와 현재 구현 상태
- [`requirements.md`](requirements.md)
  - 제품 요구사항 원문
- [`menu-structure.md`](menu-structure.md)
  - 메뉴 분리 기준과 화면 책임

### 기술 설계

- [`technical-architecture.md`](technical-architecture.md)
  - 로컬 웹 UI, 로컬 API, 로컬 파일 저장 구조
- [`local-ui-transition-plan.md`](local-ui-transition-plan.md)
  - 기존 trip 중심 UI에서 현재 메뉴형 UI로 확장한 기준
- [`design-spec.md`](design-spec.md)
  - 최신 트렌드를 반영한 화면 디자인 기준과 에이전트 구현 규칙
- [`local-api-contract.md`](local-api-contract.md)
  - CRUD 및 분석 API 계약
- [`ui-flow.md`](ui-flow.md)
  - 화면 흐름과 사용자 액션
- [`data-model.md`](data-model.md)
  - `.camping-data/` 구조와 파일 책임
- [`directory-structure.md`](directory-structure.md)
  - 저장소와 로컬 데이터 경로 책임

### 실행 흐름

- [`trip-analysis-workflow.md`](trip-analysis-workflow.md)
  - 계획 작성부터 분석, 히스토리 아카이브까지의 흐름

### 범위와 착수

- [`mvp-scope.md`](mvp-scope.md)
  - 현재 구현 범위와 제외 항목
- [`project-setup-checklist.md`](project-setup-checklist.md)
  - 현재 저장소 포함 항목과 새 환경 실행 점검 항목

### 로컬 스킬

- [`local-skills.md`](local-skills.md)
  - 저장소 내부 `skills/` 구조와 사용 규칙

### 예시

- [`example-files.md`](example-files.md)
  - 예시 입력/출력 파일 설명
- [`docs/examples/profile.yaml`](examples/profile.yaml)
- [`docs/examples/companions.yaml`](examples/companions.yaml)
- [`docs/examples/equipment/durable.yaml`](examples/equipment/durable.yaml)
- [`docs/examples/equipment/consumables.yaml`](examples/equipment/consumables.yaml)
- [`docs/examples/equipment/precheck.yaml`](examples/equipment/precheck.yaml)
- [`docs/examples/equipment/categories.yaml`](examples/equipment/categories.yaml)
- [`docs/examples/preferences/travel.yaml`](examples/preferences/travel.yaml)
- [`docs/examples/preferences/food.yaml`](examples/preferences/food.yaml)
- [`docs/examples/trips/2026-04-18-gapyeong.yaml`](examples/trips/2026-04-18-gapyeong.yaml)
- [`docs/examples/history/2026-03-08-yangpyeong.yaml`](examples/history/2026-03-08-yangpyeong.yaml)
- [`docs/examples/links.yaml`](examples/links.yaml)
- [`docs/examples/outputs/2026-04-18-gapyeong-plan.md`](examples/outputs/2026-04-18-gapyeong-plan.md)

## 현재 상태

현재 저장소에는 아래 로컬 운영형 구현이 포함되어 있다.

- `apps/web/` 메뉴형 로컬 UI
- `apps/api/` 로컬 API
- `shared/` 공통 타입과 검증 스키마
- `prompts/` 분석 프롬프트
- `schemas/` Codex CLI 출력 스키마
- `scripts/seed-local-data.ts` 시드 스크립트
- `skills/` 저장소 로컬 Codex skill 패키지
