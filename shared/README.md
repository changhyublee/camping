# shared

프론트엔드와 API가 공통으로 쓰는 타입, 검증 스키마, 상수, 유틸을 두는 패키지다.

## 현재 포함 항목

- `src/schemas.ts`
  - Zod 기반 요청/응답, 데이터 모델 스키마
- `src/types.ts`
  - 스키마 기반 TypeScript 타입
- `src/constants.ts`
  - 연령대, 장비 섹션, 상태, 링크 카테고리 라벨과 기본 카테고리
- `src/utils.ts`
  - ID, 경로, summary, 카테고리 복제 관련 유틸

## 사용 목적

- API와 Web의 데이터 계약을 한곳에서 유지
- 요청 본문 검증 규칙을 중복 없이 사용
- 화면 라벨과 기본 카테고리 기준을 공유
