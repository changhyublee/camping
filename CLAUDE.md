# Claude 작업 지침

이 저장소에서 작업하는 Claude 또는 Claude 호환 에이전트는 [`AGENTS.md`](AGENTS.md)를 기본 저장소 지침 문서로 따른다.

## 최소 필수 규칙

- 큰 작업 전에 [`README.md`](README.md) 와 [`docs/requirements.md`](docs/requirements.md) 를 읽는다.
- 이 프로젝트를 로컬 우선 구조로 다룬다.
- 기본값으로 원격 서버 중심 설계를 도입하지 않는다.
- 기본 실행 구조는 로컬 웹 UI와 로컬 API다.
- OpenAI 호출은 브라우저가 아니라 로컬 API가 담당한다.
- 운영 사용자 데이터는 `./.camping-data/` 를 사용한다.
- `.camping-data/` 의 실제 사용자 데이터를 커밋하지 않는다.
- `docs/examples/` 는 예시로만 사용하고 운영 상태로 취급하지 않는다.
- `README.md` 는 프로젝트 개요, `docs/requirements.md` 는 요구사항 기준 문서로 유지한다.
- 개인 준비물 추천은 사용자 직접 입력 인벤토리가 아니라 조건과 동행자 정보에서 파생되는 결과여야 한다.
- 반복 사용 장비는 `id` 를 레코드 고유값으로 두고, 같은 종류를 묶을 때는 `kind` 를 사용한다.
- 모든 문서 본문은 한글로 작성한다.
- 사용자 응답, 진행 보고, 리뷰 결과는 기본적으로 한글로 작성하고, 사용자가 다른 언어를 명시적으로 요구한 경우에만 예외를 둔다.
- 화면 구성이나 스타일 작업 전에는 [`docs/design-spec.md`](docs/design-spec.md)를 읽고 그 규칙을 기본값으로 따른다.

## 읽기 순서

1. [`AGENTS.md`](AGENTS.md)
2. [`README.md`](README.md)
3. [`docs/requirements.md`](docs/requirements.md)
4. [`docs/index.md`](docs/index.md)
5. [`docs/design-spec.md`](docs/design-spec.md)
