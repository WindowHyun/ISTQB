## 버그 개요

백업 가져오기(`importUserData`)가 디바운스된 저장 함수를 호출한 직후 즉시 복원을 수행해, 가져온 데이터가 반영되지 않은 채 "성공"으로 처리될 수 있습니다.

- 등급: **High**
- 대상 파일: `src/utils/storage.ts` (`importUserData`, `saveUiState`, `saveAnswers`)

---

## 현재 동작 (버그)

- `saveUiState`/`saveAnswers`는 `lodash-es/debounce(…, 500)`로 감싸져 있어 호출 후 500ms 뒤에 localStorage에 기록됨.
- `importUserData`(`storage.ts:181-190`)는 `saveUiState(data.state)`·`saveAnswers(data.answers)`를 호출한 직후 `await restorePersistentSnapshot()`로 localStorage를 **즉시 동기 읽기** → 디바운스 flush 이전의 (이전) 값을 읽음.
- 그럼에도 `resolve(true)` → "백업 파일이 성공적으로 복원되었습니다" 알림(`Sidebar.tsx:25`).
- 또한 `data.state`에는 `answers` 필드가 없어 레거시 스냅샷 빌드 시 `snapshot.answers`가 비는 경로도 있음.

## 기대 동작

1. 가져오기 시 디바운스를 우회한 즉시 저장(또는 `.flush()`) 후 복원.
2. 복원 성공/실패를 실제 결과에 근거해 알림.

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

* [ ] 가져온 UI 상태/답안/기록이 즉시 복원에 반영됨
* [ ] 성공 알림이 실제 반영 결과와 일치

---

## 추가 참고자료

* 관련 코드: `src/utils/storage.ts:107-148`(debounce 저장), `:173-199`(import)
