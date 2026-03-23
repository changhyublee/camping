# 예시 파일

## 1. 문서 목적

이 문서는 현재 구조에 맞는 예시 입력/출력 파일을 정리한다.

## 2. 예시 파일 위치

예시 파일은 `docs/examples/` 아래에 둔다.

- [`docs/examples/profile.yaml`](examples/profile.yaml)
- [`docs/examples/companions.yaml`](examples/companions.yaml)
- [`docs/examples/vehicles.yaml`](examples/vehicles.yaml)
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
2. 실제 운영 시에는 `pnpm seed` 로 `.camping-data/` 아래에 복사한다
3. 기존 `.camping-data/` 가 이미 있으면 `pnpm seed` 는 중단되며, 예시 데이터로 다시 채우려면 `pnpm seed -- --replace` 를 사용한다
4. 복사 후 `cache/weather`, `cache/places` 디렉토리도 함께 만든다
5. `cache/analysis-jobs/` 는 예시 복사 대상이 아니라 실제 분석 실행 중에 생성되는 런타임 상태 경로다
6. UI에서 계획, 장비, 히스토리, 링크를 함께 확인한다

## 4. 파일별 설명

- `companions.yaml`: 동행자 ID 기준 목록과 이름/연령대/건강 정보
- `vehicles.yaml`: 차량 ID 기준 목록과 표시 이름/탑승 인원/적재량/메모
- `equipment/*.yaml`: 장비, 소모품, 점검 항목
- `equipment/categories.yaml`: 장비 섹션별 카테고리 코드와 표시 이름
- `trips/*.yaml`: 앞으로 갈 계획
- `history/*.yaml`: 완료된 캠핑 기록과 당시 사람/차량 스냅샷
- `links.yaml`: 참고용 외부 링크 북마크
- `outputs/*.md`: 분석 결과 형식 예시
- `cache/analysis-jobs/*.json`: 예시 파일로 제공하지 않고 실제 분석 실행 중에 생성되는 상태 캐시

출력 예시 해석 원칙:

- `docs/examples/outputs/*.md` 는 형식 예시다.
- 이동/주변 장소 예시는 실제 운영 데이터나 외부 검증이 완료된 추천 목록으로 간주하지 않는다.
- 다음 캠핑 추천과 확인용 링크도 형식 예시이며, 실제 예약/운영 여부는 다시 확인해야 한다.
- 장소 데이터가 부족한 상황에서도 결과 문서가 어떤 형태로 보여야 하는지 설명하기 위한 샘플로 본다.
