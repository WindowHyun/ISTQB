## 개요

`tsconfig.json`이 `strict: true`임에도 핵심 파일에서 타입 검사를 우회하고 있어 타입 안전성이 무력화됩니다.

- 등급: **Medium**
- 대상 파일: `src/utils/parser.tsx`, `src/components/quiz/QuestionCard.tsx`

---

## 현재 동작

- `src/utils/parser.tsx`: 파일 전체 `// @ts-nocheck`(682줄) — 가장 복잡한 텍스트 파서가 타입 사각지대.
- `QuestionCard.tsx:4`: `// @ts-ignore`로 `RichText` import.
- `OptionItem` props가 `}: any`, 그 외 `as any` 캐스팅 다수(`Sidebar.tsx`, `App.tsx`).

## 기대 동작

1. `parser.tsx`에 점진적 타입 부여(최소한 공개 API인 `RichText`/`renderRichText` 시그니처).
2. `any`/`@ts-ignore` 제거 또는 사유 주석과 함께 최소화.

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

* [ ] `@ts-nocheck`/`@ts-ignore` 제거 또는 최소화
* [ ] 공개 컴포넌트 props에 명시적 타입 부여

---

## 추가 참고자료

* `tsconfig.json`(`strict: true`)
