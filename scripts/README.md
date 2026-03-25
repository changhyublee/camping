# scripts

보조 자동화 스크립트를 두는 경로다.

## 현재 포함 파일

- `backup-local-data.ts`
  - 현재 `.camping-data/` 상태를 `.camping-backups/<timestamp>/` 에 백업한다
- `seed-local-data.ts`
  - 새 환경에서 `docs/examples/` 내용을 `.camping-data/` 로 복사한다
  - 기존 `.camping-data/` 가 있으면 기본 실행은 중단한다
  - `--replace` 사용 시 현재 `.camping-data/` 를 `.camping-backups/<timestamp>/` 에 먼저 백업한 뒤 예시 데이터로 교체한다
  - `cache/weather`, `cache/places`, `cache/campsite-tips` 디렉토리를 함께 만든다

## 실행 예시

```bash
pnpm backup:data
pnpm seed
pnpm seed -- --replace
```

## 주의사항

- `pnpm seed` 는 새 clone 또는 테스트용 예시 데이터 초기화에만 사용한다.
- 실제 운영 데이터를 이미 쓰고 있으면 먼저 `pnpm backup:data` 로 수동 백업을 만들거나, `pnpm seed -- --replace` 로 자동 백업 후 교체한다.
