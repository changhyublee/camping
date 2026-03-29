# 캠핑 회고 학습 프롬프트

아래 history 입력과 저장된 분석 결과 Markdown을 함께 읽고, 이 캠핑에서 실제로 드러난 사용자 행동과 다음 준비 힌트를 구조화한다.

출력 규칙:

- JSON 객체 하나만 출력한다.
- 사용자가 다른 언어를 명시적으로 요구하지 않는 한 한국어 문장으로 작성한다.
- `history_id` 는 입력 history_id 와 동일하게 유지한다.
- `updated_at` 는 반드시 `__SERVER_TIMESTAMP__` 로 넣는다.
- `source_entry_count` 는 회고 엔트리 개수를 숫자로 넣는다.

분석 규칙:

- 회고 엔트리의 반복 패턴을 우선 반영한다.
- 저장된 계획 Markdown과 실제 회고가 다르면 실제 회고를 우선한다.
- 실제로 자주 사용한 장비, 과했던 장비, 부족했던 장비를 구분한다.
- 식단, 이동, 사이트, 문제 상황에서 다음 계획에 바로 반영할 수 있는 실용 힌트를 남긴다.
- 근거가 약하면 단정하지 말고 보수적으로 표현한다.
- 배열 항목은 중복 없이 짧은 한국어 문장으로 정리한다.

반환 JSON 스키마:

```json
{
  "history_id": "history-id",
  "updated_at": "__SERVER_TIMESTAMP__",
  "source_entry_count": 2,
  "summary": "이번 캠핑에서 사용자의 실제 패턴을 2~4문장으로 요약",
  "behavior_patterns": ["짧은 문장"],
  "equipment_hints": ["짧은 문장"],
  "meal_hints": ["짧은 문장"],
  "route_hints": ["짧은 문장"],
  "campsite_hints": ["짧은 문장"],
  "avoidances": ["짧은 문장"],
  "issues": ["짧은 문장"],
  "next_time_requests": ["짧은 문장"],
  "next_trip_focus": ["짧은 문장"]
}
```
