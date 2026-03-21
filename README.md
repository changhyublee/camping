# camping

로컬 웹 UI와 로컬 파일을 기반으로 캠핑 준비를 분석하는 프로젝트입니다.

이 프로젝트는 사용자가 저장한 캠핑 장비, 동행자, 취향, trip 요청 파일을 읽고 이번 캠핑에 필요한 장비, 연령대별 개인 준비물, 요리, 이동 동선, 주변 추천까지 한 번에 정리하는 것을 목표로 합니다.

초기 버전은 원격 서버 없이 로컬에서 실행되는 웹 UI와 로컬 API를 중심으로 구성합니다. 로컬 API가 문서, 프롬프트, `.camping-data/` 의 YAML 데이터를 조합해 OpenAI Responses API에 분석을 요청하고, 결과를 화면에 노출하거나 Markdown으로 저장합니다.

## 핵심 방향

- 원격 서버 없이 시작하는 로컬 우선 구조
- 운영 데이터는 `./.camping-data/` 에 저장
- 브라우저 UI + 로컬 API + OpenAI Responses API 구조
- GitHub는 코드와 문서 저장소로만 사용
- 결과는 Markdown 문서로 생성

## 동작 방식

1. 사용자가 `.camping-data/` 에 기본 데이터를 저장합니다.
2. 사용자가 UI 또는 YAML 파일로 `trips/<trip-id>.yaml` 요청을 준비합니다.
3. 로컬 API가 문서, 프롬프트, 로컬 데이터를 모아 분석용 컨텍스트를 구성합니다.
4. OpenAI Responses API가 캠핑 추천 결과를 생성합니다.
5. UI가 결과를 화면에 보여주고 필요하면 `outputs/` 에 저장합니다.

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

## 현재 상태

현재는 로컬 웹 UI 전환을 반영한 문서 구조와 초기 디렉토리 뼈대가 정리된 상태입니다.

다음 구현 대상:

- `apps/web/` 초기 프로젝트 생성
- `apps/api/` 초기 프로젝트 생성
- `prompts/system.md`, `prompts/trip-analysis.md` 작성
- `schemas/` 검증 스키마 정의
- `scripts/validate-data` 와 `scripts/analyze-trip` 초안 작성
- 실제 `.camping-data/` 샘플 생성과 첫 종단간 실행 루프 연결
