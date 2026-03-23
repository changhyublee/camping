# 프로젝트 세팅 체크리스트

## 1. 문서 목적

이 문서는 `2026-03-23` 기준 현재 저장소에 이미 포함된 항목과, 새 환경에서 실제로 실행하기 전에 확인할 항목을 구분해서 정리한다.

## 2. 현재 저장소에 이미 포함된 항목

### 문서와 기준

- [x] `README.md`
- [x] `docs/index.md`
- [x] `docs/requirements.md`
- [x] `docs/menu-structure.md`
- [x] `docs/technical-architecture.md`
- [x] `docs/local-ui-transition-plan.md`
- [x] `docs/design-spec.md`
- [x] `docs/local-api-contract.md`
- [x] `docs/ui-flow.md`
- [x] `docs/data-model.md`
- [x] `docs/trip-analysis-workflow.md`
- [x] `docs/mvp-scope.md`
- [x] `docs/directory-structure.md`
- [x] `docs/example-files.md`
- [x] `docs/local-skills.md`

### 저장소 구조

- [x] `apps/web/`
- [x] `apps/api/`
- [x] `shared/`
- [x] `prompts/`
- [x] `schemas/`
- [x] `scripts/`
- [x] `skills/`
- [x] `.env.example`
- [x] `.gitignore` 에 `.camping-data/`, `.camping-backups/`, `.env`, `.env.local`, `.env.*.local`, `node_modules/`, `dist/` 반영

### 웹과 API 구현

- [x] 메뉴형 로컬 웹 UI
- [x] 동행자 CRUD
- [x] 캠핑 계획 CRUD
- [x] trip 검증과 백그라운드 분석 실행
- [x] 분석 상태 조회와 중복 실행 방지
- [x] planning assistant 응답
- [x] 결과 Markdown 저장과 다시 열기
- [x] 장비 CRUD
- [x] 장비 카테고리 CRUD
- [x] 히스토리 조회/수정/삭제와 아카이브
- [x] 외부 링크 CRUD

### 공통 자산과 보조 파일

- [x] `prompts/system.md`
- [x] `prompts/trip-analysis.md`
- [x] `schemas/codex-trip-analysis-output.schema.json`
- [x] `scripts/seed-local-data.ts`
- [x] `docs/examples/` 예시 데이터 세트
- [x] `skills/repeat-review-fix/`

## 3. 새 환경에서 실행 전에 확인할 항목

### 런타임과 인증

- [ ] Node.js 22 이상 설치
- [ ] pnpm 10 이상 설치
- [ ] `codex` CLI 설치
- [ ] `codex login` 완료
- [ ] 필요 시 `OPENAI_API_KEY` fallback 준비

### 의존성 설치와 로컬 데이터 준비

- [ ] `pnpm install`
- [ ] `cp .env.example .env`
- [ ] 필요 시 `.env` 에서 메타데이터 수집 전용 키 주석 해제 여부 확인
- [ ] `.camping-data/` 가 아직 없을 때만 `pnpm seed`
- [ ] 기존 운영 데이터가 있으면 `pnpm backup:data` 또는 `pnpm seed -- --replace` 기준으로 백업 후 판단
- [ ] `.camping-data/` 가 예시 파일 기준으로 생성되었는지 확인

## 4. 새 환경 실행 체크리스트

1. `pnpm install`
2. `cp .env.example .env`
3. 필요 시 `.env` 의 `CODEX_METADATA_MODEL`, `CODEX_METADATA_REASONING_EFFORT`, `OPENAI_METADATA_MODEL` 주석 해제
4. `codex login`
5. 새 환경이면 `pnpm seed`
6. 기존 운영 데이터를 예시 데이터로 교체해야 할 때만 `pnpm seed -- --replace`
7. `pnpm dev:api`
8. `pnpm dev:web`
9. `GET /api/health` 확인
10. 웹 UI에서 trip 1건 저장 후 `분석 중...` 상태, 완료 후 결과 자동 갱신, 삭제/히스토리 이동 제어를 확인
11. 필요하면 `pnpm typecheck`, `pnpm test`, `pnpm build`

## 5. 환경별 검증이 필요한 항목

아래 항목은 저장소에 코드가 있어도, 현재 머신에서 실제로 한 번 더 확인해야 한다.

- [ ] `pnpm dev` 로 API와 Web 동시 실행 확인
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Codex CLI 인증 상태에서 `GET /api/health` 의 ready 상태 확인
- [ ] OpenAI fallback 사용 시 `AI_BACKEND=openai` 경로 확인

## 6. 참고 메모

- `pnpm backup:data` 는 현재 `.camping-data/` 를 `.camping-backups/<timestamp>/` 에 수동 백업한다.
- `pnpm seed` 는 새 환경 초기화용이며, 기존 `.camping-data/` 가 있으면 중단한다.
- `pnpm seed -- --replace` 는 기존 `.camping-data/` 를 `.camping-backups/<timestamp>/` 에 백업한 뒤 `docs/examples/` 를 다시 복사한다.
- `cache/analysis-jobs/` 는 예시 시드 파일이 아니라 분석 실행 시 런타임에 생성되는 상태 디렉토리다.
- `.camping-data/` 는 운영 데이터 경로이며 Git 커밋 대상이 아니다.
- `.camping-backups/` 는 운영 데이터 백업 경로이며 Git 커밋 대상이 아니다.
- 개인 준비물은 저장소에서 직접 관리하는 인벤토리가 아니라 분석 결과다.
- `.env.example` 에는 메타데이터 수집 전용 키가 이미 주석 상태로 포함되어 있다.
