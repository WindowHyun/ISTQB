## 개요

CI(GitHub Actions)를 도입(`d442f85`)했으나, React 앱 E2E 스모크는 런타임 크래시(#56) 때문에 추가하지 못했습니다. #56/#57 해결 후 추가합니다.

- 등급: **High** (테스트 커버리지)
- GitHub: #68
- 대상: `playwright.config.ts`, `e2e/`

---

## 현재 동작

- CI 3잡: build(verify+tsc+vite build) / unit(vitest) / e2e(playwright).
- E2E 스모크는 **레거시 앱**(`e2e/legacy-smoke.spec.ts`)만 검증 — 실제 배포본이라 그린.
- React 앱은 로드 즉시 `appData.istqb.sets` TypeError(#56)로 크래시 → 스모크 불가.
- 빌드/타입(tsc)은 #56을 못 잡음(데이터 `as AppData` 강제 캐스팅).

## 기대 동작

- #57(이중 구현 통합) → #56(스키마 정합) 후, React 앱 로드~문항 렌더 E2E를 CI에 추가.
- #56 회귀 시 CI가 실패.

---

## 우선순위

* [x] 높음
* [ ] 보통
* [ ] 낮음

## 영향 범위

* [ ] Frontend
* [ ] Backend
* [ ] Database
* [ ] API
* [ ] Design
* [x] Test
* [ ] Documentation

## 완료 조건

* [ ] #57, #56 선행 완료
* [ ] React preview webServer + `e2e/react-smoke.spec.ts` 추가
* [ ] CI e2e 잡에서 React 스모크 통과

---

## 추가 참고자료

* 관련 이슈: #56, #57
* 현 E2E: `e2e/legacy-smoke.spec.ts`
