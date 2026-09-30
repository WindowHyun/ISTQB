# E2E 스펙 색인

"이 동작은 어느 스펙에서 검사하나"에 답하는 색인입니다. 테스트 하나하나의 전제·행위·기대는 스펙 파일의 테스트 제목과 주석이 정본입니다(`npx playwright test --list`).
작성 규칙은 [`harness/testing.md`](./harness/testing.md), CI에서 어떻게 도는지는 [`ci/README.md`](./ci/README.md).

## Playwright 프로젝트

| 프로젝트 | 파일 | 명령 | 어디서 도나 |
| --- | --- | --- | --- |
| `react` | `e2e/react-*.spec.ts` | `npm run test:e2e` | PR 게이트 |
| `explore` | `e2e/explore-*.spec.ts` | `npm run test:explore` | 매일(`daily-e2e.yml`). 전수 스윕·완주 채점은 데이터·렌더 경로가 바뀐 PR에서도 |
| `nonfunctional` | `e2e/nonfunctional.spec.ts` | `npm run test:nf` | PR 게이트 + 매일 |
| `apk` · `apk-nf` | `e2e/apk-*.spec.ts` | `npm run test:apk` | PR 게이트 |

모든 스펙은 `e2e/fixtures.ts`의 `test`를 쓰고, 잡히지 않은 페이지 예외가 나면 그 테스트가 실패합니다.

## 기능 — `react`

| 스펙 | 영역 |
| --- | --- |
| `react-functional` | 핵심 흐름 한 바퀴(게이트 → 연습 → 이동 → 시험 채점 → 미니 시험 → 설정 → CSTS 유형) |
| `react-transition` | 상태 전이 전수(S0 게이트 · S1 연습 · S2E 시험 3단계 · S3 미니 시험 · S4 오답, T 번호로 식별) |
| `react-transition-quick` | 4모드 전이 16칸 전수 + 퀵 왕복·연속 회차·세트 격리 |
| `react-state-matrix` | 시험 미시작·응시 중·채점 후에서 전 모드 왕복 |
| `react-userflow` | 한 사람이 연습→시험→미니 시험→퀵→오답→통계를 이어 밟는 종단 시나리오 |
| `react-modes` | 모드 격리·리셋·잠금·시험 시작 게이트·응시 중 잠금 |
| `react-flow-ux` | 응시 포기·채점 완료 가드·챕터 미니 시험·극복 배지·챕터 필터 복원 |
| `react-exam-timer` | 시험 제한시간(자격증별 60/90분, 꺼져 있던 시간 차감, 만료 시 자동 제출) |
| `react-study-ux` | 이어풀기 배너·제출 전 검토·오답 노트·재접속 선택·결과 줄바꿈 |
| `react-grading` | 미응답 확인·합격 기준·복수정답·진위형·단답형·채점 후 상태 |
| `react-qtypes` | 문항 유형(진위형·단답형·다답형·수치 답·`acceptedAnswers`·정답 표기) |
| `react-navigation` | 이전/다음·키보드·팔레트·'문항 이동' 모달의 경계 |
| `react-content` | 라이트박스·화면 콘솔(`?debug`)·토스트·콘텐츠 표시 회귀 |
| `react-figures` | 특정 그림·표 문항의 로드와 렌더 |
| `react-modals` | 모달 Esc/백드롭·통계·테마·글자 크기·오답 문항 보기 |
| `react-back-dismiss` | 뒤로가기로 오버레이 닫기(APK 하드웨어 뒤로가기 경로) |
| `react-guards` | 뒤로가기·0점 채점·가져오기 정책 확인 가드 |
| `react-persistence` | 새로고침 복원·제품 격리·저장 불가 환경·내보내기/가져오기 |
| `react-robustness` | 손상 저장소·저장소 차단·데이터 요청 실패·조작된 백업·로딩 스켈레톤 |
| `react-reset-ghost` | 이력 비우기·회차 삭제 뒤 오답 모드에 삭제분이 남지 않음 |
| `react-review-loop` | 오답 재풀이 루프 |
| `react-stats` | 학습 통계 요약·회차 타임라인·약점 분석·챕터 분모 |
| `react-quick` | 퀵 출제·이어풀기·부분 로드 실패·느린 출제·퀵 오답 |
| `react-quick-ux` | 퀵 조작(패널·점수판·이동 수단·문항 단위 채점)과 UI(axe·키보드·터치 타깃·대비) |
| `react-responsive` | 모바일(드로어·점프핀·하단바)·320px·태블릿 |
| `react-a11y` | ARIA·키보드·포커스 트랩·다크 대비 |
| `react-a11y-axe` | axe-core WCAG 2.1 AA — 주요 화면·다크/모바일·코드 블록 문항 |
| `react-guide` · `react-feedback-link` | 사용설명서·제보 링크 |
| `react-harness` | 하네스 자체 검사 — 페이지 예외 fixture가 실제로 실패를 만드는지 |

## 탐색 — `explore`

| 스펙 | 영역 |
| --- | --- |
| `explore-fullsweep` | 12세트 626문항 전수 렌더(1280·390px) |
| `explore-fullgrade` | 12세트를 정답으로 완주하면 전부 100% |
| `explore-monkey` | 시드 3개 × 무작위 120회 조작 후 불변식 |
| `explore-pairwise` | 제품×모드×폭×채점 3-way 조합 |
| `explore-random-smoke` | 시드 랜덤 답안의 점수가 원본 JSON 기대값과 일치(`SMOKE_SEED`로 재현) |
| `explore-consistency` | 결과·통계·이력·팔레트가 같은 값을 보는지 |

## 비기능 · APK

- `nonfunctional` NF1~NF13 — 로드·렌더·이동·채점 시간, 입력 폭주·모드 전환 스트레스, 힙·DOM, 타이머 정확도, 오프라인(PWA) 복원력, 저장 내구성, 이력 1,000건. NF13은 `setOffline`이 실제로 걸렸는지 먼저 증명한다.
- `apk-functional` AF1~AF13 — 상태바·제스처바 회피, 터치 풀이·채점, 웹뷰 재시작 복원, 가로 넘침·가로 모드, 퀵 컨트롤 터치 타깃, 퀵 여백(콘텐츠 위치가 아니라 규칙을 잰다).
- `apk-nonfunctional` ANF1~ANF8 — 모바일 성능·스트레스·재시작 내구성·DOM/힙 예산.

데스크톱 E2E는 뷰포트를 줄여도 WebView UA와 안전영역 변수를 재현하지 못한다.

## 결정적으로 고른 문항

무작위 추첨에 기대지 않도록 유형별로 고정한 문항입니다.

| 용도 | 문항 |
| --- | --- |
| 복수정답 | ISTQB-A Q6 |
| 진위형 | CSTS-2018 Q16 |
| 단답형 | CSTS-2018 Q18 |
| 그림 | ISTQB-A Q23 |
| 보기 표 | CSTS-2404 Q33 |
| 가/나/다/라 목록 | CSTS-2018 Q10 |
| 퀵 이동 판정 | `pinQuickDraw`(ISTQB-A Q1·Q2) — 퀵 제목은 원본 세트 번호라 섞이면 겹친다 |
