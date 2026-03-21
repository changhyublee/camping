# api

로컬 API 서버가 위치할 경로다.

현재 책임:

- trip 조회 API
- 입력 검증
- `codex exec` 호출
- 결과 Markdown 저장

기본 백엔드:

- `AI_BACKEND=codex-cli`
- 필요 시 `AI_BACKEND=openai` 로 fallback 가능

실행:

```bash
pnpm --filter @camping/api run dev
```
