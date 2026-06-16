## 개요

React 앱이 렌더는 되나(#56/#74) 핵심 퀴즈 기능이 미배선 — "연습 답 보기 전용"이었음.

- 등급: **High** (진행 중 — GitHub #75)
- 대상: `src/store`, `src/components/quiz`, `src/components/layout`

---

## 미배선이던 기능
채점/제출(exam), 시험기록(addHistory), 오답모드(setReviewIds), 타이머 표시, 진행률, 오답노트.

## 1차 증분 (commit `11d4a8b`, 완료)
- store `graded` + `setGraded`, `clearAnswers`가 채점상태 리셋.
- 채점 헤더: 진행/타이머 + "채점하기" → 오답산출 → addHistory/setReviewIds/setGraded → 점수.
- 채점 후 정/오답·해설 공개 + 선택 잠금.
- `answerMode(review→exam)`로 오답 모드 동작.
- 검증: store 유닛 5 + react-grade E2E CI 그린.

## 남은 후속
- [ ] 오답노트 조회 UI
- [ ] 복수정답 연습 즉시 피드백
- [ ] 헤더 스타일

관련: #57(Track A 완성 후 Track B 제거), #63, #76
