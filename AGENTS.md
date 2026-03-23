# 에이전트 작업 지침

## 목적

이 문서는 이 저장소에서 작업하는 코딩 에이전트를 위한 저장소 단위 지침이다.

이 저장소는 원격 서버 중심 구조가 아니라 로컬 파일, 로컬 웹 UI, 로컬 API를 사용하는 로컬 우선 캠핑 분석 프로젝트다.

## 먼저 읽을 문서

의미 있는 변경을 하기 전에 아래 순서로 문서를 읽는다.

1. [`README.md`](README.md)
2. [`docs/requirements.md`](docs/requirements.md)
3. [`docs/index.md`](docs/index.md)
4. [`docs/technical-architecture.md`](docs/technical-architecture.md)
5. [`docs/local-ui-transition-plan.md`](docs/local-ui-transition-plan.md)
6. [`docs/design-spec.md`](docs/design-spec.md)
7. [`docs/local-api-contract.md`](docs/local-api-contract.md)
8. [`docs/ui-flow.md`](docs/ui-flow.md)
9. [`docs/data-model.md`](docs/data-model.md)
10. [`docs/trip-analysis-workflow.md`](docs/trip-analysis-workflow.md)
11. [`docs/mvp-scope.md`](docs/mvp-scope.md)

작업이 예시 파일이나 세팅과 관련되어 있으면 아래도 함께 읽는다.

- [`docs/example-files.md`](docs/example-files.md)
- [`docs/project-setup-checklist.md`](docs/project-setup-checklist.md)
- [`docs/prompt-design.md`](docs/prompt-design.md)

작업이 화면 구성, 스타일 수정, 프론트엔드 UI 구현과 관련되어 있으면 아래 문서를 반드시 함께 읽는다.

- [`docs/design-spec.md`](docs/design-spec.md)

## 기준 문서

- `README.md` 는 프로젝트 개요 문서다.
- `docs/requirements.md` 는 제품 요구사항 기준 문서다.
- `docs/technical-architecture.md` 는 기술 아키텍처 기준 문서다.
- `docs/data-model.md` 는 데이터 구조 기준 문서다.

문서 간 충돌이 있으면 아래 우선순위로 해석한다.

1. `docs/requirements.md`
2. `docs/technical-architecture.md`
3. `docs/local-api-contract.md`
4. `docs/data-model.md`
5. `docs/trip-analysis-workflow.md`
6. `README.md`

## 문서 작성 원칙

- 모든 문서 본문은 한글로 작성한다.
- 파일명은 영어를 유지할 수 있지만 제목과 설명은 한글을 우선한다.
- 기존 문서가 한글 중심이면 새 문서도 같은 기준을 따른다.
- 용어를 바꾸면 그 용어를 참조하는 관련 문서도 함께 갱신한다.

## 응답 언어 원칙

- 에이전트의 사용자 응답, 중간 진행 보고, 리뷰 결과, 제안 문구는 기본적으로 한글로 작성한다.
- 사용자가 영어 또는 다른 언어를 명시적으로 요구한 경우에만 그 언어로 응답한다.

## 프로젝트 원칙

- 원격 서버 없이 시작한다.
- 이 프로젝트를 로컬 우선 도구로 다룬다.
- 실제 운영 사용자 데이터는 `./.camping-data/` 에 저장한다.
- GitHub는 운영 데이터 저장소가 아니라 코드와 문서 저장소로 사용한다.
- 로컬 웹 UI와 로컬 API를 주요 실행 구조로 사용한다.
- OpenAI 호출은 로컬 API를 통해 수행한다.
- 사람이 관리하는 데이터는 YAML로 저장한다.
- 분석 결과는 Markdown으로 저장한다.

## 중요한 도메인 규칙

### 개인 준비물 규칙

개인 준비물은 사용자가 직접 관리하는 인벤토리가 아니다.

에이전트는 개인 준비물 추천을 아래 입력에서 파생되는 결과로 다뤄야 한다.

- 동행자 연령대
- 건강 특이사항
- 복용약
- 날씨
- 기온
- 장소
- 캠핑 요청 조건

