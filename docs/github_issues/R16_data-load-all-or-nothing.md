## 버그 개요

배포 앱(`script.js`)의 데이터 로딩이 `Promise.all`이라, **세트 JSON 하나라도 실패하면 전체가 reject** → ISTQB·CSTS **둘 다** "데이터 없음"으로 처리됩니다. 부분 실패가 전면 장애로 증폭됩니다.

- 등급: **Medium** (트리거 확률 낮음 / blast radius 큼 — 전 사용자·양 제품)
- 대상 파일: `script.js` (`loadQuestionProductData`, 약 225–247)

---

## 현재 동작 (버그)

```js
const loadedSets = await Promise.all(
  items.map(async (item) => ({ item, payload: await fetchQuestionJson(...) })),
);
// ...
} catch (error) {
  questionDataErrors.istqb = "Question data is missing or empty.";
  questionDataErrors.csts  = "CSTS data is missing or empty.";   // ← 둘 다 실패
}
```

- 한 세트 파일이 404/손상이면 `Promise.all`이 즉시 reject → catch에서 **두 제품 모두** 에러.
- 정상 로드된 세트까지 포함해 **모든 사용자에게 "데이터 없음"** 노출.

## 기대 동작

1. `Promise.allSettled`로 부분 실패를 흡수하고 **성공한 세트만** 노출.
2. 실패한 세트는 로그/세트 단위 에러로 격리(전면 장애 금지).

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

* [ ] 세트 1개 실패가 다른 세트/제품을 막지 않음
* [ ] 실패 세트는 격리 로그 + 부분 노출

---

## 추가 참고자료

* `script.js`의 `loadQuestionProductData` / `loadQuestionCatalog`
