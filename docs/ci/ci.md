# CI (`ci.yml`) — 머지 품질 게이트

`.github/workflows/ci.yml`. push/PR마다 **10개 job을 병렬**로 돌려 결함의 main 유입을 차단한다.
기능·품질 게이트(lint·데이터·유닛·뮤테이션·빌드·e2e·비기능) 7개 + 보안 게이트(의존성 감사·시크릿 스캔·정적 분석) 3개.

## 트리거

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

env:
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
```

- **main push · 모든 PR · 수동(`workflow_dispatch`)** 에 실행.
- `concurrency` — 같은 ref에서 새 실행이 뜨면 진행 중이던 이전 실행 취소(중복/분 낭비 방지).
- `permissions: contents: read` — 최소 권한(읽기 전용).
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` — `npm ci` 시 브라우저 자동 다운로드 차단(브라우저는 e2e job에서 명시 설치).

## job 구성 (10개, 병렬·독립)

### 기능·품질 게이트 (7)

| job | 이름 | 실행 명령 | 산출물 |
| --- | --- | --- | --- |
| `lint` | Lint & Typecheck | `npm run lint` + `npm run typecheck`(`tsc --noEmit`) | — |
| `verify-data` | Verify data & content | `npm run verify` (626문항 정답·이미지·스키마·콘텐츠 감사) | — |
| `unit` | Unit tests (vitest) | `npm run test:cov` (유닛 + 커버리지, **임계값 게이트**: stmt 68·branch 60·func 73·line 69) | `coverage/`(7일) |
| `mutation` | Mutation tests (Stryker) | `npm run test:mutation` (채점·통계 핵심 4개 유틸에 뮤턴트 주입 — **뮤테이션 스코어 break 85 게이트**, 살충제 패러독스 대응) | `reports/mutation/`(7일) |
| `build` | Build (tsc + vite) | `npm run build` → **`npm run size`**(번들 예산: JS 330KB·CSS 45KB) | `dist/`(7일) |
| `e2e` | E2E smoke (Playwright) | `npm run test:e2e`(`--project=react`, 기능 302 — 시드 랜덤 스모크 포함) | 실패 시 `playwright-report/`(7일) |
| `nonfunctional` | Non-functional (Playwright) | `npm run test:nf`(`--project=nonfunctional`, 성능·부하·메모리·타이머·오프라인·데이터 내구성·장기 스케일 12) | 실패 시 `playwright-report-nf/`(7일) |

### 보안 게이트 (3, 체크리스트 #4)

| job | 이름 | 하는 일 | 차단 기준 |
| --- | --- | --- | --- |
| `audit` | Dependency audit (npm) | `npm audit --omit=dev --audit-level=high`(배포 번들) + 전체 트리 정보성 보고 | **프로덕션 의존성**에 high+ 취약점 |
| `secrets` | Secret scan (gitleaks) | `gitleaks/gitleaks-action@v2`로 전체 커밋 히스토리에서 API 키·토큰·비밀번호 유출 탐지 | 시크릿 패턴 매칭 |
| `codeql` | CodeQL (static analysis) | `github/codeql-action` JS/TS 정적 분석(`security-and-quality`: XSS·프로토타입 오염·안전하지 않은 DOM 등) → Security 탭 업로드 | 분석 오류 시(경보는 Security 탭, 머지 차단은 브랜치 보호 설정에 따름) |

품질 6개 job은 공통으로: `checkout@v4` → `setup-node@v4`(node 22, `cache: npm`) → `npm ci` → 각자 명령.
모든 job이 성공해야 머지 게이트를 통과한다(브랜치 보호 설정에 따름).

**설계 근거 — `audit`가 왜 `--omit=dev`인가:** 이 앱은 클라이언트 SPA라 사용자에게 실제로 나가는 코드는 **프로덕션 의존성**뿐이다. `pdfjs-dist`·`undici` 등 high 취약점은 빌드/스크립트용 dev 툴링에만 있어 배포물에 포함되지 않으므로, 차단은 프로덕션 트리 기준으로 하고 dev 트리는 `continue-on-error` 정보성 단계로 남겨 가시성만 확보한다.

**`codeql` 권한:** 이 job만 `security-events: write`(스캔 결과 업로드용)를 job 레벨에서 부여한다. 나머지는 최상위 `contents: read`(읽기 전용)를 그대로 상속. 저장소에 CodeQL **default setup**이 켜져 있으면 이 advanced 워크플로와 충돌하므로, 둘 중 하나만 사용한다.

**커버리지 임계값 범위:** `vitest.config.ts`의 coverage `include`를 `src/store/**`·`src/utils/**`(유닛이 실제로 다루는 로직 계층)로 한정한다. 컴포넌트/훅/앱 셸은 E2E(302)가 검증하므로, 여기에 포함하면 미임포트 파일이 0%로 집계돼 임계값이 무의미해진다. 임계값은 현재값보다 약 2%p 낮게 잡아 지금은 통과시키되 향후 회귀를 차단하는 바닥 게이트로 동작한다.

**번들 예산(`npm run size`):** `scripts/check-bundle-size.js`가 `dist/assets`의 JS·CSS raw 합계를 예산과 대조한다. 현재 JS ~265KB·CSS ~31KB 대비 넉넉한 여유(JS 330KB·CSS 45KB)를 둬 무거운 의존성 유입 같은 **큰** 회귀만 잡고 소폭 증가엔 관대하다.

