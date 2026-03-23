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

현재 planning assistant 프롬프트는 `prompts/` 파일이 아니라
`apps/api/src/services/planning-assistant.ts` 안에서 직접 조합한다.
