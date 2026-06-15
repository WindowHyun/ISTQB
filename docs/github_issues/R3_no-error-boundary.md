## 버그 개요

React 앱에 Error Boundary가 없어, 렌더 중 예외가 발생하면 화면이 백지가 되고 복구 수단이 없습니다.

- 등급: **High**
- 대상 파일: `src/app/App.tsx`

---

## 현재 동작 (버그)

- `App.tsx`는 `Suspense` fallback만 두고 Error Boundary는 없음.
- R1 같은 데이터 불일치/렌더 throw가 곧장 빈 화면으로 이어짐.
- 이미 작성된 `src/components/common/ErrorState.tsx`가 어디에도 연결되어 있지 않음(R2와 연관).

## 기대 동작

1. 최상위(또는 워크스페이스 경계)에 Error Boundary를 두고 `ErrorState`로 폴백.
2. 데이터 로드 실패 시 재시도 UI 제공.

---

## 우선순위

* [x] 높음
* [ ] 보통
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

* [ ] 렌더 예외가 앱 전체 백지로 이어지지 않음
* [ ] `ErrorState` 폴백 + 재시도 경로 연결

---

## 추가 참고자료

* 관련 이슈: R1, R2
