# 로컬 스킬

## 1. 문서 목적

이 문서는 현재 저장소 안에서 함께 관리하는 로컬 Codex skill 패키지 구조와 사용 규칙을 정리한다.

## 2. 현재 위치

로컬 스킬은 저장소 루트의 `skills/` 아래에 둔다.

현재 구조:

```text
skills/
  repeat-review-fix/
    SKILL.md
    agents/
      openai.yaml
```

## 3. 현재 포함된 스킬

### `repeat-review-fix`

역할:

- 현재 수정된 코드 또는 지정한 범위를 기준으로 코드리뷰 수행
- 리뷰에서 나온 actionable finding을 바로 수정
- 최신 수정 상태를 기준으로 다시 리뷰
- 이 루프를 최대 `N` 회 반복
- 단, 회차 중 finding이 없거나 실제 수정 사항이 없으면 조기 종료

실행 표현:

- `$repeat-review-fix`
- `repeat-review-fix`
- `수정리뷰 반복`

입력 규칙:

- `N` 은 선택 입력이다
- 입력이 없거나 유효하지 않으면 형식 힌트를 짧게 보여준 뒤 기본값 `2` 회로 진행한다
- 범위 설명이 없으면 현재 수정된 코드가 기본 대상이다
- 회차 중 finding이 없거나 실제 수정 사항이 없으면 남은 반복 횟수와 관계없이 종료한다

예시:

```text
$repeat-review-fix 3 현재 변경사항
repeat-review-fix 2 트립 분석 API 변경분
수정리뷰 반복 4 장비 관리 UI 수정분
skills/repeat-review-fix/SKILL.md 를 사용해서 현재 수정된 코드를 2회 리뷰-수정 반복해줘
```

기준 문서:

- `skills/repeat-review-fix/SKILL.md`

## 4. 운영 원칙

- 이 저장소의 로컬 스킬은 `yy-docs/skills` 의 shared `jmc-` namespace와 별개다.
- 스킬 소스 오브 트루스는 저장소 안 `skills/` 디렉토리다.
- 스킬 본문과 관련 문서는 저장소의 한글 문서 기준을 따른다.
- 로컬 스킬이 만드는 사용자 응답과 결과 보고도 기본적으로 한글로 작성한다.
- 영어 또는 다른 언어는 사용자가 명시적으로 요구한 경우에만 사용한다.
- 화면 구현이나 스타일 수정을 포함한 스킬 작업은 `docs/design-spec.md` 를 기본 디자인 기준으로 따른다.
- 필요하면 `agents/openai.yaml` 을 함께 두되, 핵심 규칙은 `SKILL.md` 에 둔다.

## 5. 사용 시 주의사항

- 환경에 따라 저장소 로컬 `skills/` 가 세션에서 자동 발견되지 않을 수 있다.
- 자동 발견이 되지 않으면 `skills/<skill-name>/SKILL.md` 를 직접 참조하는 방식으로 호출한다.
- 스킬 구조나 호출 규칙이 바뀌면 `README.md`, `docs/index.md`, `docs/directory-structure.md` 도 함께 갱신한다.
