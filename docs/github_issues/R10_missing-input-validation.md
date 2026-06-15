## 개요

외부에서 오는 값(localStorage의 last-product, 가져오기 백업 JSON)을 검증 없이 신뢰합니다.

- 등급: **Medium**
- 대상 파일: `src/app/App.tsx`, `src/utils/storage.ts`

---

## 현재 동작

- `App.tsx:13`: `localStorage.getItem("istqb-fl-v4-sample-last-product") as 'istqb' | 'csts'` — 무검증 타입 단언. 손상/구버전 값이면 잘못된 상태로 진입.
- `importUserData`/`restorePersistentSnapshot`: 백업/스냅샷 JSON을 형태 검증 없이 `hydrate`로 store에 병합 — 손상 파일이 상태를 오염시킬 수 있음.

## 기대 동작

1. `last-product`를 화이트리스트(`'istqb' | 'csts'`)로 검증 후 사용.
2. 백업/스냅샷에 스키마 검증(필수 필드, 타입) 후 적용. 레거시 바닐라 앱의 `sanitize*` 수준 방어 참고.

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

* [ ] 잘못된 last-product/백업 값이 상태를 오염시키지 않음
* [ ] 가져오기 시 스키마 검증

---

## 추가 참고자료

* 레거시 참고: `script.js`의 `sanitizeAnswerState/sanitizeHistories` 등
