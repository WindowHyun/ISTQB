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
