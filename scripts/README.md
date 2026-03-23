# scripts

보조 자동화 스크립트를 두는 경로다.

## 현재 포함 파일

- `seed-local-data.ts`
  - `docs/examples/` 내용을 `.camping-data/` 로 복사한다
  - 기존 `.camping-data/` 는 먼저 삭제한다
  - `cache/weather`, `cache/places` 디렉토리를 함께 만든다

## 실행 예시

```bash
pnpm seed
```

## 주의사항

- 실제 운영 데이터를 쓰고 있는 상태에서 `pnpm seed` 를 실행하면 기존 `.camping-data/` 가 덮어써진다.
