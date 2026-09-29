# 문서·테스트 축소 리포트 (2026-09-29)

> 점검 기록입니다. 수치는 **2026-09-29 시점 사실**이며 이후 덮어쓰지 않습니다.
> 목적: ① 쓸모가 줄어든 문서·기능 테스트를 찾아 축소안을 내고, ② Opus 5.5에 맞게
> 에이전트 프롬프트(`AGENTS.md`)와 하네스 문서를 다시 짜는 방향을 제시합니다.
> **이 리포트는 제안만 합니다 — 코드·테스트·문서는 아직 아무것도 지우지 않았습니다.**

---

## 0. 요약

| 영역 | 현재 | 문제 | 제안 후(추정) |
| --- | --- | --- | --- |
| 에이전트/하네스 문서 | `AGENTS.md` + 하네스 6개 = **836줄**, 매 작업마다 2~3개를 읽음 | 규칙보다 **사연·실측 이력**이 많음. 같은 경고가 4~7곳에 반복 | **~350줄**(규칙만), 이력은 아카이브로 |
| 그 밖의 문서 | md 12개 3,262줄 + HTML 4개 205KB | CI 문서는 YAML을 다시 설명, E2E 시나리오 문서는 테스트 제목을 다시 적음, 점검 기록이 현행 문서 옆에 있음 | 현행 문서 **~40% 축소**, 점검 기록은 `archive/`로 |
| 기능 E2E(`react`) | **57개 스펙 · 약 470건**, CI **10분 52초** | 제목 기준으로도 **중복 60건 이상**. 한 동작을 3~4개 파일이 각자 검사함 | **약 15개 파일 · 330~350건**, PR 게이트 **5~6분**(추정) |
| CI 벽시계 | **16분 39초**(run #300) — `mutation-storage` 16분 19초가 임계 경로 | 저장 계층을 건드리지 않은 PR도 16분을 기다림 | 경로 필터 + 야간 실행으로 PR **~11분 → E2E 정리 뒤 ~6분** |
| 유닛(vitest) | 49개 파일 · 8,286줄, CI 14초 | **건강함.** 축소 대상 아님 | 오히려 E2E에서 유닛으로 **내려보낼** 검사가 있음 |

가장 효과가 큰 세 가지:

1. **`AGENTS.md`와 하네스 문서를 "규칙 + 명령"만 남기고 줄입니다.** 사연은 ADR/아카이브로 보냅니다(§2, §5).
2. **E2E 중복 스펙 13개를 지우거나 합치고**, 탐색형(몽키·전수·페어와이즈) 스펙은 PR 게이트에서 빼 야간으로 돌립니다(§3).
3. **`mutation-storage`에 경로 필터를 겁니다** — 이것 하나로 대부분의 PR이 5분 이상 빨라집니다(§4).

---

## 1. 무엇을 조사했나

- 모든 `*.md`(node_modules·android 제외)의 줄 수와 목차, 하네스 문서 6개 전문.
- `e2e/*.spec.ts` 60개 파일의 `test(...)` 제목 전수(약 520건) + 중복이 의심되는 스펙은 본문을 표본으로 확인.
- `playwright.config.ts`, `.github/workflows/*.yml`, 최근 main CI run #300(2026-09-17)의 잡별 소요 시간.
- 문서 간 반복되는 문장(grep).

**한계:** E2E 중복 판정은 **제목과 표본 본문**에 근거합니다. 삭제 전에는 §3.4 절차로
테스트 하나하나가 정말 다른 곳에서 덮이는지 확인해야 합니다.

---

## 2. 문서

### 2.1 현황

| 문서 | 줄 | 성격 | 판단 |
| --- | ---: | --- | --- |
| `AGENTS.md` | 61 | 에이전트 상시 로드 | **재작성**(§5) — 줄 수보다 **밀도**가 문제 |
| `docs/harness/README.md` | 241 | 하네스 전략 | **~60줄로 축소.** 약 140줄이 뮤테이션 래칫 **실측 이력**(라운드 표, timeout 분석, 69 vs 68 논의) |
| `docs/harness/app-logic-harness.md` | 157 | 앱 로직 | **유지·압축.** "반복해서 나온 결함 클래스" 12항은 가장 값진 내용 — 항목당 2줄(규칙 + 근거 파일)로 |
| `docs/harness/ui-render-harness.md` | 164 | UI | **~70줄로 축소.** Safari/ResizeObserver **미검증 가설** 50줄은 이슈 #169로 옮기고 링크만 |
| `docs/harness/data-harness.md` | 126 | 데이터 | **소폭 축소.** `norm()` 경고가 ui-render에도 반복 |
| `docs/harness/android-build-harness.md` | 98 | Android | **유지.** JS 브리지 계약 표는 꼭 필요 |
| `docs/harness/release-harness.md` | 89 | 릴리스 전 점검 | **`release-playbook.md`에 합치기.** 명령 블록이 harness README와 같음 |
| `docs/release-playbook.md` | 346 | 배포 절차 | **§7 "현재 알려진 이슈"(08-01·08-13 기준)** 는 오래된 정보 → 이슈 트래커로. 나머지 유지 |
| `docs/e2e-test-scenarios.md` | 269 | 테스트 제목 재서술 | **삭제하거나 자동 생성으로 대체.** 자기 규칙("개수를 적지 않는다")을 스스로 어김 — 섹션 제목에 `(10)`·`(5)`·`(6)`… 개수가 남아 있음 |
| `docs/ci/*.md` (4개) | 345 | YAML 재서술 | **`ci/README.md` 한 장(~30줄 표)으로.** 정본은 YAML과 그 주석 |
| `docs/firebase-app-distribution.md` | 113 | APK 배포 | `ci/android-firebase.md`·`release-playbook §3`과 3중 → **playbook 하나로** |
| `docs/code-audit-2026-08-18.md` | 797 | 점검 기록 | **`archive/`로.** 결론은 이미 하네스 문서·테스트에 반영됨 |
| `docs/*.html` 3개 + `archive/qa-report.html` | 205KB | 점검 기록·대시보드 | **`archive/`로**(포트폴리오 링크가 필요하면 README에서만) |
| `README.md` | 324 | 포트폴리오(사람용) | **유지.** 에이전트용이 아니므로 이번 범위 밖 |

### 2.2 같은 내용이 여러 곳에 있다

| 내용 | 등장 위치 | 정본으로 둘 곳 |
| --- | --- | --- |
| "실기기 Safari 30초 확인" | 7곳(`AGENTS.md`, 하네스 3개, playbook, e2e 시나리오, code-audit) | `release-playbook.md` Go/No-Go 한 곳 |
| "Playwright 스위트 동시 실행 금지" | 4곳(`AGENTS.md`, harness README, release-harness, `playwright.config.ts` 주석) | `playwright.config.ts` 주석 + `AGENTS.md` 한 줄 |
| 기본 명령 세트(lint·typecheck·verify·test·e2e) | 3곳(harness README, app-logic, release) | `AGENTS.md` 표 한 곳 |
| "보고 체크리스트" | 6곳(`AGENTS.md` + 하네스 5개가 각자) | `AGENTS.md` 한 곳 + 영역별 **추가 항목**만 |
| "`verify`만 돌리고 끝내지 말 것" | 2곳 | `AGENTS.md` 검증 표가 대체(표에 이미 영역별 명령이 있으면 경고가 불필요) |

반복은 갱신 부채입니다. 실제로 "테스트 개수" 규칙은 `AGENTS.md`에서 선언했는데 `e2e-test-scenarios.md` 섹션 제목에는 개수가 남아 있습니다.

### 2.3 문서 축소 원칙

- **현행 규칙 문서**와 **점검·결정 기록**을 폴더로 가릅니다. 에이전트가 `grep`으로 오래된 사실(당시 break 값, 당시 커버리지)을 현행 규칙으로 읽는 일을 막기 위해서입니다.
- 사연은 지우지 않고 `docs/decisions/`(짧은 ADR) 또는 `archive/`로 옮깁니다. 규칙 문서에는 **한 줄 근거 + 링크**만 남깁니다.
- 수치는 **코드·설정이 강제하는 것**만 적습니다(12세트 626문항, break 85/68). 실측값(94.30%, 71.37%, 2,491조각)은 CI 로그가 정본입니다.

---

## 3. 기능 E2E(`react` 프로젝트)

### 3.1 현황

- 파일 57개(+ `helpers.ts`), `test(...)` 약 470건. CI 잡 `E2E smoke` **10분 52초**(러너 워커 2개).
- 파일 이름이 **도메인이 아니라 생긴 시점**을 따릅니다: `react-final`, `react-phase2`, `react-edge-*`(9개), `react-features`, `react-functional`, `react-smoke`. 같은 동작을 검사하는 곳이 흩어진 직접 원인입니다.
- `waitForTimeout` 고정 대기 **약 90회**(`react-persistence` 11, `react-uiux-quick` 11, `react-study-ux` 10, `react-transition` 7 …). 시간과 플래키의 원천입니다.
- `pageerror` 수집 코드가 27곳에 복붙돼 있습니다 — 공용 fixture로 뺄 수 있습니다.

### 3.2 중복 클러스터(제목 기준)

| 동작 | 검사하는 파일 | 남길 곳 |
| --- | --- | --- |
| 제품 선택 → 문항 렌더 | `smoke`, `functional`, `transition`(T1/T2), `userflow` | `transition` |
| 시험 채점 → 점수 | `grade`, `functional`, `transition`(T21), `modes` | `transition` |
| 연습 피드백이 다음 문항으로 새지 않음 | `feedback`, `functional` | `functional`→통합 파일 |
| 첫/마지막 문항 이전·다음 비활성, 화살표 이동 | `navigation`(6), `edge-nav`(14) | `edge-nav` |
| 그림 로드 · 라이트박스 열림 | `content`, `edge-content`, `edge-figtable`, `features` | `edge-figtable` |
| 라이트박스 Esc/✕/배경 닫기 · 스크롤 잠금 | `edge-content`, `final` | `edge-content` |
| 잘못된 가져오기 토스트 | `edge-content`, `final`, `persistence`, `edge-persist` | `edge-persist` |
| `?debug` 콘솔 | `debug`, `edge-content`, `edge-modal` | `edge-modal` |
| 미응답 확인 모달(개수·Esc 취소) | `edge-grade`(4), `final`(3), `features`, `study-ux` | `edge-grade` + `study-ux`(검토 팔레트) |
| CSTS 배점 합산 결과 | `edge-grade`, `final` — **제목까지 같음** | `edge-grade` |
| 진위형 O 선택 즉시 피드백 · 정답 키 | `qtypes`, `edge-grade` — **제목까지 같음** | `qtypes` |
| 복수정답 해제 · 개수 초과 금지 | `edge`, `edge-grade`, `modes` | `edge-grade` |
| 모드 전환 → 1번 문항·진행 0 | `edge`, `edge-modes`, `final` | `edge-modes` |
| 세트 변경 → 1번 문항 | `content`, `edge-nav` | `edge-nav` |
| 새로고침 → 게이트 복귀 · 답안 복원 · 세트 유지 | `persistence`, `edge-persist`, `final` | 하나로 합친 `persistence` |
| 설정 모달 열기/닫기/Esc/테마 | `settings`, `edge-modal`, `features` | `edge-modal` |
| 모바일 드로어 열기/닫기 · 점프핀 · 태블릿 렌더 | `layout`, `responsive`, `edge-responsive` | `edge-responsive` |
| 통계에 이력이 쌓임 | `features`, `edge-modal`, `phase2`, `stats` | `stats` |
| `aria-current`·`aria-pressed` | `a11y`, `edge-nav`, `edge-modes` | `a11y` |
| 타이머 1초 증가 | `content`, 비기능 `NF9` | `NF9` |
| 미니 시험 ≤10문항 로드 | `functional`, `edge-modes`, `transition`(T5) | `transition` |

### 3.3 파일 단위 제안

**A. 삭제(고유 검사는 옮긴 뒤)** — 13개 파일, 약 75건

| 파일 | 건 | 옮길 고유 검사 |
| --- | ---: | --- |
| `react-smoke` | 1 | 없음(`pageerror` 검사는 공용 fixture로) |
| `react-grade` | 1 | 없음 |
| `react-feedback` | 1 | 없음 |
| `react-navigation` | 6 | "답하면 팔레트 번호가 answered" 1건 → `edge-nav` |
| `react-debug` | 3 | 없음 |
| `react-final` | 15 | "세트 로딩 지연 시 스켈레톤" 1건 → `robustness` |
| `react-features` | 7 | "라이트박스 포커스 트랩" 1건 → `a11y`, "세트 드롭다운 문항 수" 1건 → `edge-nav` |
| `react-edge` | 7 | 없음(`transition` T38·`NF6`이 덮음) |
| `react-modes` | 6 | 없음 |
| `react-layout` | 4 | "데스크톱 팔레트 접기" → `edge-nav`에 이미 있음 |
| `react-settings` | 6 | 글자 크기 두 단계 → `edge-modal` |
| `react-content` | 8 | "가/나/다/라 렌더"·"연습 피드백에 해설" 2건 → `edge-content` |
| `react-pwa` | 2 | 없음 — "업데이트 배너가 기본으로 안 보인다"는 거의 아무것도 증명하지 못함 |

**B. 합치기**

| 합칠 파일 | 새 파일 | 이유 |
| --- | --- | --- |
| `persistence` + `edge-persist` + `edge-import` | `persistence.spec.ts` | 같은 계층. `edge-import` 9건 중 대부분은 유닛(`storage.import`·`storage.sanitize`)과 중복 → **e2e는 2건만** |
| `responsive` + `edge-responsive` | `responsive.spec.ts` | 뷰포트 설정이 같음 |
| `exam-timer` + `flow-ux`의 제한시간 3건 | `exam-timer.spec.ts` | 같은 기능이 두 곳 |
| `modes` 잔여 + `edge-modes` + `state-matrix` | `modes.spec.ts` | 상태 전이는 `transition`이 전수로 봄. `state-matrix`는 그 부분집합인지 확인 후 결정 |
| `quick` + `quick-ux` + `quick-resilience` + `quick-wrongnote` + `uiux-quick` + `transition-quick` | `quick-*.spec.ts` 2~3개 | 퀵만 6개 파일 |
| `phase2` + `weakness` + `stats` | `stats.spec.ts` | 모두 통계 대시보드 |
| `back-dismiss`의 "정답 표기" describe | `qtypes`로 이동 | 뒤로가기와 무관한 검사가 잘못 들어가 있음 |

이름은 **생긴 시점이 아니라 도메인**으로 바꿉니다(`edge-`·`final`·`phase2` 접두 폐지). 파일 이름만으로 "이 동작은 어디서 검사하나"에 답할 수 있으면 `e2e-test-scenarios.md` 같은 색인 문서가 필요 없어집니다.

**C. PR 게이트에서 빼고 야간(Daily)으로**

| 스펙 | 비용(harness README 실측) | 성격 |
| --- | --- | --- |
| `react-monkey` (시드 3개) | 시드당 1.7~2.2분 → **~6분** | 탐색형 |
| `react-fullsweep` (1280·390) | 폭당 43초 → ~1.5분 | 626문항 전수 렌더 |
| `react-fullgrade` | 1.2분 | 12세트 완주 |
| `react-pairwise` | 1.1분 | 조합 |
| `react-random-smoke` | — | 시드 무작위 |
| `react-consistency` (예산 300초 × 4) | — | 교차 정합 |
| `react-a11y-axe` (예산 300초 × 3) | — | axe 스캔 |

합치면 **워커-분으로 10분 이상**, 워커 2개 기준 PR E2E 잡에서 **~5분**이 빠집니다(추정). 이들은 가치가 있지만 **변경과 무관하게 넓게 훑는** 검사라 매 PR마다 돌릴 이유가 약합니다. 지금 Daily E2E는 **바뀌지 않은 코드에 PR 게이트를 그대로 다시 돌리고** 있어 거의 새 정보를 주지 못합니다 — 탐색형 스펙을 그쪽으로 옮기면 Daily가 제 역할을 갖게 됩니다.

> 데이터(`www/data/**`)나 `parser.tsx`를 바꾼 PR에서는 `fullsweep`·`fullgrade`를 경로 필터로 PR에서도 돌립니다 — 그 변경을 잡는 검사가 이 둘뿐입니다.

### 3.4 삭제 절차(안전장치)

1. 삭제 후보마다 "이 `expect`가 다른 파일 어디에 있나"를 표로 적습니다(없으면 옮김).
2. 옮긴 검사는 AGENTS.md 규칙대로 **대상 결함을 되돌려 실패하는 것을 확인**합니다.
3. 삭제 PR과 이동 PR을 가릅니다 — 한 PR에서 둘 다 하면 커버리지가 빠졌는지 리뷰로 보기 어렵습니다.
4. `waitForTimeout`은 파일을 합칠 때 함께 `expect.poll`/`waitForList`로 바꿉니다(새 파일에 옮겨 붙이지 않기).

### 3.5 유닛으로 내려보낼 것

- `react-edge-import` 대부분(정제·잘못된 타입·5만 자 문자열) → 이미 `storage.import.test.ts`·`storage.sanitize.test.ts`가 같은 계약을 봅니다. 앱 배선 확인용 1~2건만 e2e에 남깁니다.
- `react-random-smoke`의 "무작위 답안 점수 = 데이터 기대값"은 `scoring`·`properties.test.ts`(fast-check)로 대체 가능한지 검토합니다.

---

## 4. CI

run #300(2026-09-17, main) 잡별 소요:

| 잡 | 소요 | 비고 |
| --- | ---: | --- |
| **mutation-storage** | **16분 34초** | 임계 경로 |
| e2e | 11분 22초 | 테스트 단계만 10분 52초 |
| mutation(코어) | 4분 3초 | |
| android-build | 2분 32초 | |
| codeql · apk · nonfunctional · unit · 나머지 | 각 1분 30초 이하 | |

제안:

1. **`mutation-storage`에 경로 필터**: `src/utils/storage*.ts`, `src/store/**`, `stryker.storage.config.json`이 바뀐 PR에서만 실행 + main 야간 1회. 저장 계층을 건드리지 않은 PR의 CI가 **16.6분 → 11.4분**이 됩니다. 래칫 규칙("검사를 보강하면 break 올리기")은 그대로 유지됩니다.
2. **E2E 정리(§3) 후** PR 벽시계 **~6분**(추정).
3. **Daily E2E**를 "PR 게이트 재실행"에서 "탐색형 스위트 + 뮤테이션 storage"로 바꿉니다. 매일이 과하면 주 2~3회로.

---

## 5. Opus 5.5에 맞춘 프롬프트·하네스 재설계

### 5.1 지금 문서가 최신 모델에 안 맞는 지점

| 현재 방식 | 문제 | 바꿀 방향 |
| --- | --- | --- |
| **굵게·⚠·"반드시"가 많음** | 최신 모델은 지시를 **문자 그대로, 강하게** 따릅니다. 강조가 많으면 모든 규칙이 최우선이 돼 사소한 변경에도 전 스위트를 돌리는 식으로 **과잉 적용**됩니다 | 강조는 되돌리기 어려운 것(데이터 id 변경, 테스트 skip 금지) 몇 개에만. 나머지는 평서문 + 이유 한 줄 |
| **사연 중심**("실제로 …했다", 실측표) | 매 세션 컨텍스트를 태우지만, 모델은 **규칙과 이유 한 줄**이면 충분히 일반화합니다 | 규칙 1줄 + 근거 1줄 + 링크. 사연은 `docs/decisions/` |
| **라우팅이 산문** | 모델이 영역을 스스로 판단하다 빠뜨리면 검증이 빠집니다 | 경로 → 명령 **표 하나**. 더 나아가 **스크립트로**(§5.3) |
| **보고 체크리스트 6벌** | 어느 것을 따를지 모호 | `AGENTS.md`에 하나 + 영역 문서는 "추가 항목"만 |
| **오래된 수치가 규칙 문서에 섞임** | 모델이 옛 값을 현재 값으로 인용 | 수치는 설정 파일·CI 로그만 정본 |
| **"하지 말 것" 위주** | 무엇을 할지가 빠진 금지는 우회를 부릅니다 | "X 대신 Y를 한다" 형식 |

### 5.2 새 문서 구조(제안)

```
AGENTS.md                      ~40줄  라우팅 표 · 검증 표 · 완료 기준 · 보고 형식 · 금지 5개
docs/harness/
  data.md                      ~70줄  규칙 + 결함 클래스
  ui-render.md                 ~60줄
  app-logic.md                 ~90줄  결함 클래스 12항은 유지(항목당 2줄)
  android.md                   ~70줄  JS 브리지 계약 표 유지
  testing.md                   ~60줄  E2E 단언 규약 · 테스트 예산 부등식 · 뮤테이션 게이트 규칙
docs/release-playbook.md              release-harness 흡수, §7 제거
docs/ci/README.md              ~30줄  잡 표만
docs/decisions/                       뮤테이션 래칫 이력, Safari 게이트 제거, WebKit 가설 …
docs/archive/                         code-audit-*, *.html, e2e-test-scenarios(삭제 시)
```

### 5.3 산문 대신 코드로 강제할 것

모델이 문서를 읽고 판단하는 것보다 **실행하면 알려 주는 것**이 더 확실합니다.

- **`npm run check:changed`** — `git diff --name-only origin/main`을 읽어 영역을 분류하고 필요한 명령만 돌리는 스크립트. `AGENTS.md`의 라우팅 표와 검증 표가 이 스크립트 하나로 바뀝니다. 에이전트든 사람이든 "무엇을 돌려야 하나"를 판단할 필요가 없어집니다.
- **`test.setTimeout` 부등식 검사** — 스펙 예산 × 2 + 스위트 시간 < 잡 timeout을 문서 대신 작은 lint 스크립트로.
- **공용 fixture**(`e2e/fixtures.ts`)로 `pageerror` 0건을 모든 테스트에 자동 적용 — 스모크 스펙이 필요 없어집니다.
- (선택) **`.claude/skills/`** — 자주 하는 절차(데이터 정정 배포, 뮤테이션 래칫 올리기)를 스킬로 두면 필요할 때만 로드되어 상시 컨텍스트가 줄어듭니다. PR을 끝까지 몰고 가는 에이전트 규약이 필요하면 `.claude/skills/steward/SKILL.md`가 그 자리입니다.

### 5.4 `AGENTS.md` 초안

```markdown
# AGENTS.md

ISTQB/CSTS 문제 풀이 앱(React + Vite, Capacitor Android). 데이터 정본은 `www/data/`.

## 시작 전
변경 경로로 영역을 정하고 해당 하네스 문서만 읽는다.

| 경로 | 문서 |
| --- | --- |
| `www/data/**`, `scripts/*questions*`, `scripts/normalize-*` | docs/harness/data.md |
| `src/components/**`, `src/styles/**`, `src/utils/parser.tsx` | docs/harness/ui-render.md |
| `src/store/**`, `src/hooks/**`, `src/utils/**`(parser 제외) | docs/harness/app-logic.md |
| `android/**`, `capacitor.config.json`, JS 브리지 | docs/harness/android.md |
| `e2e/**`, `*.test.ts`, `stryker*.json`, CI | docs/harness/testing.md |

## 검증
`npm run check:changed`가 변경 영역에 맞는 명령을 고르고 실행한다. 수동으로 돌릴 때:

| 변경 | 명령 |
| --- | --- |
| 모든 코드 | `npm run lint && npm run typecheck && npm run typecheck:test && npm test` |
| 데이터 | + `npm run verify && python3 scripts/verify-pdf-data.py` |
| UI·앱 동작 | + `npm run test:e2e` (모바일 레이아웃이면 `npm run test:apk`) |
| 채점·통계 순수 로직 | + `npm run test:mutation` |
| storage.ts · useQuizStore.ts | + `npm run test:mutation:storage` (~12분) |

Playwright 스위트는 한 번에 하나만 실행한다(같은 포트와 dist/를 공유한다). 여럿이면 `npm run test:e2e:all`.

## 완료 기준
- 위 명령이 통과한다. 못 돌린 것은 이유와 함께 보고한다.
- 새 검사는 대상 결함을 되돌려 실패하는 것을 한 번 확인한다.
- 기존 검사가 못 잡는 결함 유형을 찾았으면 검사를 추가하거나 추가안을 적는다.

## 하지 않는 것
- 문항 id 변경(사용자 기록이 id에 묶여 있다).
- 테스트 skip·삭제로 CI 통과시키기.
- 빌드·테스트 전용 의존성을 `dependencies`에 넣기(audit 게이트가 막힌다).
- 문서에 실측 수치 적기(정본은 CI 로그). 설정이 강제하는 계약 수치만 적는다.

## 보고
변경 내용 · 읽은 하네스 문서 · 실행한 명령과 결과 · 생략한 점검과 이유.
```

현재 `AGENTS.md`에 있는 "모듈로 꺼내기" 사례(sessionDerive +2.84%p 등), Stryker 게이트 분리 이유, 테스트 개수 정책 사연은 `docs/harness/testing.md`와 `docs/decisions/`로 옮깁니다.

---

## 6. 실행 순서(제안)

| 단계 | 내용 | 위험 | 효과 |
| --- | --- | --- | --- |
| 1 | `mutation-storage` 경로 필터 + 야간 | 낮음 | PR 벽시계 −5분 |
| 2 | 점검 기록·HTML을 `archive/`로, `ci/*.md`를 한 장으로, `e2e-test-scenarios.md` 정리 | 낮음(문서만) | 에이전트가 오래된 사실을 읽을 위험 제거 |
| 3 | `AGENTS.md`·하네스 재작성(§5), 사연은 `decisions/`로 | 낮음 | 상시 컨텍스트 약 60% 감소 |
| 4 | E2E: 공용 fixture → 삭제 13개 파일(고유 검사 이동 먼저) | 중간 | ~75건·고정 대기 다수 제거 |
| 5 | E2E: 합치기·이름 바꾸기, 탐색형을 Daily로 | 중간 | PR E2E ~5분 단축 |
| 6 | `check:changed` 스크립트 | 낮음 | 라우팅이 문서가 아니라 코드가 됨 |

각 단계를 별도 PR로 나누면 리뷰가 쉽고 되돌리기도 쉽습니다.
