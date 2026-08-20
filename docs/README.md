# 문서 색인

이 폴더의 문서가 무엇을 담당하는지, **어떤 상황에서 어느 것을 여는지**를 정리합니다.
`docs/ci/`와 `docs/harness/`에는 각자의 색인이 따로 있습니다.

> 이 색인이 생긴 이유: 문서가 20개가 되도록 `docs/` 최상위에 목록이 없어, 어디서도
> 링크되지 않는 문서가 셋 생겼습니다(그중 하나는 계속 갱신되고 있는데도 길이 없었습니다).
> **문서를 새로 만들면 이 표에 줄을 추가합니다.** 추가하지 않으면 없는 문서와 같습니다.

## 변경을 시작하기 전에

| 무엇을 고치나 | 문서 |
| --- | --- |
| 무엇이든 — 먼저 읽는 라우팅 | [`../AGENTS.md`](../AGENTS.md) |
| 하네스 전략 전체와 검사 규약 | [`harness/README.md`](./harness/README.md) |
| 문제 데이터·정답·선택지·해설·이미지 | [`harness/data-harness.md`](./harness/data-harness.md) |
| UI·CSS·렌더링·표·반응형 | [`harness/ui-render-harness.md`](./harness/ui-render-harness.md) |
| 풀이 모드·채점·통계·상태 저장 | [`harness/app-logic-harness.md`](./harness/app-logic-harness.md) |
| Android·Capacitor·APK·**JS 브리지** | [`harness/android-build-harness.md`](./harness/android-build-harness.md) |
| 릴리스 전 검증(여러 영역에 걸친 변경) | [`harness/release-harness.md`](./harness/release-harness.md) |

## 검증과 배포

| 알고 싶은 것 | 문서 |
| --- | --- |
| E2E가 **무엇을** 테스트하나(전제·행위·기대) | [`e2e-test-scenarios.md`](./e2e-test-scenarios.md) |
| CI가 **어떻게** 도나(워크플로별 동작) | [`ci/README.md`](./ci/README.md) |
| 검증이 끝난 뒤 **실제로 내보내는** 절차 | [`release-playbook.md`](./release-playbook.md) |
| APK를 테스터에게 배포하는 방법 | [`firebase-app-distribution.md`](./firebase-app-distribution.md) |

## 점검 기록

읽기용 기록입니다. **당시 시점의 사실**을 보존하므로, 수치를 현재값으로 덮어쓰지 않습니다 —
덮어쓰면 그 점검이 무엇을 근거로 판단했는지가 사라집니다.

| 문서 | 시점 | 내용 |
| --- | --- | --- |
| [`code-audit-report.html`](./code-audit-report.html) | 2026-08-20 | 코드 점검 6회차 — 발견 16건·조치 15건·되돌림 검증 21/21. **읽기 좋은 쪽** |
| [`code-audit-2026-08-18.md`](./code-audit-2026-08-18.md) | 2026-08-18~20 | 같은 점검의 상세 근거·재현 절차 |
| [`project-history.html`](./project-history.html) | 갱신 중 | 진행 기록(테스트·기획·커밋) |
| [`commit-dashboard.html`](./commit-dashboard.html) | 2026-07-30 | 커밋·이슈 대시보드 |

## 아카이브 — [`archive/`](./archive/)

역할이 끝난 문서입니다. 지우지 않는 이유는 **당시의 판단 근거**가 남아 있어서입니다.

| 문서 | 왜 아카이브인가 |
| --- | --- |
| `archive/report-weak-chapter-and-quick-random.md` | 2026-07-29 **착수 전** 조사·설계 기록. 두 주제(약한 챕터 통계·퀵 랜덤) 모두 구현·병합 완료라 본문의 "미구현"·"미머지" 서술은 현재에 해당하지 않습니다(문서 머리에도 같은 경고가 있습니다) |
| `archive/qa-report.html` | 2026-07-26 구동 점검 리포트. 이후 점검이 두 번 더 있었습니다 |
