# 기술 아키텍처

## 1. 문서 목적

이 문서는 현재 프로젝트를 `운영형 로컬 캠핑 관리자` 로 구현하기 위한 기술 방향을 정리한다.

## 2. 핵심 전제

- 원격 서버 없이 로컬 우선 구조를 유지한다
- 브라우저 UI는 로컬 API만 호출한다
- 실제 운영 데이터는 `./.camping-data/` 에 저장한다
- 동행자, 장비, 계획, 히스토리, 링크는 YAML로 저장한다
- 분석 결과는 Markdown으로 저장한다
- 기본 분석 백엔드는 로컬 `codex exec` 이다

## 3. 권장 구조

```text
브라우저 UI
  -> 로컬 API
    -> .camping-data/ YAML 읽기/쓰기
    -> docs/, prompts/, schemas/ 참조
    -> 로컬 codex CLI 또는 fallback AI 백엔드 호출
    -> outputs/*.md 저장
```

## 4. 상위 역할 분리

- `apps/web`
  - 대시보드
  - 장비 관리
  - 관리 설정
  - 캠핑 계획 편집/분석
  - 계획 화면 내 동행자 인라인 관리
  - 히스토리 관리
  - 외부 링크 관리
- `apps/api`
  - CRUD 요청 검증
  - YAML 파일 읽기/쓰기
  - 동행자 CRUD
  - 장비 카테고리 CRUD
  - 계획 아카이브
  - 분석 실행
  - AI 보조 응답 생성
- `.camping-data`
  - 운영 데이터 저장

## 5. 로컬 저장 구조

```text
./.camping-data/
├── profile.yaml
├── companions.yaml
├── equipment/
│   ├── categories.yaml
│   ├── durable.yaml
│   ├── consumables.yaml
│   └── precheck.yaml
├── preferences/
│   ├── travel.yaml
│   └── food.yaml
├── trips/
├── history/
├── outputs/
├── links.yaml
└── cache/
```

## 6. 메뉴별 기술 책임

### 대시보드

- 여러 API 응답을 조합해 현황을 계산한다
- 별도 저장 데이터는 만들지 않는다

### 장비 관리

- `equipment/*.yaml` 에 직접 CRUD 한다
- 반복 장비, 소모품, 점검 항목을 분리한다
- 카테고리는 자유 입력이 아니라 `equipment/categories.yaml` 기반 셀렉트로 선택한다
- 기존 장비에만 남아 있는 카테고리 값도 화면에서 깨지지 않도록 병합해 표시한다

### 관리 설정

- `equipment/categories.yaml` 에 섹션별 카테고리 코드와 표시 이름을 저장한다
- 반복 장비, 소모품, 출발 전 점검 섹션별 카테고리를 추가/수정/삭제한다
- 이미 사용 중인 카테고리와 마지막 남은 카테고리는 삭제를 막는다

### 캠핑 계획

- `trips/*.yaml` 를 CRUD 한다
- `companions.yaml` 을 계획 화면에서 함께 관리한다
- 동행자 ID는 소문자 kebab-case를 사용한다
- AI 보조는 제안을 반환하지만 자동 저장하지 않는다
- 분석 결과 저장은 `outputs/*.md` 로 분리한다

초기 로딩 원칙:

- `companions` 조회 실패는 경고로 격리하고 다른 메뉴 데이터 로딩은 계속 진행한다

### 캠핑 히스토리

- 계획 완료 시 `history/*.yaml` 로 아카이브한다
- 히스토리는 계획과 다른 파일 단위로 관리한다

### 외부 링크

- `links.yaml` 하나로 관리한다
- 외부 API 연동이 아니라 사용자 북마크 CRUD 를 우선한다

## 7. OpenAI 연동 원칙

- 브라우저에서 직접 OpenAI API를 호출하지 않는다
- 로컬 API가 `codex login` 세션 또는 `OPENAI_API_KEY` 를 사용한다
- 계획 보조와 분석 실행 모두 서버를 통해서만 모델을 호출한다
- 모델이 응답하지 못해도 UI CRUD 자체는 계속 동작해야 한다
