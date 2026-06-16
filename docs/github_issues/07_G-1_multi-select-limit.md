## 버그 개요

복수 정답 문항에서 정답 개수를 초과해 보기를 선택할 수 있어 UX 혼란이 있습니다.

- 등급: **Medium**
- 대상 파일: `www/script.js`

---

## 재현 절차

1. 정답이 2개인 복수 정답 문항을 연다.
2. 보기를 3개 이상 선택해 본다.

## 현재 동작 (버그)

- `chooseOption()`(`script.js` 약 line 3180~3194)에서 `question.answer.length > 1`이면 단순 토글(add/delete)만 수행하고, **선택 개수 상한 제한이 없음**.
- 따라서 정답 개수보다 많은 보기를 선택할 수 있음.

```js
if (question.answer.length > 1) {
  current.has(key) ? current.delete(key) : current.add(key);
}
```

## 기대 동작

1. 선택 개수가 정답 개수에 도달하면 추가 선택을 막거나 가장 오래된 선택을 해제한다.
2. 사용자에게 선택 가능 개수를 안내한다 (예: "정답 2개 선택").

---

## 우선순위

* [ ] 높음
* [x] 보통
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

* [ ] 정답 개수 초과 선택이 제한됨
* [ ] 선택 가능 개수 안내가 표시됨
* [ ] 단일 정답 문항에 회귀 없음

---

## 추가 참고자료

* 참고 문서: `docs/ISTQB_CBT_QA_Report.docx` ([G-1])
