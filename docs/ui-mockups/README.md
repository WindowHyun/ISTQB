# 모바일 풀이 흐름 UI 시안

모바일(390×844) 풀이 흐름 개선안의 정적 HTML 시안입니다. 브라우저로 파일을 직접 열면 됩니다.
글꼴은 Google Fonts(Noto Sans KR)를 링크하므로 오프라인에서는 시스템 글꼴로 대체됩니다.

| 파일 | 화면 |
| --- | --- |
| [`01-solve.html`](./01-solve.html) | 풀이 화면 — 헤더·상태 줄·하단 바(진행 스트립) |
| [`02-question-list.html`](./02-question-list.html) | 문항 목록 바텀 시트 |
| [`03-set-select.html`](./03-set-select.html) | 세트 선택 바텀 시트 |
| [`04-figure-question.html`](./04-figure-question.html) | 그림 문항(`눌러서 확대` 칩) |
| [`05-figure-zoom.html`](./05-figure-zoom.html) | 확대 화면 |

- 시안의 진행률·오답 건수 같은 숫자는 **예시**입니다. 실제 값은 저장된 답안에서 계산해야 합니다.
- 구현 요구사항·수용 기준·단계 계획은 이 폴더가 아니라 UI 개선 기획서가 정본입니다.
- 색 값은 기존 앱 팔레트에서 가져왔습니다. 구현에서는 hex를 그대로 쓰지 않고 `globals.css` 토큰에 대응시킵니다.
- 앱 코드와 무관한 문서 자료입니다. 빌드·테스트·번들에 포함되지 않습니다.

## 구현 위치

| 시안 | 구현 |
| --- | --- |
| 풀이 화면(헤더·상태 줄·하단 바·진행 스트립) | `MobileTopBar.tsx`, `QuestionWorkspace.tsx`(하단 바), `ProgressStrip.tsx` |
| 문항 목록 시트 | `QuestionListSheet.tsx`(`AppModals`가 `paletteOpen`으로 연다) |
| 세트 선택 시트 | `SetSheet.tsx`, 표시 이름 규칙은 `utils/setSheet.ts` |
| 그림 문항·확대 화면 | `QuestionCard.tsx`·`parser.tsx`(칩), `utils/lightbox.ts`(확대 화면), `utils/zoomGesture.ts`(제스처 계산) |

시안과 달라진 점: 세트 선택 시트에는 제품 분할 버튼이 없다(현재 제품의 세트만 — 제품 전환은 기존 '처음 화면으로' 경로). 오답 노트 배지와 '오답 N문제 다시 풀기'의 숫자는 시안의 예시값이 아니라 저장된 이력·오답 대상에서 계산한다.

## 구현 스크린샷(이전 → 이후)

390×844 모바일 뷰포트에서 `npm run build && npm run preview`로 찍은 화면이다. 왼쪽이 구현 전, 오른쪽이 구현 후다. 시안과 같이 숫자(진행·오답 건수)는 그때의 저장 상태에서 나온 값이다.

| 화면 | 비교 |
| --- | --- |
| 풀이 화면 | [`compare-1-solve.png`](./screenshots/compare-1-solve.png) |
| 문항 목록(이전: `문항 이동` 모달) | [`compare-2-list.png`](./screenshots/compare-2-list.png) |
| 세트 선택(이전: 드로어 안 셀렉트) | [`compare-3-sets.png`](./screenshots/compare-3-sets.png) |
| 그림 문항 | [`compare-4-figure.png`](./screenshots/compare-4-figure.png) |
| 확대 화면 | [`compare-5-zoom.png`](./screenshots/compare-5-zoom.png) |

이후 화면만 따로 남긴 것: 시험 응시 중(정오 비공개)과 채점 뒤(정오·오답 노트 배지·`오답 N문제 다시 풀기`)는 [`after-exam-states.png`](./screenshots/after-exam-states.png), 다크 테마는 [`after-dark.png`](./screenshots/after-dark.png), 확대 후(두 번 누르기)는 [`after-zoom-250.png`](./screenshots/after-zoom-250.png).
