# 예시 파일

## 1. 문서 목적

이 문서는 현재 구조에 맞는 예시 입력/출력 파일을 정리한다.

## 2. 예시 파일 위치

예시 파일은 `docs/examples/` 아래에 둔다.

- [`docs/examples/profile.yaml`](examples/profile.yaml)
- [`docs/examples/companions.yaml`](examples/companions.yaml)
- [`docs/examples/equipment/durable.yaml`](examples/equipment/durable.yaml)
- [`docs/examples/equipment/consumables.yaml`](examples/equipment/consumables.yaml)
- [`docs/examples/equipment/precheck.yaml`](examples/equipment/precheck.yaml)
- [`docs/examples/equipment/categories.yaml`](examples/equipment/categories.yaml)
- [`docs/examples/preferences/travel.yaml`](examples/preferences/travel.yaml)
- [`docs/examples/preferences/food.yaml`](examples/preferences/food.yaml)
- [`docs/examples/trips/2026-04-18-gapyeong.yaml`](examples/trips/2026-04-18-gapyeong.yaml)
- [`docs/examples/history/2026-03-08-yangpyeong.yaml`](examples/history/2026-03-08-yangpyeong.yaml)
- [`docs/examples/links.yaml`](examples/links.yaml)
- [`docs/examples/outputs/2026-04-18-gapyeong-plan.md`](examples/outputs/2026-04-18-gapyeong-plan.md)

## 3. 사용 방법

1. `docs/examples/` 파일을 참고한다
2. 실제 운영 시에는 `.camping-data/` 아래로 복사한다
3. UI에서 계획, 장비, 히스토리, 링크를 함께 확인한다

## 4. 파일별 설명

- `companions.yaml`: 동행자 ID 기준 목록과 이름/연령대/건강 정보
- `equipment/*.yaml`: 장비, 소모품, 점검 항목
- `equipment/categories.yaml`: 장비 섹션별 카테고리 코드와 표시 이름
- `trips/*.yaml`: 앞으로 갈 계획
- `history/*.yaml`: 완료된 캠핑 기록
- `links.yaml`: 참고용 외부 링크 북마크
- `outputs/*.md`: 분석 결과 예시
