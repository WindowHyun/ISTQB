## 버그 개요

신규 React 앱의 배선 경로(`App → Sidebar / QuestionWorkspace → useQuestions`)가 실제 데이터 파일 스키마와 맞지 않아 **문항을 렌더할 수 없고 런타임 크래시가 발생**합니다.

- 등급: **Critical**
- 대상 파일: `src/hooks/useQuestions.ts`, `src/components/layout/Sidebar.tsx`
- 완충: 현재 배포 경로는 루트 레거시 앱이며 React 앱은 미배포 상태(피해 범위 한정).

---

## 현재 동작 (버그)

1. **index.json 형태 불일치** — 실제 `public/data/index.json`은 `{ schemaVersion, sets: [...] }`(평면 배열, 각 항목에 `certification`)인데, `useQuestions`는 `{ istqb: { sets }, csts: { sets } }`로 캐스팅한다(`useQuestions.ts:35,44-46`). 따라서 `appData.istqb`가 `undefined` → `Sidebar.tsx:41`의 `appData?.istqb.sets.map(...)`에서 `Cannot read properties of undefined (reading 'sets')` 크래시.
2. **세트 파일 형태 불일치** — 실제 세트 파일은 `{ meta, questions: [...] }`인데 `useQuestions.ts:54-58`은 응답 전체를 `Question[]`로 보고 `targetSet.questions = data` 후 배열 메서드(`.filter/.sort/.slice`)를 호출 → 빈 목록 또는 예외.
3. **필드명 불일치** — `SetData`는 `file`을 기대하지만(`useQuestions.ts:18,54`) index.json 항목의 경로 필드는 `path`. `targetSet.file`이 `undefined` → `fetch('data/undefined')`.

> 참고: `src/features/quiz/quiz.types.ts`·`quiz.loader.ts`는 실제 데이터와 정확히 일치하지만, 배선된 쪽이 아니다(R2 참조).

## 기대 동작

- 로더가 `{ schemaVersion, sets: [...] }`와 `{ meta, questions: [...] }`를 올바르게 파싱하고, 경로 필드로 `path`를 사용한다.
- 데이터 로드 실패/형식 오류 시 크래시 대신 에러 상태를 표시한다(R3 참조).

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

* [ ] React 앱이 실제 `public/data` 데이터로 세트 목록과 문항을 렌더함
* [ ] Sidebar가 index.json의 평면 `sets[]`를 정상 처리함
* [ ] 세트 파일의 `{ meta, questions }` 구조와 `path` 필드를 정확히 사용함

---

## 추가 참고자료

* 관련 이슈: R2(이중 구현/죽은 코드), R3(Error Boundary)
* 정합 모델 참고: `src/features/quiz/quiz.types.ts`, `src/features/quiz/quiz.loader.ts`
