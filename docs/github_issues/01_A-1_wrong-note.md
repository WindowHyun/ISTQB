## 버그 개요

오답 노트(틀린 문제 다시 보기) 기능이 정상 동작하지 않습니다. 오답 재채점(`review`) 모드에서 채점하면 오답 노트가 비어 있거나 잘못 표시됩니다.

- 등급: **Critical**
- 대상 파일: `www/script.js`

---

## 재현 절차

1. 시험(`exam`) 모드로 문제를 풀고 채점한다.
2. 오답 다시 풀기(`review` 모드)로 진입해 다시 채점한다.
3. 오답 노트를 열어 틀린 문제 목록을 확인한다.

## 현재 동작 (버그)

- `review` 모드에서 채점할 때 `state.histories.push`에 `mode: state.mode` 값(= `"review"`)이 저장됨 (`script.js` 약 line 3398).
- 그러나 답안 키(`answerKey`)는 채점 시 `targetMode = "exam"` 기준(`-exam` 패턴)으로 `historyAnswers`에 저장됨 (약 line 3385~3390).
- 이후 `historyWrongNoteItems(history)`가 `answerKey(question, history.mode = "review")` = `-review` 키로 `history.answers`를 조회하지만, 저장된 키는 `-exam` 패턴뿐이라 매칭에 실패함.
- 결과적으로 오답 노트가 빈 결과를 반환함.

> 참고: 기존 리포트에는 원인이 "키 필터 패턴(`-exam-`) 불일치"로 기술되었으나, 실제 근본 원인은 **`history.mode`가 `exam`이 아닌 `review`로 저장되어 조회 키와 저장 키가 어긋나는 것**입니다.

## 기대 동작

1. 오답 재채점 후에도 오답 노트가 해당 회차의 틀린 문제를 정확히 표시한다.
2. 조회 키(`answerKey`에 쓰이는 mode)와 저장 키가 항상 일치한다.

---

## 우선순위

* [x] 높음
* [ ] 보통
* [ ] 낮음

## 영향 범위

* [x] Frontend
* [ ] Backend
* [ ] Database
* [ ] API
* [ ] Design
* [ ] Test
* [ ] Documentation

## 완료 조건

* [ ] `review` 재채점 후 오답 노트가 정확히 표시됨
* [ ] 저장 키와 조회 키의 mode가 일치함
* [ ] 기존 `exam` / `random` 모드 오답 노트에 영향 없음
* [ ] 모바일 / 데스크톱 화면에서 정상 동작함

---

## 추가 참고자료

* 참고 문서: `docs/ISTQB_CBT_QA_Report.docx` ([A-1])
* 관련 이슈: sanitizeHistories `review` mode 잔존 이슈
