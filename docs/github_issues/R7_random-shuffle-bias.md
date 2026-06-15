## 버그 개요

랜덤 모드의 셔플이 `Array.prototype.sort`의 비교자에 `Math.random()`을 넣는 방식이라 균일분포가 아닙니다.

- 등급: **Medium**
- 대상 파일: `src/hooks/useQuestions.ts:65`

---

## 현재 동작 (버그)

```js
const shuffled = [...questions].sort(() => Math.random() - 0.5);
```

- 비교자가 비일관적이라 엔진별로 편향된(비균일) 순서가 나옴.
- 레거시 바닐라 앱은 Fisher–Yates(`shuffle()`)를 사용했음 — 회귀.

## 기대 동작

- Fisher–Yates 등 균일 셔플 사용.

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

* [ ] 균일 분포 셔플로 교체
* [ ] 40문항 미만 세트에서도 안전(무한 재셔플/중복 없음)

---

## 추가 참고자료

* 레거시 참고 구현: `script.js`의 `shuffle()`
