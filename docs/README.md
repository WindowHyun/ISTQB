# 문서 색인

이 폴더의 문서가 무엇을 담당하는지, **어떤 상황에서 어느 것을 여는지**를 정리합니다.

> 이 색인이 생긴 이유: 문서가 20개가 되도록 `docs/` 최상위에 목록이 없어, 어디서도
> 링크되지 않는 문서가 셋 생겼습니다(그중 하나는 계속 갱신되고 있는데도 길이 없었습니다).
> **문서를 새로 만들면 이 표에 줄을 추가합니다.** 추가하지 않으면 없는 문서와 같습니다.

## 변경을 시작하기 전에

| 무엇을 고치나 | 문서 |
| --- | --- |
| 무엇이든 — 먼저 읽는 라우팅·검증 표 | [`../AGENTS.md`](../AGENTS.md) |
| 문제 데이터·정답·선택지·해설·이미지 | [`harness/data.md`](./harness/data.md) |
| UI·CSS·렌더링·표·반응형 | [`harness/ui-render.md`](./harness/ui-render.md) |
| 풀이 모드·채점·통계·상태 저장 | [`harness/app-logic.md`](./harness/app-logic.md) |
| Android·Capacitor·APK·JS 브리지 | [`harness/android.md`](./harness/android.md) |
| 테스트·E2E·뮤테이션·CI | [`harness/testing.md`](./harness/testing.md) |

## 검증과 배포

| 알고 싶은 것 | 문서 |
| --- | --- |
| E2E 스펙이 무엇을 덮나 | [`e2e-test-scenarios.md`](./e2e-test-scenarios.md) |
| CI 워크플로 | [`ci/README.md`](./ci/README.md) |
| 릴리스 점검과 배포 절차 | [`release-playbook.md`](./release-playbook.md) |
| APK를 테스터에게 배포 | [`firebase-app-distribution.md`](./firebase-app-distribution.md) |

## 결정 기록 — [`decisions/`](./decisions/)

현행 규칙의 **경위와 당시 실측**입니다. 규칙 문서는 한 줄 근거와 함께 여기로 링크합니다.

| 문서 | 내용 |
| --- | --- |
| [`decisions/mutation-gates.md`](./decisions/mutation-gates.md) | 뮤테이션 게이트 분리, 저장 계층 래칫 라운드별 실측 |
| [`decisions/e2e-test-budget.md`](./decisions/e2e-test-budget.md) | 스펙 예산과 잡 타임아웃 부등식이 생긴 사건 |
| [`decisions/webkit-render-cost.md`](./decisions/webkit-render-cost.md) | WebKit 렌더 비용 측정, Safari 게이트 제거 |

## 점검 기록

읽기용 기록입니다. **당시 시점의 사실**을 보존하므로 수치를 현재값으로 덮어쓰지 않습니다.
현행 규칙은 위 표의 문서가 정본이고, 여기 적힌 값과 다르면 위쪽이 맞습니다.

| 문서 | 시점 | 내용 |
| --- | --- | --- |
| [`slimming-report-2026-09-29.md`](./slimming-report-2026-09-29.md) | 2026-09-29 | 문서·E2E·CI 축소안과 AGENTS.md·하네스 재설계안 |

## 아카이브 — [`archive/`](./archive/)

역할이 끝난 문서입니다. 지우지 않는 이유는 **당시의 판단 근거**가 남아 있어서입니다. 에이전트는 이 폴더를 현행 규칙의 근거로 쓰지 않습니다.

| 문서 | 시점 | 내용 |
| --- | --- | --- |
| `archive/code-audit-report.html` · `archive/code-audit-2026-08-18.md` | 2026-08-18~20 | 코드 점검 6회차(발견 16건·조치 15건). 결론은 하네스 문서와 테스트에 반영됨 |
| `archive/project-history.html` | ~2026-08-20 | 진행 기록(테스트·기획·커밋) |
| `archive/commit-dashboard.html` | 2026-07-30 | 커밋·이슈 대시보드(README 포트폴리오에서 링크) |
| `archive/report-weak-chapter-and-quick-random.md` | 2026-07-29 | 착수 전 조사·설계. 두 주제 모두 구현 완료 |
| `archive/qa-report.html` | 2026-07-26 | 구동 점검 리포트 |
