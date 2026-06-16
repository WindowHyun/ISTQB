## 개요

타이머가 도는 동안 매 초 localStorage에 기록이 발생합니다.

- 등급: **Low** (성능/저장소 마모)
- 대상 파일: `src/store/useQuizStore.ts`, `src/utils/storage.ts`

---

## 현재 동작

- `tickTimer`가 1초 간격으로 `elapsedSeconds`를 갱신.
- `storage.ts`의 `useQuizStore.subscribe`가 조건에 `state.elapsedSeconds !== prevState.elapsedSeconds`를 포함 → 매 tick마다 `saveUiState` 호출.
- `saveUiState`는 디바운스(500ms)지만 `elapsedSeconds`가 1초마다 바뀌므로 사실상 **초당 1회** 실행되고, 내부에서 `uiStorageKey`와 `persistenceKey` **2회 `setItem`** 수행.

즉 문제를 푸는 내내 초당 2회 localStorage 쓰기가 일어남.

## 기대 동작

- 경과 시간은 숨김(`visibilitychange`)·언마운트·채점 시점 등에만 저장하거나,
- per-tick `subscribe` 저장 조건에서 `elapsedSeconds`를 제외(타이머는 메모리 상태로 두고 별도 시점에만 영속화).

---

## 우선순위

* [ ] 높음
* [ ] 보통
* [x] 낮음

## 영향 범위

* [x] Frontend
* [ ] Backend
* [ ] Database
* [ ] API
* [ ] Design
* [ ] Test
* [ ] Documentation

## 완료 조건

* [ ] 타이머 동작 중 localStorage 쓰기 빈도 감소(초당 → 이벤트 기반)
* [ ] 경과 시간 복원 정확도 유지

---

## 추가 참고자료

* 관련 코드: `src/utils/storage.ts`(subscribe, saveUiState), `src/store/useQuizStore.ts`(tickTimer)
* 관련 이슈: #63(타이머 백그라운드 집계/모델)
