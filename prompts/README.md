# prompts

로컬 API가 분석 실행 시 사용하는 프롬프트 파일 경로다.

## 현재 파일

- `system.md`
  - 분석 모델에 주는 공통 시스템 지침
- `trip-analysis.md`
  - trip 분석 요청 본문 템플릿

## 사용 위치

- `apps/api/src/services/analysis-service.ts`
- `apps/api/src/services/prompt-builder.ts`

응답 언어 기준:

- `system.md` 와 `trip-analysis.md` 는 기본 응답 언어를 한글로 고정하는 기준 프롬프트다.
- 사용자가 영어 등 다른 언어를 명시적으로 요구한 경우에만 예외를 둔다.

현재 planning assistant 프롬프트는 `prompts/` 파일이 아니라
`apps/api/src/services/planning-assistant.ts` 안에서 직접 조합한다.
이 경로도 기본 응답 언어를 한글로 유지해야 한다.
