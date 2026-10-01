# CI 워크플로

정본은 `.github/workflows/*.yml`과 그 주석입니다. 여기에는 **워크플로 파일만 봐서는 알기 어려운 것**(왜 그렇게 짰나, 운영하면서 알아야 할 것)만 적습니다.

| 워크플로 | 트리거 | 하는 일 |
| --- | --- | --- |
| `ci.yml` | main push · PR · 수동 | 머지 게이트. 잡 15개 병렬(아래) |
| `daily-e2e.yml` | 매일 KST 09:17 · 수동 | PR 게이트에서 뺀 무거운 검사 + main 기준 드리프트 감시. 실패하면 추적 이슈 |
| `android-firebase.yml` | 수동 · `v*` 태그 | APK 빌드 → Firebase App Distribution. 절차는 [`../firebase-app-distribution.md`](../firebase-app-distribution.md) |

## `ci.yml` 잡

| 잡 | 명령 | 막는 것 |
| --- | --- | --- |
| `lint` | `lint` · `typecheck` · `typecheck:test` | 앱 `tsconfig`는 테스트·e2e·`middleware.ts`를 검사하지 않음 — 세 번째 명령이 없으면 그 파일들은 타입 검사를 한 번도 받지 않는다 |
| `verify-data` | `npm run verify` | 문항 스키마·정답·이미지·재수록 표 |
| `pdf-data` | `python3 scripts/verify-pdf-data.py` | 원본 PDF와 텍스트·정답·밑줄 대조, 그리고 PDF 문장이 JSON에서 잘리지 않았는지(역방향) |
| `unit` | `npm run test:cov` | 유닛 + 커버리지 바닥(값은 `vitest.config.ts`) |
| `mutation` | `npm run test:mutation` | 채점·통계 순수 로직(break 85) |
| `mutation-storage` | `npm run test:mutation:storage` | 저장 계층(break 68). **경로 필터** — 아래 참고 |
| `build` | `build` + `size` | 번들 예산(gzip JS 140KB·CSS 12KB, 서비스워커 포함) |
| `android-build` | `build` → `cap sync` → 낡은 `android/` 검사 → `assembleDebug` | 네이티브 컴파일·JS 브리지 시그니처 |
| `e2e` | `npm run test:e2e` | 기능 E2E(`react` 프로젝트) |
| `e2e-sweep` | `explore-fullsweep` · `explore-fullgrade`, 탐색 스펙이 바뀌면 `explore` 전체 | 626문항 전수 렌더·12세트 완주. **경로 필터** — 데이터·렌더 경로나 탐색 스펙·E2E 공용 헬퍼가 바뀐 PR만 |
| `nonfunctional` | `npm run test:nf` | 성능·오프라인·타이머·저장 내구성. 시간 예산은 CI에서 2~3배 완화 |
| `apk` | `npm run test:apk` | Pixel 7 + WebView UA + 안전영역 주입 모사 |
| `audit` | `npm audit --omit=dev --audit-level=high` | 배포 번들 의존성의 high+ 취약점 |
| `secrets` | gitleaks | 커밋 히스토리의 시크릿 |
| `codeql` | CodeQL `security-and-quality` | JS/TS 정적 분석 |

### 알아야 할 것

- **경로 필터:** `mutation-storage`와 `e2e-sweep`은 늘 실행돼 초록으로 끝나지만, 무거운 단계는 `scripts/changed-areas.js`가 해당 영역(`mutationStorage` · `sweep` · `explore`) 변경을 감지했을 때만 돈다. 뮤테이션 영역은 고정 목록이 아니라 Stryker 설정의 `mutate`에서 import 그래프로 계산한다 — 대상이 import하는 모듈, 대상에 닿는 테스트와 그 길목 모듈(`import type`은 제외). 전수 스윕 스펙 목록의 정본은 같은 파일의 `SWEEP_SPECS`다. 필터 밖의 변경이 만드는 드리프트는 `daily-e2e.yml`이 main에서 잡는다. 분류 규칙을 바꾸면 `scripts/changed-areas.test.ts`도 함께 고친다.
- **`audit`가 `--omit=dev`인 이유:** 사용자에게 나가는 것은 프로덕션 의존성뿐이다. 이 게이트가 의미를 가지려면 `package.json` 분류가 정확해야 한다 — 빌드·테스트 전용 패키지가 `dependencies`에 들어가면 배포되지도 않는 패키지의 권고로 CI가 막힌다(실제로 `vite → postcss → nanoid`로 막힌 적이 있다).
- **`codeql`:** 이 잡만 `security-events: write` 권한을 받는다. 저장소 설정에서 CodeQL default setup을 켜면 이 워크플로와 충돌하므로 둘 중 하나만 쓴다.
- **잡 timeout과 스펙 예산:** `스펙 최대 test.setTimeout × 2(CI 재시도) + 정상 스위트 시간 < 잡 timeout`. 깨지면 멈춘 스펙이 예산을 태우는 동안 잡이 먼저 잘려 로그에 원인이 남지 않는다. 자세한 것은 [`../harness/testing.md`](../harness/testing.md).
- **CI 재현:** `CI=1 npm run test:e2e` — 재시도 1회·HTML 리포트·서버 강제 재기동이 CI와 같아진다.

## `daily-e2e.yml`

- 잡: 기능 E2E · 탐색 E2E(`explore` 전체 — 몽키·전수 스윕·페어와이즈 등, PR 게이트 밖) · 비기능 · 저장 계층 뮤테이션.
- 실패 알림은 **예약 실행일 때만** 나간다(`workflow_dispatch`로 손으로 돌리다 이슈가 열리지 않게). `daily-e2e-failure` 라벨이 붙은 열린 이슈가 있으면 거기에 코멘트를 달고, 없으면 새로 연다. 원인을 고친 뒤 이슈를 닫는다.
- APK 스위트는 여기서 돌리지 않는다 — 러너·의존성 드리프트에 노출되는 면이 기능 E2E와 겹친다.
- 저장소에 60일 동안 활동이 없으면 GitHub이 예약 트리거를 자동으로 끈다.