사용자가 개인 준비물 전체 목록을 직접 관리하는 구조로 다시 설계하지 않는다.

### 캠핑 요청 파일 분석 단위

주요 실행 단위는 아래 경로의 trip 요청 파일이다.

```text
.camping-data/trips/<trip-id>.yaml
```

### 장비 식별 규칙

반복 사용 장비의 경우:

- `id` 는 각 레코드의 고유 식별자다
- `kind` 는 같은 종류 장비를 묶는 키다
- 완전히 같은 장비가 여러 개면 `quantity` 를 사용할 수 있다
- 같은 종류라도 모델이 다르면 서로 다른 `id` 를 가진 별도 레코드로 둔다

`id` 하나가 전역 카테고리를 뜻한다고 가정하지 않는다. `id` 는 종류 키가 아니라 레코드 고유값이다.

## 저장소 책임

### 루트

- `README.md`: 프로젝트 개요
- `AGENTS.md`: 저장소 단위 에이전트 지침
- `CLAUDE.md`: Claude 호환 에이전트 지침

### `docs/`

- 설계 문서
- 워크플로우 문서
- 세팅 문서
- 예시 데이터

### `apps/web/`

- 로컬 웹 UI

### `apps/api/`

- 로컬 API 서버

### `.camping-data/`

- 로컬 운영 데이터
- 커밋 대상이 아님
- 새 저장소 복제 직후에는 없을 수 있음

## 가드레일

- 사용자가 명시적으로 방향을 바꾸지 않는 한 원격 서버 중심 구조를 도입하지 않는다.
- 기본값으로 운영 저장소를 로컬 파일에서 GitHub 중심 흐름으로 바꾸지 않는다.
- 브라우저에서 OpenAI API를 직접 호출하지 않는다.
- `.camping-data/` 의 실제 사용자 데이터를 커밋하지 않는다.
- `docs/examples/` 를 운영 상태로 취급하지 않는다. 이 경로는 예시와 참고용이다.
- `README.md` 와 `docs/requirements.md` 를 다시 하나의 파일로 합치지 않는다.
- 개인 준비물 추천을 수동 체크리스트 인벤토리 모델로 바꾸지 않는다.

## 선호 구현 순서

다음 구현 단계는 아래 순서를 우선한다.

1. `apps/api/` 생성
2. `apps/web/` 생성
3. `prompts/` 생성
4. `schemas/` 생성
5. `scripts/validate-data` 생성
6. `scripts/analyze-trip` 생성
7. 예시 `.camping-data/` 생성
8. 첫 번째 종단간 분석 루프 실행

## 파일 생성 기준

새 파일을 추가할 때는 아래 문서의 디렉토리 구조를 따른다.

- [`docs/directory-structure.md`](docs/directory-structure.md)

예상되는 향후 디렉토리:

```text
apps/
prompts/
schemas/
scripts/
shared/
.camping-data/
```

## 출력 기준

분석 결과를 만들 때는 아래 섹션 구성을 우선한다.

1. 요약
2. 추천 장비
3. 연령대별 개인 준비물
4. 부족한 장비 또는 소모품
5. 출발 전 체크리스트
6. 식단 또는 요리 계획
7. 이동 중 방문 후보 지역과 장소
8. 캠핑장 주변 방문 후보 지역과 장소
9. 리스크와 한계

## 편집 기준

- 문서는 간결하고 구조적으로 유지한다.
- 저장소가 이미 한글 중심이면 그 흐름을 유지한다.
- 병렬 문서를 새로 만드는 것보다 기존 문서를 확장하는 쪽을 우선한다.
- 용어가 바뀌면 그 용어를 참조하는 관련 문서도 함께 수정한다.
- 화면 구현이나 스타일 수정은 `docs/design-spec.md` 의 디자인 방향, 토큰, 레이아웃 규칙을 기본값으로 따른다.

## 판단이 애매할 때

- 문서화된 아키텍처를 우선한다.
- 원격 서비스보다 로컬 파일 구조를 우선한다.
- 광범위한 재설계보다 명시된 제약을 우선한다.
- 구조 용어가 바뀌면 관련 문서를 함께 갱신한다.
