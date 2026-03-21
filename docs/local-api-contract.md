# 로컬 API 계약

## 1. 문서 목적

이 문서는 로컬 웹 UI와 로컬 API 사이의 최소 계약을 정의한다.

목표:

- UI 구현 전에 요청/응답 형식을 고정
- 파일 읽기, AI 백엔드 호출, 저장 책임을 API 계층에 모음
- 브라우저가 OpenAI API 키를 직접 다루지 않도록 경계를 분명히 함

## 2. 기본 원칙

- 모든 API는 로컬 환경에서만 실행한다
- AI 백엔드 호출은 API 서버만 수행한다
- UI는 `trip_id` 와 사용자 액션 중심으로 요청한다
- 운영 데이터는 계속 `.camping-data/` 에 저장한다
- `trip_id` 는 데이터 모델의 파일명 규칙과 동일한 소문자 kebab-case를 따른다

## 2.1 입력 검증 규칙

- `trip_id` 는 `2026-04-18-gapyeong` 같은 소문자 kebab-case만 허용한다
- `trip_id` 에 `/`, `\\`, `.`, `..` 같은 경로 문자는 허용하지 않는다
- `trips/<trip-id>.yaml` 파일명과 YAML 내부 `trip_id` 는 반드시 같아야 한다
- 분석 요청은 날짜와 장소가 모두 비어 있으면 실패로 처리한다
- 날짜만 있거나 장소만 있는 경우는 경고와 함께 분석을 계속할 수 있다
- 동행자 정보가 비어 있으면 분석을 중단한다
- 출력 경로는 서버가 검증된 `trip_id` 로만 생성한다

## 3. 엔드포인트

### `GET /api/health`

목적:

- 로컬 API 실행 여부 확인

응답 예:

```json
{
  "status": "ok",
  "backend": "codex-cli",
  "ready": true,
  "auth_status": "ok",
  "model": "gpt-5.4",
  "message": "Logged in using ChatGPT"
}
```

### `GET /api/trips`

목적:

- trip 목록 조회

응답 예:

```json
{
  "items": [
    {
      "trip_id": "2026-04-18-gapyeong",
      "title": "4월 가평 가족 캠핑",
      "start_date": "2026-04-18",
      "end_date": "2026-04-19",
      "region": "gapyeong"
    }
  ]
}
```

### `GET /api/trips/:tripId`

목적:

- 특정 trip 상세 조회

응답 예:

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "data": {
    "version": 1,
    "title": "4월 가평 가족 캠핑"
  }
}
```

### `POST /api/validate-trip`

목적:

- 분석 전 입력 검증만 수행

요청 예:

```json
{
  "trip_id": "2026-04-18-gapyeong"
}
```

응답 예:

```json
{
  "status": "ok",
  "warnings": [
    "예상 날씨 정보가 없어 결과 정확도가 제한될 수 있습니다."
  ]
}
```

실패 응답 예:

```json
{
  "status": "failed",
  "error": {
    "code": "TRIP_INVALID",
    "message": "날짜와 장소가 모두 비어 있어 분석을 진행할 수 없습니다."
  }
}
```

### `POST /api/analyze-trip`

목적:

- trip 기준 분석 실행

요청 예:

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "override_instructions": "",
  "save_output": false
}
```

응답 예:

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "status": "completed",
  "warnings": [],
  "markdown": "# 캠핑 분석 결과\n\n## 1. 요약\n...",
  "output_path": null
}
```

저장 옵션 관련 규칙:

- `save_output: true` 분석에서 저장만 실패하면 HTTP 200으로 응답할 수 있다
- 이 경우 `status: "failed"` 와 `error.code: "OUTPUT_SAVE_FAILED"` 를 함께 내려주고, 생성된 `markdown` 본문은 유지한다
- UI는 이 응답을 치명적 분석 실패가 아니라 `결과는 생성됐지만 저장은 실패한 상태`로 처리해야 한다
- UI는 Markdown 본문을 유지한 채 `warning` 또는 partial-success 상태를 보여주고, 사용자가 다시 저장을 시도할 수 있어야 한다

### `POST /api/outputs`

목적:

- 생성된 Markdown 결과 저장

요청 예:

```json
{
  "trip_id": "2026-04-18-gapyeong",
  "markdown": "# 캠핑 분석 결과\n\n..."
}
```

응답 예:

```json
{
  "status": "saved",
  "output_path": ".camping-data/outputs/2026-04-18-gapyeong-plan.md"
}
```

## 4. 요청/응답 타입

### `TripSummary`

```ts
type TripSummary = {
  trip_id: TripId;
  title: string;
  start_date?: string;
  end_date?: string;
  region?: string;
};
```

### `TripId`

```ts
type TripId = string; // lowercase kebab-case only
```

### `AnalyzeTripRequest`

```ts
type AnalyzeTripRequest = {
  trip_id: TripId;
  override_instructions?: string;
  save_output?: boolean;
};
```

### `AnalyzeTripResponse`

```ts
type AnalyzeTripResponse = {
  trip_id: TripId;
  status: "completed" | "failed";
  warnings: string[];
  markdown?: string;
  output_path?: string | null;
  error?: {
    code: string;
    message: string;
  };
};
```

## 5. 오류 모델

권장 오류 코드:

- `INVALID_TRIP_ID_FORMAT`
- `TRIP_NOT_FOUND`
- `TRIP_INVALID`
- `DEPENDENCY_MISSING`
- `OPENAI_REQUEST_FAILED`
- `OUTPUT_SAVE_FAILED`
- `INTERNAL_ERROR`

오류 응답 예:

```json
{
  "status": "failed",
  "error": {
    "code": "TRIP_INVALID",
    "message": "동행자 정보가 비어 있어 분석을 진행할 수 없습니다."
  }
}
```

## 6. 저장 규칙

- 기본 출력 파일 경로는 `.camping-data/outputs/<trip-id>-plan.md`
- `save_output: true` 인 경우 분석 후 자동 저장
- `save_output: false` 인 경우 UI에서 별도 저장 요청 가능
- 저장 시 기존 파일은 덮어쓴다
- 저장 경로는 요청 본문이 아니라 서버가 검증한 `trip_id` 로만 계산한다

## 7. 보안 규칙

- 기본 인증은 로컬 `codex login` 세션을 사용한다
- `OPENAI_API_KEY` 는 fallback OpenAI 백엔드를 사용할 때만 로컬 API 프로세스 환경변수로 주입한다
- 로컬 실행 시 루트 `.env` 파일을 읽어 API와 web 설정을 공유할 수 있다
- 브라우저 번들에 키를 포함하지 않는다
- API 응답에 키나 내부 프롬프트 전체를 노출하지 않는다

## 8. 향후 확장 가능 항목

- `POST /api/reanalyze-section`
- `GET /api/preferences`
- `POST /api/cache/weather`

v1에서는 위 항목을 필수로 보지 않는다.
