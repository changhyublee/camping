# Project Setup Checklist

## 1. 문서 목적

이 문서는 현재 문서 기준으로 실제 프로젝트 세팅 순서를 체크리스트로 정리한다.

목표:

- 무엇부터 만들지 순서를 고정
- 빠르게 실행 가능한 상태로 진입
- 문서만 있고 구현이 멈추는 상태를 방지

## 2. 세팅 우선순위

### Phase 1. 문서 기준 확정

- [ ] [`README.md`](/Users/leech/workspace/camping/camping/README.md) 방향 확정
- [ ] [`technical-architecture.md`](/Users/leech/workspace/camping/camping/docs/technical-architecture.md) 구조 확정
- [ ] [`data-model.md`](/Users/leech/workspace/camping/camping/docs/data-model.md) 필드 확정
- [ ] [`trip-analysis-workflow.md`](/Users/leech/workspace/camping/camping/docs/trip-analysis-workflow.md) 흐름 확정
- [ ] [`mvp-scope.md`](/Users/leech/workspace/camping/camping/docs/mvp-scope.md) 범위 확정

### Phase 2. 저장소 뼈대 생성

- [ ] `prompts/` 디렉토리 생성
- [ ] `schemas/` 디렉토리 생성
- [ ] `scripts/` 디렉토리 생성
- [ ] `.gitignore` 에 `.camping-data/` 추가

### Phase 3. 프롬프트 초안 생성

- [ ] `prompts/system.md` 작성
- [ ] `prompts/trip-analysis.md` 작성
- [ ] 출력 포맷 규칙 초안 정리

### Phase 4. 예시 데이터 세트 준비

- [ ] `docs/examples/profile.yaml` 검토
- [ ] `docs/examples/companions.yaml` 검토
- [ ] `docs/examples/equipment/*.yaml` 검토
- [ ] `docs/examples/preferences/*.yaml` 검토
- [ ] `docs/examples/trips/*.yaml` 검토
- [ ] `docs/examples/outputs/*.md` 검토

### Phase 5. 실제 로컬 데이터 세팅

- [ ] `.camping-data/` 생성
- [ ] `profile.yaml` 생성
- [ ] `companions.yaml` 생성
- [ ] `equipment/` 생성
- [ ] `preferences/` 생성
- [ ] `trips/` 생성
- [ ] `outputs/` 생성

### Phase 6. 최소 실행 루프 확보

- [ ] 예시 trip 파일 1개 준비
- [ ] Codex CLI로 1회 분석 실행
- [ ] 결과 Markdown 저장
- [ ] 결과 품질 검토
- [ ] 입력값 수정 후 재실행

### Phase 7. 보조 자동화

- [ ] `scripts/validate-data` 초안 작성
- [ ] `scripts/plan-trip` 초안 작성
- [ ] 템플릿 생성 로직 검토

## 3. 가장 먼저 해야 할 실제 작업

착수 직후 추천 순서:

1. `.gitignore` 정리
2. `prompts/` 디렉토리 생성
3. `docs/examples/` 기준으로 `.camping-data/` 샘플 생성
4. trip 1건 분석 실행

## 4. 세팅 완료 기준

아래가 가능하면 프로젝트 세팅이 된 것으로 본다.

- 로컬 데이터 저장 경로가 정해져 있다
- 예시 입력 파일이 있다
- 프롬프트 초안이 있다
- Codex CLI로 trip 1건을 분석할 수 있다
- 결과 Markdown이 생성된다

## 5. 현재 기준 다음 구현 순서

1. `docs/examples/` 를 기반으로 실제 `.camping-data/` 생성
2. `prompts/system.md` 작성
3. `prompts/trip-analysis.md` 작성
4. 첫 분석 실행
5. 필요한 경우 `scripts/plan-trip` 구현
