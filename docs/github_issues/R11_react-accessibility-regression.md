## 개요

신규 React UI가 레거시 바닐라 앱 대비 접근성 속성을 다수 누락했습니다.

- 등급: **Medium**
- 대상 파일: `src/components/quiz/QuestionWorkspace.tsx`, `src/components/layout/Sidebar.tsx`

---

## 현재 동작

- 문제 번호 내비 버튼: `aria-current`/`aria-label` 없음(`QuestionWorkspace.tsx:39-47`).
- 모드 전환 버튼: `aria-pressed` 없음(`Sidebar.tsx:53-61`).
- 파일 입력 `<input type="file">`에 라벨 없음(`Sidebar.tsx:75`).
- 모달/포커스 트랩·키보드 내비 등 레거시에 있던 처리가 React 측엔 미구현.

> 레거시 `index.html`/`script.js`는 `aria-pressed`, `aria-current`, 포커스 트랩, 화살표 키 내비를 갖추고 있었음.

## 기대 동작

- 상호작용 요소에 적절한 ARIA 상태/라벨 부여, 포커스 관리 복원.

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

* [ ] 내비/모드/파일 입력에 ARIA·라벨 부여
* [ ] 키보드 내비·포커스 관리 복원

---

## 추가 참고자료

* 레거시 참고: `index.html`(aria-*), `script.js`(포커스 트랩/키보드)
