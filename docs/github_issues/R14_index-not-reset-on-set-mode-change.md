## 버그 개요

문제 세트 또는 풀이 모드를 변경할 때 `index`를 0으로 초기화하지 않아, 새 목록이 더 짧으면 범위를 벗어난 인덱스로 접근해 크래시가 납니다.

- 등급: **Medium** (현재 #56로 도달 불가한 잠재 크래시 / #56 해결 시 즉시 표면화)
- GitHub: (이 이슈)
- 대상 파일: `src/components/layout/Sidebar.tsx`, `src/store/useQuizStore.ts`, `src/components/quiz/QuestionWorkspace.tsx`

---

## 현재 동작 (버그)

- `Sidebar.handleSetChange`는 `setSetId` + `setMode('practice')` + `resetTimer`만 호출하고 **`setIndex(0)`이 없음**.
- `handleModeChange`도 `setMode` + `resetTimer`만 호출, index 초기화 없음.
- `useQuizStore.setIndex`는 **클램프하지 않음**(받은 값을 그대로 설정).
- `QuestionWorkspace`는 `currentQuestions[index]`를 **클램프 없이 직접 접근**.

재현(논리): 40문항 세트에서 `index = 39` 상태 → 10문항 세트(또는 오답 모드의 짧은 목록)로 전환 → `currentQuestions[39] === undefined` → `QuestionCard`가 `question.answer.length`에서 `TypeError: Cannot read properties of undefined`.

> 현재는 #56(데이터 스키마 불일치)로 문항 렌더 단계까지 도달하지 못해 표면화되지 않지만, #56 해결 시 정상 사용 경로(세트/모드 전환)에서 바로 발생. Error Boundary 부재(#58)로 화면 백지로 직결됨.

## 기대 동작

1. 세트/모드 변경 시 `index`를 0으로 초기화, 또는
2. `setIndex`/렌더 시점에 `clampQuestionIndex`로 범위를 보정.

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

* [ ] 세트/모드 전환 후 index가 항상 유효 범위
* [ ] 범위 밖 접근으로 인한 크래시 없음

---

## 추가 참고자료

* 관련 이슈: #56(스키마 불일치), #58(Error Boundary)
* 참고 유틸: `src/features/quiz/quiz.utils.ts`의 `clampQuestionIndex`