**비기능(`nonfunctional`) 분리·예산:** `playwright.config.ts`에 별도 프로젝트로 두어 기능 `e2e`(`--project=react`, 302)와 다른 잡에서 돈다(`--project=nonfunctional`, `e2e/nonfunctional.spec.ts` 12건). 측정 항목은 초기 로드(DCL/FCP/LCP)·문항 이동·채점·대량 통계 렌더 시간, 입력 폭주·모드 전환 스트레스, JS 힙, 타이머 정확도, 오프라인(PWA) reload, 데이터 내구성. 시간 예산은 러너 변동성 때문에 **CI에서 완화**(`process.env.CI`로 2~3배)해 오탐 없이 "큰 회귀"만 잡는다 — 로컬은 엄격.

---

## e2e job 상세 (가장 복잡)

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
      with: { name: playwright-report, path: playwright-report/, retention-days: 7, if-no-files-found: ignore }
```

### 단계별

| 단계 | 하는 일 |
| --- | --- |
| **npm ci** | 의존성 설치. 전역 env로 **브라우저는 이 시점에 받지 않음** |
| **Cache Playwright browsers** | `~/.cache/ms-playwright`를 `package-lock.json` 해시 키로 캐시 → 락파일 불변 시 다운로드 skip |
| **`npx playwright install --with-deps chromium`** | Chromium + 리눅스 시스템 의존성(폰트·라이브러리) 설치. `--with-deps`가 헤드리스 리눅스 구동의 핵심 |
| **`npm run test:e2e`** | 실제 실행(= `playwright test`). config가 서버 기동·병렬·재시도를 담당(아래) |
| **Upload Playwright report** | `if: failure()` — **실패 시에만** HTML 리포트를 아티팩트로 업로드(7일) |

### `playwright.config.ts` — 실행 규칙

```ts
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: { trace: "on-first-retry" },
  projects: [
    { name: "react", testMatch: /react-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" } },
  ],
  webServer: [
    { command: "npm run build && npm run preview",
      url: "http://localhost:4173/", timeout: 180_000,
      reuseExistingServer: !process.env.CI },
  ],
});
```

| 항목 | 의미 |
| --- | --- |
| project `react` (`react-*.spec.ts`) | 해당 파일만 실행(현재 302개). 레거시 프로젝트 제거됨 → React 단일 프로젝트 |
| `baseURL: :4173` | 테스트의 `page.goto("/")`가 이 주소로 감 |
| `fullyParallel: true` | 파일 단위 병렬(러너 CPU 수만큼 워커) |
| `forbidOnly: CI` | CI에서 `test.only`가 남아 있으면 실패 처리 |
| `retries: CI ? 1 : 0` | **CI에서만 실패 시 1회 자동 재시도**(환경성 플레이키 흡수) |
| `reporter: CI ? html : list` | CI는 HTML 리포트 → 실패 시 위에서 아티팩트 업로드 |
| `trace: on-first-retry` | 재시도 케이스에만 trace(스텝·네트워크·DOM) 기록 |

### webServer — 앱을 어떻게 띄우나 (핵심)

테스트 시작 **전에** Playwright가 `command`를 실행해 앱 서버를 자동 기동하고, `url`이 응답하면 시작한다.

- **`npm run build && npm run preview`**
  - `build`(= `tsc && vite build`) 앞의 **`prebuild` 훅이 `sync-assets`** 로 `www/` 정본 데이터를 `public/`·`dist/`로 동기화 후 빌드.
  - `preview`(= `vite preview --port 4173 --strictPort`)가 **`dist/`를 4173에 정적 서빙**.
  - → 검증 대상이 **실제 운영 배포본(Vercel `dist`)과 동일한 산출물**. 소스가 아니라 빌드 결과를 검증한다.
- `url` 200 응답까지 최대 **180초** 대기 후 테스트 시작.
- `reuseExistingServer: !CI` — 로컬은 재사용, **CI는 항상 새로 기동**(깨끗한 상태). 종료 시 서버 정리.

### 로컬 재현

```bash
npm ci
npx playwright install --with-deps chromium   # 최초 1회
npm run test:e2e                              # config가 build+preview 자동 기동
# CI와 동일 조건(재시도 1·HTML 리포트·서버 강제 재기동):
CI=1 npm run test:e2e
```

---

## 요약

**push/PR → 10 job 병렬 → 모두 통과해야 머지.** 기능·품질 7개(lint·verify-data·unit·mutation·build·e2e·nonfunctional) + 보안 3개(audit·secrets·codeql). e2e는 `npm ci`(브라우저 skip) → 브라우저 캐시/설치 → `playwright test --project=react`가 `build+preview`로 `dist`를 4173에 서빙하고 → `react-*.spec.ts` 302개를 Chromium으로 병렬 실행(CI 재시도 1) → 실패 시 HTML 리포트 아티팩트를 남긴다. nonfunctional은 같은 서버로 `--project=nonfunctional` 12건(성능·부하·메모리·타이머·오프라인·데이터 내구성)을 CI 완화 예산으로 실행한다. 보안 job은 배포 번들의 취약 의존성(audit)·유출 시크릿(gitleaks)·정적 분석 경보(CodeQL)를 각각 차단한다.
