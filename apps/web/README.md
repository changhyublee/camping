# web

로컬 브라우저 UI 패키지다. React + Vite 기반으로 동작하며 로컬 API만 호출한다.

## 현재 화면

- 대시보드
- 장비 관리
- 캠핑 계획
- 캠핑 히스토리
- 외부 링크
- 관리 설정

## 현재 책임

- 계획, 히스토리, 링크, 장비 데이터 조회와 편집
- 동행자 인라인 관리
- AI planning assistant 호출과 제안 적용
- 분석 결과 Markdown 렌더링
- 히스토리 결과 다시 열기
- 장비 카테고리 관리

## UI 동작 메모

- 기본 API 주소는 `http://localhost:8787`
- 필요하면 `VITE_API_BASE_URL` 로 변경할 수 있다
- 선택한 페이지, 계획, 히스토리, 장비 섹션은 로컬 저장소에 유지한다

## 현재 소스 구조

- `src/App.tsx`
  - 전체 화면 상태와 메뉴형 UI
- `src/api/client.ts`
  - API 클라이언트
- `src/components/`
  - 공통 카드, 결과, 상태 배너 컴포넌트
- `src/styles/app.css`
  - 화면 스타일

## 실행과 검증

```bash
pnpm --filter @camping/web run dev
pnpm --filter @camping/web run test
pnpm --filter @camping/web run typecheck
pnpm --filter @camping/web run build
```
