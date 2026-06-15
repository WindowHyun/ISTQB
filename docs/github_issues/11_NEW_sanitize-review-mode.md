## 버그 개요

`sanitizeHistories()`가 `"review"` mode를 유효 값으로 허용해, [A-1] 버그로 잘못 저장된 `history.mode = "review"` 데이터가 정화되지 않고 그대로 남습니다.

- 등급: **Low**
- 대상 파일: `www/script.js`
- 비고: [A-1]의 근본 수정과 함께 검토되어야 하는 데이터 정합성 이슈.

---

## 현재 동작 (버그)

- `sanitizeHistories()`(`script.js` 약 line 1316)가 mode 값으로 `["exam", "random", "review"]`를 모두 유효로 허용함.
- 그 결과 [A-1]에서 잘못 저장된 `mode: "review"` history가 정화되지 않고 잔존 → 오답 노트 조회 키 불일치가 해소되지 않음.

## 기대 동작

1. [A-1] 수정 방향에 맞춰, 저장 시점에 올바른 mode가 기록되거나
2. 기존 잘못된 `"review"` history가 로드 시 올바른 mode로 보정된다.

---

## 우선순위

* [ ] 높음
* [ ] 보통
* [x] 낮음

## 영향 범위

* [x] Frontend
* [ ] Backend
* [ ] Database
* [ ] API
* [ ] Design
* [ ] Test
* [ ] Documentation

## 완료 조건

* [ ] 잘못 저장된 `review` mode history가 보정 또는 방지됨
* [ ] 기존 정상 history에 회귀 없음

---

## 추가 참고자료

* 참고 문서: `docs/ISTQB_CBT_QA_Report.docx` (신규 — [A-1] 연관)
* 관련 이슈: 오답 노트 표시 버그 ([A-1])
