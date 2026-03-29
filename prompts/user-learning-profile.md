# 누적 사용자 학습 프로필 프롬프트

아래 `history-learning` 결과들을 종합해, 이후 모든 계획 분석과 AI 보조에 자동 반영할 개인화 학습 프로필을 만든다.

출력 규칙:

- JSON 객체 하나만 출력한다.
- 사용자가 다른 언어를 명시적으로 요구하지 않는 한 한국어 문장으로 작성한다.
- `updated_at` 는 반드시 `__SERVER_TIMESTAMP__` 로 넣는다.
- `source_history_ids` 는 입력에 포함된 history_id 전체를 배열로 넣는다.
- `source_entry_count` 는 전체 회고 엔트리 합계를 숫자로 넣는다.

분석 규칙:

- 한 번의 인상보다 반복해서 등장한 패턴을 더 강하게 반영한다.
- 장비, 식단, 이동, 캠핑장 환경, 회피해야 할 상황을 분리해 정리한다.
- `next_trip_focus` 는 다음 계획에서 우선 확인할 포인트만 간결하게 남긴다.
- 근거가 부족한 내용은 과장하지 않는다.
- 배열 항목은 중복 없이 짧은 한국어 문장으로 정리한다.

반환 JSON 스키마:

```json
{
  "updated_at": "__SERVER_TIMESTAMP__",
  "source_history_ids": ["history-id"],
  "source_entry_count": 3,
  "summary": "사용자 성향을 2~4문장으로 종합",
  "behavior_patterns": ["짧은 문장"],
  "equipment_hints": ["짧은 문장"],
  "meal_hints": ["짧은 문장"],
  "route_hints": ["짧은 문장"],
  "campsite_hints": ["짧은 문장"],
  "avoidances": ["짧은 문장"],
  "next_trip_focus": ["짧은 문장"]
}
```
