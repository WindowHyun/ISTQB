## 개요

`src/` 안에 서로 통합되지 않은 **두 벌의 구현**이 공존하며, 그중 한 벌(정합적인 쪽)이 렌더 트리에서 전혀 사용되지 않는 죽은 코드입니다.

- 등급: **High**
- 대상: `src/hooks/`, `src/store/`, `src/utils/`, `src/features/quiz/`, `src/components/`

---

## 현재 동작

| 구분 | Track A (배선됨) | Track B (정합하나 미사용) |
|---|---|---|
| 데이터 로드 | `hooks/useQuestions.ts` | `features/quiz/quiz.loader.ts` |
| 타입 | `Question`(stem: string) | `QuizQuestion`(stem: ContentBlock[]) |
| 저장 | `utils/storage.ts` (IndexedDB `istqb-db`) | `features/quiz/quiz.storage.ts` (IndexedDB `istqb-quiz`) |
| 컴포넌트 | `QuestionCard/QuestionWorkspace/Sidebar` | `QuestionStem/OptionList/QuestionNav/ResultPanel/AppShell/EmptyState/ErrorState/LoadingState` |

- Track B의 8개 컴포넌트는 렌더 트리에서 **import 0회**(확인됨) — 전부 죽은 코드.
- IndexedDB가 `istqb-db` / `istqb-quiz` / (레거시)`istqb-fl-v4-sample-db`로 파편화.
- 정작 데이터 스키마와 일치하는 쪽은 Track B인데, 배선된 쪽은 Track A(R1의 근본 원인).

## 기대 동작

- 단일 구현 경로로 통합. 데이터와 정합적인 `features/quiz/*` 모델을 정본으로 삼고 `useQuestions`/중복 컴포넌트를 제거하거나, 반대로 한쪽으로 일원화.
- IndexedDB/스냅샷 포맷도 하나로 통합.

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

* [ ] 단일 데이터/저장/컴포넌트 경로로 통합
* [ ] 미사용 컴포넌트·모듈 제거
* [ ] IndexedDB 저장소 단일화

---

## 추가 참고자료

* 관련 이슈: R1(스키마 불일치)
