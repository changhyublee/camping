# Example Files

## 1. 문서 목적

이 문서는 현재 설계에 맞는 예시 입력 파일과 예시 출력 파일을 정리한다.

예시 파일의 목적:

- 실제 `.camping-data/` 구성을 쉽게 시작
- YAML 구조를 문서가 아니라 파일 단위로 확인
- Codex CLI 분석 전에 샘플 데이터를 검토

## 2. 예시 파일 위치

예시 파일은 `docs/examples/` 아래에 둔다.

목록:

- [`docs/examples/profile.yaml`](/Users/leech/workspace/camping/camping/docs/examples/profile.yaml)
- [`docs/examples/companions.yaml`](/Users/leech/workspace/camping/camping/docs/examples/companions.yaml)
- [`docs/examples/equipment/durable.yaml`](/Users/leech/workspace/camping/camping/docs/examples/equipment/durable.yaml)
- [`docs/examples/equipment/consumables.yaml`](/Users/leech/workspace/camping/camping/docs/examples/equipment/consumables.yaml)
- [`docs/examples/equipment/precheck.yaml`](/Users/leech/workspace/camping/camping/docs/examples/equipment/precheck.yaml)
- [`docs/examples/preferences/travel.yaml`](/Users/leech/workspace/camping/camping/docs/examples/preferences/travel.yaml)
- [`docs/examples/preferences/food.yaml`](/Users/leech/workspace/camping/camping/docs/examples/preferences/food.yaml)
- [`docs/examples/trips/2026-04-18-gapyeong.yaml`](/Users/leech/workspace/camping/camping/docs/examples/trips/2026-04-18-gapyeong.yaml)
- [`docs/examples/outputs/2026-04-18-gapyeong-plan.md`](/Users/leech/workspace/camping/camping/docs/examples/outputs/2026-04-18-gapyeong-plan.md)

## 3. 사용 방법

권장 방식:

1. `docs/examples/` 파일을 참고한다
2. 실제 운영 시에는 내용을 복사해 `.camping-data/` 아래에 저장한다
3. trip 파일만 바꿔가며 반복 분석한다

## 4. 파일별 설명

### `profile.yaml`

- 사용자 기본 지역
- 기본 차량
- 단위 설정

### `companions.yaml`

- 동행자 연령대
- 건강 특이사항
- 복용약

### `equipment/*.yaml`

- 보유 장비
- 소모품 잔량
- 출발 전 점검 항목

### `preferences/*.yaml`

- 이동 취향
- 음식/요리 취향

### `trips/*.yaml`

- 실제 분석 요청 단위

### `outputs/*.md`

- 결과 문서 예시

## 5. 예시 데이터의 의도

현재 예시는 아래 상황을 기준으로 작성했다.

- 서울 출발
- 가평 1박 2일 가족 캠핑
- 성인 1명과 유치원생 1명 동행
- 봄철 일교차가 큰 환경
- 저녁 바비큐, 아침 간단식 선호

이 시나리오를 기준으로
연령대별 개인 준비물, 장비 추천, 요리 제안, 이동/주변 추천이 어떻게 연결되는지 확인할 수 있다.

## 6. 다음 단계

이 예시 파일을 기준으로 다음을 진행하면 된다.

1. 실제 `.camping-data/` 샘플 생성
2. trip 파일 변경
3. Codex CLI 분석 실행
4. 결과 Markdown 비교
