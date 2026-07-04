# CI E2E 파이프라인 — 동작 방식 & 코드 설명

CI에서 Playwright E2E 테스트가 **어떻게 실행되는지**를 코드와 함께 설명하는 문서입니다.
(시나리오 목록은 [`e2e-test-scenarios.md`](./e2e-test-scenarios.md) 참고 — 이 문서는 "실행 메커니즘"만 다룹니다.)

관련 파일: `.github/workflows/ci.yml`, `.github/workflows/daily-e2e.yml`, `playwright.config.ts`, `package.json`

---

## 1. 한눈에 보는 흐름

```
push(main) / PR / 수동 실행
        │
        ▼
CI 워크플로(5 job 병렬) ── lint · verify-data · unit · build · e2e
                                                          │
                                                          ▼
                        [e2e job]
   checkout → Node22 → npm ci(브라우저 skip) → 브라우저 캐시/설치
        → npm run test:e2e (= playwright test)
             │
             ├─ webServer: npm run build && npm run preview  → dist/를 4173 포트로 서빙
             └─ react-*.spec.ts 253개를 Chromium으로 병렬 실행 (CI 재시도 1회)
                      │
                      ▼
        통과 → job 성공 / 실패 → playwright-report 아티팩트 업로드
```

핵심 요약: **운영 배포본과 동일한 `dist/`를 `vite preview`로 띄우고, 그 위에서 Chromium으로 E2E 시나리오를 병렬 실행**한다.

---

## 2. 언제 도는가 (트리거)

`.github/workflows/ci.yml`:

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

- **main push · 모든 PR · 수동(`workflow_dispatch`)** 에 실행.
- `concurrency` — 같은 ref에서 새 실행이 뜨면 **진행 중이던 이전 실행을 취소**(중복 실행/분 낭비 방지).
- CI는 `lint` · `verify-data` · `unit` · `build` · `e2e` **5개 job이 독립·병렬**로 돈다. E2E는 그중 하나.

전역 env:

```yaml
env:
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
```

`npm ci` 시 Playwright가 브라우저를 자동으로 받지 않게 막는다 — 브라우저는 e2e job에서 **캐시 우선 + 명시 설치**한다(아래 4단계).

---

## 3. e2e job 정의

```yaml
e2e:
  name: E2E smoke (Playwright)
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - name: Cache Playwright browsers
      uses: actions/cache@v4
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
        restore-keys: |
          playwright-${{ runner.os }}-
    - run: npx playwright install --with-deps chromium
    - run: npm run test:e2e
    - name: Upload Playwright report
      if: ${{ failure() }}
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 7
        if-no-files-found: ignore
```

### 단계별 설명

| 단계 | 하는 일 |
| --- | --- |
| **checkout / Setup Node 22** | 소스 체크아웃 + Node 22 설치, `cache: npm`으로 npm 캐시 재사용 |
| **`npm ci`** | 의존성 설치. 전역 env로 **브라우저는 이 시점에 받지 않음** |
| **Cache Playwright browsers** | `~/.cache/ms-playwright`를 `package-lock.json` 해시 키로 캐시. 락파일 불변 시 브라우저 다운로드 skip → 속도↑ |
| **`npx playwright install --with-deps chromium`** | Chromium + 리눅스 **시스템 의존성(폰트·라이브러리)** 설치. `--with-deps`가 헤드리스 리눅스 구동의 핵심 |
| **`npm run test:e2e`** | 실제 실행 (= `playwright test`). config가 서버 기동·병렬·재시도를 담당(§4) |
| **Upload Playwright report** | `if: failure()` — **실패 시에만** HTML 리포트(`playwright-report/`)를 아티팩트로 업로드(7일). Actions에서 내려받아 실패 원인 분석 |

> `timeout-minutes: 20` — job 자체 상한. config의 webServer/테스트 타임아웃과는 별개 안전장치.

---

## 4. `npm run test:e2e` = `playwright test` — config가 하는 일

`package.json`: `"test:e2e": "playwright test"` → `playwright.config.ts`가 실행 규칙을 정의한다.

