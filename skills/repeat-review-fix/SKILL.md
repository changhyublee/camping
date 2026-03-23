---
name: repeat-review-fix
description: '현재 수정된 코드나 지정한 범위를 기준으로 코드리뷰를 수행하고, 리뷰에서 나온 actionable finding을 바로 수정하는 루프를 N회 반복합니다. 사용자가 "$repeat-review-fix", "repeat-review-fix", "수정리뷰 반복"이라고 말하거나 현재 변경사항을 여러 차례 리뷰하고 수정해달라고 요청할 때 사용합니다. 반복 횟수 N은 실행 시 입력할 수 있고, 빠졌거나 유효하지 않으면 입력 형식 힌트를 짧게 보여준 뒤 기본값 2회로 진행합니다.'
---

# Repeat Review Fix

## 개요

현재 수정된 코드 기준으로 리뷰를 수행하고, 리뷰에서 나온 actionable finding을 바로 수정하는 작업을 반복한다. 각 회차는 직전 수정이 반영된 최신 코드 상태를 기준으로 다시 시작하고, 수정이 있었다면 범위에 맞는 검증까지 수행한다.

이 저장소에서는 `skills/repeat-review-fix/SKILL.md` 가 기준 문서다. 명시적 호출이 필요하면 `$repeat-review-fix` 를 우선 사용하고, plain trigger로 `repeat-review-fix` 와 `수정리뷰 반복`도 같은 의도로 처리한다.

## 입력 계약

- 반복 횟수 `N` 은 선택 입력이다.
- 검토 대상 또는 작업 범위 설명은 선택 입력이다.
- 범위 설명이 없으면 현재 수정된 코드가 기본 대상이다.
- 아래 형식을 같은 의도로 처리한다.
  - `$repeat-review-fix [N] [검토대상]`
  - `repeat-review-fix [N] [검토대상]`
  - `수정리뷰 반복 [N] [검토대상]`

예시:

```text
$repeat-review-fix 3 현재 변경사항
repeat-review-fix 2 트립 분석 API 변경분
수정리뷰 반복 4 장비 관리 UI 수정분
skills/repeat-review-fix/SKILL.md 를 사용해서 현재 수정된 코드를 2회 리뷰-수정 반복해줘
```

## 반복 횟수 해석 규칙

1. `N` 은 1 이상의 정수로 해석한다.
2. `N` 이 빠졌거나 정수가 아니면 아래 힌트를 짧게 보여준 뒤, 추가 입력을 기다리며 멈추지 말고 기본값 `2` 로 진행한다.

```text
반복 횟수는 `$repeat-review-fix [N] [검토대상]`, `repeat-review-fix [N] [검토대상]`, 또는 `수정리뷰 반복 [N] [검토대상]` 형태로 지정할 수 있습니다. 입력이 없거나 유효하지 않으면 기본값 2회로 진행합니다.
```

3. 사용자가 범위도 생략하면 현재 워크트리의 수정 파일을 우선 검토 대상으로 본다.
4. 워크트리에 수정 파일이 없으면 현재 브랜치의 가장 최근 구현 범위를 검토 대상으로 삼고, 그 가정을 결과 보고에 명시한다.

## 리뷰 기준

- finding은 버그, 회귀, 요구사항 불일치, 계약 위반, 누락된 검증을 우선한다.
- 스타일 지적은 동작 리스크나 유지보수 리스크가 명확할 때만 포함한다.
- 결과 보고는 finding을 우선순위 순서대로 먼저 제시하고, 요약은 그 뒤에 짧게 붙인다.
- 수정은 근거가 명확하고 바로 해결 가능한 항목을 우선 반영한다.
- 회차가 바뀌면 이전 회차의 수정 결과를 반영한 최신 코드 기준으로 다시 리뷰한다.

## 이 저장소 추가 검증 축

- 로컬 우선 구조를 깨고 원격 서버 중심 흐름으로 바꾸지 않았는지 확인한다.
- 브라우저에서 OpenAI API를 직접 호출하지 않는지 확인한다.
- `.camping-data/` 의 실제 사용자 데이터를 커밋 대상으로 취급하지 않는지 확인한다.
- 개인 준비물을 사용자가 직접 관리하는 인벤토리 모델로 바꾸지 않았는지 확인한다.
- 문서 기준이 필요한 경우 `docs/requirements.md`, `docs/technical-architecture.md`, `docs/local-api-contract.md`, `docs/data-model.md` 우선순위로 해석한다.

## 회차별 실행 루프

1. 현재 diff, 관련 파일, 필요한 설계 문서를 읽고 리뷰 컨텍스트를 정리한다.
2. 최신 코드 기준으로 finding을 severity 순서로 정리한다.
3. 바로 수정 가능한 finding을 같은 회차 안에서 반영한다.
4. 수정한 범위에 맞는 테스트, lint, typecheck, build 중 필요한 검증만 실행한다.
5. 해결하지 못한 리스크와 검증하지 못한 항목을 기록하고 다음 회차로 넘긴다.

## 필수 작업 순서

1. `N` 과 검토 대상을 확정한다.
2. 현재 수정된 코드와 관련 문서, 테스트 진입점을 읽는다.
3. 1회차부터 `N` 회차까지 회차별 실행 루프를 반복한다.
4. 각 회차에서 finding, 실제 수정, 검증 결과를 남긴다.
5. 마지막 회차가 끝나면 남은 finding과 residual risk를 정리해 보고한다.

## 중단 및 보고 조건

아래 상황에서는 억지로 반복하지 말고 blocker로 보고한다.

- 요구사항, spec, 사용자 의도 충돌로 임의 해석이 필요한 경우
- 수정 대상이 사용자 변경과 충돌하거나 현재 범위를 벗어나는 경우
- 필요한 검증을 실행할 수 없는 환경 제약이 있는 경우
- 파괴적 조치나 권한 상승이 필요한데 승인되지 않은 경우

## 결과 보고

기본 응답에는 아래 구조를 포함한다.

````markdown
## Summary
- Scope:
- Repeat Count:
- Iterations Completed:

## Findings
1. High - [file]: issue, impact, required fix
2. Medium - [file]: issue, impact, required fix

## Iteration Log
1. Findings:
   Fixes:
   Validation:

## Final State
- Remaining Findings:
- Residual Risk:
- Not Executed:
````
