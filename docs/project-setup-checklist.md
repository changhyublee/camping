# 프로젝트 세팅 체크리스트

## 1. 문서 목적

이 문서는 현재 문서 기준으로 실제 프로젝트 세팅 순서를 체크리스트로 정리한다.

이 문서의 체크리스트는 `새 환경에서 이 저장소를 처음 실행할 때`를 기준으로 본다.

목표:

- 무엇부터 만들지 순서를 고정
- 빠르게 실행 가능한 상태로 진입
- 문서만 있고 구현이 멈추는 상태를 방지

## 2. 세팅 우선순위

### 1단계. 문서 기준 확정

- [ ] 문서 한글 작성 원칙 확인
- [ ] [`README.md`](../README.md) 방향 확정
- [ ] [`requirements.md`](requirements.md) 요구사항 확정
- [ ] [`technical-architecture.md`](technical-architecture.md) 구조 확정
- [ ] [`local-ui-transition-plan.md`](local-ui-transition-plan.md) 작업 목록 확정
- [ ] [`local-api-contract.md`](local-api-contract.md) API 계약 확정
- [ ] [`ui-flow.md`](ui-flow.md) 화면 흐름 확정
- [ ] [`data-model.md`](data-model.md) 필드 확정
- [ ] [`trip-analysis-workflow.md`](trip-analysis-workflow.md) 흐름 확정
- [ ] [`mvp-scope.md`](mvp-scope.md) 범위 확정

### 2단계. 저장소 뼈대 생성

- [ ] `apps/web/` 디렉토리 생성
- [ ] `apps/api/` 디렉토리 생성
- [ ] `shared/` 디렉토리 생성
- [ ] `prompts/` 디렉토리 생성
- [ ] `schemas/` 디렉토리 생성
- [ ] `scripts/` 디렉토리 생성
- [ ] `.gitignore` 에 `.camping-data/`, `.env*`, `node_modules/`, `dist/` 추가

### 3단계. 환경 변수와 런타임 세팅

- [ ] `.env.example` 작성
- [ ] `codex login` 기반 인증 방식 정리
- [ ] fallback 용 `OPENAI_API_KEY` 사용 방식 정리
- [ ] 기본 모델명을 환경변수 또는 로컬 설정으로 분리
- [ ] 패키지 매니저와 Node 런타임 버전 기준 확정

### 4단계. 프론트엔드 뼈대 생성

- [ ] `apps/web` 초기 프로젝트 생성
- [ ] trip 목록/상세 화면 기본 레이아웃 작성
- [ ] 분석 실행 버튼과 상태 표시 추가
- [ ] 결과 Markdown 렌더링 영역 추가

### 5단계. 로컬 API 뼈대 생성

- [ ] `apps/api` 초기 프로젝트 생성
- [ ] `GET /api/trips` 구현
- [ ] `GET /api/trips/:tripId` 구현
- [ ] `POST /api/analyze-trip` 구현
- [ ] `POST /api/outputs` 구현

### 6단계. 프롬프트 파일 준비

- [ ] `prompts/system.md` 작성
- [ ] `prompts/trip-analysis.md` 작성
- [ ] 출력 포맷 규칙 검토

### 7단계. 예시 데이터 세트 준비

- [ ] `docs/examples/profile.yaml` 검토
- [ ] `docs/examples/companions.yaml` 검토
- [ ] `docs/examples/equipment/*.yaml` 검토
- [ ] `docs/examples/preferences/*.yaml` 검토
- [ ] `docs/examples/trips/*.yaml` 검토
- [ ] `docs/examples/outputs/*.md` 검토

### 8단계. 실제 로컬 데이터 세팅

- [ ] `.camping-data/` 생성
- [ ] `profile.yaml` 생성
- [ ] `companions.yaml` 생성
- [ ] `equipment/` 생성
- [ ] `preferences/` 생성
- [ ] `trips/` 생성
- [ ] `outputs/` 생성

### 9단계. 최소 실행 루프 확보

- [ ] 예시 trip 파일 1개 준비
- [ ] UI에서 trip 조회 확인
- [ ] 분석 요청 1회 실행
- [ ] 결과 Markdown 렌더링 확인
- [ ] 결과 Markdown 저장 확인
- [ ] 입력값 수정 후 재실행

### 10단계. 보조 자동화

- [ ] `scripts/validate-data` 작성 여부 검토
- [ ] `scripts/analyze-trip` 작성 여부 검토
- [ ] 템플릿 생성 로직 검토

## 3. 가장 먼저 해야 할 실제 작업

착수 직후 추천 순서:

1. `.gitignore` 와 `.env.example` 정리
2. `apps/web`, `apps/api`, `shared` 디렉토리 생성
3. `prompts/` 디렉토리 생성
4. `docs/examples/` 기준으로 `.camping-data/` 샘플 생성
5. 로컬 API에서 Codex CLI 호출 1회 연결

## 4. 세팅 완료 기준

아래가 가능하면 프로젝트 세팅이 된 것으로 본다.

- 로컬 데이터 저장 경로가 정해져 있다
- 로컬 웹 UI와 로컬 API가 분리되어 있다
- 예시 입력 파일이 있다
- 프롬프트 파일이 있다
- UI에서 trip 1건을 분석할 수 있다
- 결과 Markdown이 생성된다

## 5. 현재 기준 실행 순서

1. `pnpm install`
2. `cp .env.example .env`
3. `codex login`
4. `pnpm seed`
5. `pnpm dev:api`
6. `pnpm dev:web`
7. `GET /api/health` 와 trip 목록 확인
8. UI에서 trip 1건 분석 실행
9. 필요하면 `pnpm typecheck`, `pnpm test`, `pnpm build`
