## 버그 개요

타이머가 백그라운드 체류 시간을 경과 시간에 합산하며, 타이머 상태 모델이 이중으로 정의되어 있습니다.

- 등급: **Medium**
- 대상 파일: `src/components/quiz/QuestionWorkspace.tsx`, `src/store/useQuizStore.ts`, `src/features/quiz/quiz.types.ts`

---

## 현재 동작 (버그)

- 가시성 핸들러(`QuestionWorkspace.tsx:13-22`)가 숨김 시 `interval`만 정리하고 `lastTick`은 갱신하지 않음.
- `tickTimer`(`useQuizStore.ts:89-96`)는 `now - lastTick` 델타를 누적 → 복귀 후 첫 tick에서 백그라운드 경과시간이 `elapsedSeconds`에 합산됨(과다 집계).
- 타이머 모델 이중화: store는 `elapsedSeconds/lastTick/startedAt`, `quiz.types`는 `timerStartedAt/elapsedMs`.

## 기대 동작

1. 숨김 진입 시 `lastTick` 처리(또는 `visibilitychange` 시 누적 후 중지)로 백그라운드 시간 제외.
2. 타이머 상태 모델 단일화(R2와 연계).

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

* [ ] 백그라운드 체류 시간이 경과 시간에 포함되지 않음
* [ ] 타이머 상태 모델 단일화

---

## 추가 참고자료

* 관련 이슈: R2(이중 구현)
