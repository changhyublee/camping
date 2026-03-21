# Docs Index

## 목적

이 문서는 현재 프로젝트 문서의 역할과 읽는 순서를 정리한다.

## 권장 읽기 순서

1. [`README.md`](/Users/leech/workspace/camping/camping/README.md)
2. [`requirements.md`](/Users/leech/workspace/camping/camping/docs/requirements.md)
3. [`technical-architecture.md`](/Users/leech/workspace/camping/camping/docs/technical-architecture.md)
4. [`data-model.md`](/Users/leech/workspace/camping/camping/docs/data-model.md)
5. [`trip-analysis-workflow.md`](/Users/leech/workspace/camping/camping/docs/trip-analysis-workflow.md)
6. [`mvp-scope.md`](/Users/leech/workspace/camping/camping/docs/mvp-scope.md)
7. [`directory-structure.md`](/Users/leech/workspace/camping/camping/docs/directory-structure.md)
8. [`prompt-design.md`](/Users/leech/workspace/camping/camping/docs/prompt-design.md)
9. [`example-files.md`](/Users/leech/workspace/camping/camping/docs/example-files.md)
10. [`project-setup-checklist.md`](/Users/leech/workspace/camping/camping/docs/project-setup-checklist.md)

## 문서별 역할

### 제품/방향

- [`README.md`](/Users/leech/workspace/camping/camping/README.md)
  - 프로젝트 소개와 현재 상태
- [`requirements.md`](/Users/leech/workspace/camping/camping/docs/requirements.md)
  - 제품 요구사항과 컨셉 원문

### 기술 설계

- [`technical-architecture.md`](/Users/leech/workspace/camping/camping/docs/technical-architecture.md)
  - 서버 없는 구조와 로컬 우선 전략
- [`data-model.md`](/Users/leech/workspace/camping/camping/docs/data-model.md)
  - 로컬 데이터 구조와 필드 정의
- [`directory-structure.md`](/Users/leech/workspace/camping/camping/docs/directory-structure.md)
  - 저장소 디렉토리 책임과 배치 기준

### 실행 흐름

- [`trip-analysis-workflow.md`](/Users/leech/workspace/camping/camping/docs/trip-analysis-workflow.md)
  - 사용자 입력부터 결과 출력까지의 워크플로우
- [`prompt-design.md`](/Users/leech/workspace/camping/camping/docs/prompt-design.md)
  - Codex CLI 분석 프롬프트 설계

### 범위와 착수

- [`mvp-scope.md`](/Users/leech/workspace/camping/camping/docs/mvp-scope.md)
  - v1에 포함할 범위와 제외할 범위
- [`project-setup-checklist.md`](/Users/leech/workspace/camping/camping/docs/project-setup-checklist.md)
  - 실제 세팅 순서와 체크리스트

### 예시

- [`example-files.md`](/Users/leech/workspace/camping/camping/docs/example-files.md)
  - 예시 파일 설명과 샘플 데이터 위치
- [`docs/examples/profile.yaml`](/Users/leech/workspace/camping/camping/docs/examples/profile.yaml)
- [`docs/examples/companions.yaml`](/Users/leech/workspace/camping/camping/docs/examples/companions.yaml)
- [`docs/examples/equipment/durable.yaml`](/Users/leech/workspace/camping/camping/docs/examples/equipment/durable.yaml)
- [`docs/examples/equipment/consumables.yaml`](/Users/leech/workspace/camping/camping/docs/examples/equipment/consumables.yaml)
- [`docs/examples/equipment/precheck.yaml`](/Users/leech/workspace/camping/camping/docs/examples/equipment/precheck.yaml)
- [`docs/examples/preferences/travel.yaml`](/Users/leech/workspace/camping/camping/docs/examples/preferences/travel.yaml)
- [`docs/examples/preferences/food.yaml`](/Users/leech/workspace/camping/camping/docs/examples/preferences/food.yaml)
- [`docs/examples/trips/2026-04-18-gapyeong.yaml`](/Users/leech/workspace/camping/camping/docs/examples/trips/2026-04-18-gapyeong.yaml)
- [`docs/examples/outputs/2026-04-18-gapyeong-plan.md`](/Users/leech/workspace/camping/camping/docs/examples/outputs/2026-04-18-gapyeong-plan.md)

## 현재 추천 다음 단계

1. `docs/examples/` 기준으로 실제 `.camping-data/` 샘플을 만든다
2. `prompts/` 디렉토리를 만들고 프롬프트 초안을 옮긴다
3. `scripts/plan-trip` 와 `scripts/validate-data` 를 구현한다
