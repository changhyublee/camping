# api

로컬 웹 UI가 호출하는 Fastify 기반 API 서버 패키지다.

## 현재 책임

- `GET /api/health`
- data backup 조회/생성
- companions CRUD
- trips CRUD
- trip 검증과 분석 실행
- planning assistant 응답 생성
- outputs 저장과 조회
- equipment CRUD
- equipment category CRUD
- history 조회/수정/삭제와 trip 아카이브
- links CRUD
- 서버 시작 시 로컬 운영 데이터 자동 백업

## 런타임 기준

- 기본 포트: `8787`
- 기본 분석 백엔드: `codex-cli`
- fallback 분석 백엔드: `openai`
- CORS 허용: 로컬 웹 UI 호출 기준

## 주요 환경 변수

- `API_PORT`
- `AI_BACKEND`
- `CODEX_BIN`
- `CODEX_MODEL`
- `CODEX_METADATA_MODEL`
- `CODEX_METADATA_REASONING_EFFORT`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_METADATA_MODEL`

메타데이터 수집 관련 기본값:

- `CODEX_METADATA_MODEL`: `gpt-5.4-mini`
- `CODEX_METADATA_REASONING_EFFORT`: `low`
- `OPENAI_METADATA_MODEL`: `gpt-5-mini`

`.env.example` 에는 위 메타데이터 전용 키가 주석 상태로 포함되어 있으며, `.env` 로 복사한 뒤 필요할 때만 주석을 해제해 덮어쓸 수 있다.

## 현재 소스 구조

- `src/index.ts`
  - 서버 부팅
- `src/server.ts`
  - Fastify 인스턴스와 에러 핸들러 구성
- `src/routes/api-routes.ts`
  - API 라우트 등록
- `src/file-store/camping-repository.ts`
  - `.camping-data/` YAML/Markdown 읽기와 쓰기
  - `.camping-backups/` 스냅샷 백업 생성과 조회
- `src/services/`
  - 분석, planning assistant, prompt 조합, 검증, 모델 호출

## 실행과 검증

```bash
pnpm --filter @camping/api run dev
pnpm --filter @camping/api run test
pnpm --filter @camping/api run typecheck
```

## 테스트 범위

현재 `tests/` 에는 아래 범위가 포함되어 있다.

- 서버 엔드포인트 동작
- config 해석
- prompt builder
- Codex/OpenAI 클라이언트 경로
