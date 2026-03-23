# 디렉토리 구조

## 1. 문서 목적

이 문서는 현재 저장소와 로컬 운영 데이터의 경로 책임을 정의한다.

## 2. 최상위 구조

```text
.
├── README.md
├── docs/
├── apps/
├── prompts/
├── schemas/
├── scripts/
├── skills/
├── shared/
└── .camping-data/
```

## 3. 주요 디렉토리 책임

- `docs/`
  - 설계 문서, 예시 파일
- `apps/web/`
  - 메뉴형 로컬 UI
- `apps/api/`
  - 로컬 API 서버
- `shared/`
  - 공통 타입과 스키마
- `skills/`
  - 현재 저장소에서 재사용하는 로컬 Codex skill 패키지
- `.camping-data/`
  - 실제 운영 데이터

## 4. `.camping-data/` 내부 구조

```text
.camping-data/
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

## 5. 경로별 책임

- `trips/`: 예정된 캠핑 계획
- `history/`: 완료된 캠핑 히스토리
- `outputs/`: 분석 결과 Markdown
- `links.yaml`: 사용자 북마크 링크
- `equipment/categories.yaml`: 장비 섹션별 카테고리 코드와 표시 이름
