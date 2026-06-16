## 버그 개요

React 앱 문항 렌더 시 `parser.tsx`의 `RichText`가 호출하는 함수들이 **정의 자체가 없어** 런타임 ReferenceError로 크래시했습니다. `@ts-nocheck`라 정적 검사가 못 잡았고, #68 React E2E가 처음 잡아냈습니다.

- 등급: **Critical** (해결됨 — GitHub #74, commit `2e3e7fc`)
- 대상: `src/utils/parser.tsx`

---

## 누락 함수 (legacy `script.js`엔 존재)
- `renderRichText` — 블록→DOM 렌더 진입점(RichText가 직접 호출 → `ReferenceError: renderRichText is not defined`)
- `stripPdfNoise`, `normalizeReadableCharacters`, `splitKnownSectionHeadings`, `splitStructuralMarkers` — `buildRichBlocks` 의존 텍스트 정제
- `openFigureModal` — 이미지/표 클릭 핸들러 참조(클릭 시 크래시)

## 해결
- 누락 함수 5종 복원 + `openFigureModal` 새 탭 폴백.
- `src/utils/parser.render.test.ts`(jsdom RichText 렌더 회귀 가드) 추가.
- 검증: 로컬 16 테스트 + CI E2E(react-smoke) 그린.

---

## 우선순위
* [x] 높음

## 영향 범위
* [x] Frontend
* [x] Test

## 완료 조건
* [x] 누락 함수 복원, React 문항 렌더 정상
* [x] 회귀 가드(jsdom) 추가
* [x] CI E2E 그린

---

## 교훈
정적 검사(tsc/eslint/build) 전부 통과해도 `@ts-nocheck` 영역의 런타임 크래시는 못 잡힘 → E2E(#68) + jsdom 렌더 테스트가 유일 검출 계층.