```ts
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: { trace: "on-first-retry" },
  projects: [
    {
      name: "react",
      testMatch: /react-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" },
    },
  ],
  webServer: [
    {
      command: "npm run build && npm run preview",
      url: "http://localhost:4173/",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

| 항목 | 의미 |
| --- | --- |
| `testDir: "./e2e"` + project `react` (`testMatch: /react-.*\.spec\.ts/`) | `e2e/react-*.spec.ts` 파일만 실행(현재 253개). 레거시 프로젝트는 제거됨 → **React 단일 프로젝트** |
| `baseURL: http://localhost:4173` | 테스트의 `page.goto("/")`가 이 주소로 감 |
| `fullyParallel: true` | 파일 단위 **병렬 실행**(러너 CPU 수만큼 워커) |
| `forbidOnly: CI` | CI에서 `test.only`가 남아 있으면 **실패 처리**(실수로 일부만 도는 것 방지) |
| `retries: CI ? 1 : 0` | **CI에서만 실패 시 1회 자동 재시도**(환경성 플레이키 흡수). 로컬은 0 |
| `reporter: CI ? html : list` | CI는 HTML 리포트 생성 → 실패 시 `playwright-report/`가 §3에서 업로드됨. 로컬은 `list` |
| `trace: "on-first-retry"` | 재시도가 걸리는 케이스에만 trace(스텝 스냅샷·네트워크·DOM) 기록 → 디버깅용 |

### webServer — 앱을 어떻게 띄우나 (가장 중요한 부분)

Playwright는 테스트 시작 **전에** `webServer.command`를 실행해 앱 서버를 자동 기동하고, `url`이 응답하면 테스트를 시작한다.

- **`npm run build && npm run preview`**
  - `build`(= `tsc && vite build`) 앞의 **`prebuild` 훅이 `sync-assets`** 를 돌려 `www/` 정본 데이터를 `public/`·`dist/`로 동기화한 뒤 빌드.
  - `preview`(= `vite preview --port 4173 --strictPort`)가 **`dist/`를 4173 포트로 정적 서빙**.
  - → 테스트 대상이 **실제 운영 배포본(Vercel `dist`)과 동일한 산출물**이라는 점이 핵심. 소스가 아니라 빌드 결과를 검증한다.
- **`url: http://localhost:4173/`, `timeout: 180_000`** — 이 URL이 200을 응답할 때까지 최대 180초 대기 후 테스트 시작.
- **`reuseExistingServer: !CI`** — 로컬은 이미 떠 있는 서버 재사용, **CI는 항상 새로 기동**(깨끗한 상태). 테스트 종료 시 서버 정리.

---

## 5. 통과/실패 판정

- 253개 시나리오가 (CI 재시도 포함) 모두 통과해야 e2e job 성공.
- CI 5개 job이 모두 성공해야 머지 게이트 통과(브랜치 보호 설정에 따름).
- 실패 시: Actions 로그 + `playwright-report` 아티팩트(HTML) 다운로드로 스텝·스크린샷·trace 확인.

---

## 6. 별도 — 매일 예약 E2E (`daily-e2e.yml`)

CI(코드 변경 트리거)와 **별개**로, 코드 변화가 없어도 회귀를 상시 감시하는 예약 실행이 있다.

```yaml
on:
  schedule:
    - cron: "17 0 * * *"   # UTC 00:17 = KST 09:17
  workflow_dispatch:
permissions:
  contents: read
  issues: write
```

- 매일 **KST 09:17**에 CI의 e2e와 **동일한 `npm run test:e2e`** 실행(같은 브라우저 캐시/설치 흐름).
- **실패 시**: `daily-e2e-failure` 라벨의 추적 이슈를 재사용해 코멘트로 알림(없으면 생성) + `playwright-report-daily` 아티팩트 업로드.
- CI와 별도 `concurrency` 그룹이라 서로 취소하지 않는다.

---

## 7. 로컬에서 동일하게 재현하기

```bash
npm ci
npx playwright install --with-deps chromium   # 최초 1회
npm run test:e2e                              # config가 build+preview 자동 기동
```

- 로컬은 `retries: 0`, `reporter: list`(HTML 아님), `reuseExistingServer: true`.
- CI와 동일하게 재현하려면 `CI=1 npm run test:e2e`처럼 `CI` 환경변수를 켜면 된다(재시도 1·HTML 리포트·서버 강제 재기동).

---

## 요약

**push/PR → e2e job → `npm ci`(브라우저 skip) → 브라우저 캐시/설치 → `playwright test`가 webServer로 `build+preview`(dist를 4173에 서빙)를 띄우고 → `react-*.spec.ts` 253개를 Chromium으로 병렬 실행(CI 재시도 1) → 실패 시 HTML 리포트 아티팩트 업로드.** 검증 대상은 소스가 아니라 **운영과 동일한 빌드 산출물(`dist`)** 이다.
