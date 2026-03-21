# camping

로컬 파일과 Codex CLI를 기반으로 캠핑 준비를 분석하는 프로젝트입니다.

이 프로젝트는 사용자가 저장한 캠핑 장비, 동행자, 취향, trip 요청 파일을 읽고 이번 캠핑에 필요한 장비, 연령대별 개인 준비물, 요리, 이동 동선, 주변 추천까지 한 번에 정리하는 것을 목표로 합니다.

## 핵심 방향

- 서버 없이 시작하는 `local-first` 구조
- 운영 데이터는 `./.camping-data/` 에 저장
- GitHub는 코드와 문서 저장소로만 사용
- Codex CLI가 분석 실행 주체
- 결과는 Markdown 문서로 생성

## 동작 방식

1. 사용자가 `.camping-data/` 에 기본 데이터를 저장합니다.
2. 사용자가 `trips/<trip-id>.yaml` 파일로 이번 캠핑 조건을 입력합니다.
3. Codex CLI가 문서와 로컬 데이터를 읽고 분석합니다.
4. 결과로 장비 추천, 연령대별 개인 준비물, 식단, 체크리스트, 이동/주변 추천을 생성합니다.

## 문서 시작점

- 문서 인덱스: [`docs/index.md`](/Users/leech/workspace/camping/camping/docs/index.md)
- 요구사항: [`docs/requirements.md`](/Users/leech/workspace/camping/camping/docs/requirements.md)
- 기술 아키텍처: [`docs/technical-architecture.md`](/Users/leech/workspace/camping/camping/docs/technical-architecture.md)
- 데이터 모델: [`docs/data-model.md`](/Users/leech/workspace/camping/camping/docs/data-model.md)
- 분석 워크플로우: [`docs/trip-analysis-workflow.md`](/Users/leech/workspace/camping/camping/docs/trip-analysis-workflow.md)
- MVP 범위: [`docs/mvp-scope.md`](/Users/leech/workspace/camping/camping/docs/mvp-scope.md)
- 예시 파일: [`docs/example-files.md`](/Users/leech/workspace/camping/camping/docs/example-files.md)

## 현재 상태

현재는 문서 설계와 예시 파일 세트가 정리된 상태입니다.

다음 구현 대상:

- `prompts/` 디렉토리 구성
- `schemas/` 검증 스키마 정의
- `scripts/plan-trip` / `scripts/validate-data` 초안 작성
- 실제 `.camping-data/` 샘플 생성과 첫 분석 루프 연결
