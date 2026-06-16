## 개요

`validate-questions.js`가 정답-보기 일치 검사를 `multiple_choice`에만 적용해, **`true_false`·`short_answer` 정답이 전혀 검증되지 않습니다.** CI(`npm run verify`)의 사각지대입니다.

- 등급: **Medium** (validator 갭 — 현재 실데이터 결함은 없으나 회귀 검출 불가)
- 대상 파일: `scripts/validate-questions.js` (약 73줄)

---

## 현재 동작

```js
if (Array.isArray(q.answer) && q.type === 'multiple_choice') {  // ← MC만
  for (const ans of q.answer) if (!optionKeys.has(ans)) log('ERROR', ...);
}
```

- `true_false`(65문항)·`short_answer`(54문항) = **CSTS 119문항 정답 무검증**.
- options가 비어 있어 "정답이 보기에 있나" 체크가 적용 안 되는데, **대체 검사가 없음**.
- 예: OX 정답에 오타('y' 등)나 단답형 빈 정답이 들어가도 CI가 통과.

## 기대 동작

1. `true_false`: 정답이 `o/x/O/X`(또는 합의된 표기) 집합에 속하는지 검사.
2. `short_answer`: 정답이 비어 있지 않은 문자열인지 검사.
3. (선택) block 콘텐츠 필드(text/lines/items) 존재 검사 등 커버리지 보강.

---

## 우선순위

* [ ] 높음
* [x] 보통
* [ ] 낮음

## 영향 범위

* [ ] Frontend
* [ ] Backend
* [ ] Database
* [ ] API
* [x] Test
* [ ] Documentation

## 완료 조건

* [ ] true_false/short_answer 정답이 검증 대상에 포함
* [ ] 오타/빈 정답이 CI에서 ERROR로 검출

---

## 추가 참고자료

* `scripts/validate-questions.js`, `scripts/verify.js`
* 데이터 분포: MC 507 / true_false 65 / short_answer 54
