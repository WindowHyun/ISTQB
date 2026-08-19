# CI (`ci.yml`) — 머지 품질 게이트

`.github/workflows/ci.yml`. push/PR마다 **14개 job을 병렬**로 돌려 결함의 main 유입을 차단한다.
기능·품질 게이트 11개(lint·데이터·PDF 대조·유닛·뮤테이션 2종·빌드·안드로이드 빌드·e2e·비기능·APK) + 보안 게이트 3개(의존성 감사·시크릿 스캔·정적 분석).

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

## job 구성 (14개, 병렬·독립)

### 기능·품질 게이트 (11)

| job | 이름 | 실행 명령 | 산출물 |
| --- | --- | --- | --- |
| `lint` | Lint & Typecheck | `npm run lint` + `npm run typecheck` + `npm run typecheck:test` | — |
| `verify-data` | Verify data & content | `npm run verify` (626문항 정답·이미지·스키마·콘텐츠 감사) | — |
| `pdf-data` | Verify data against source PDFs | `python3 scripts/verify-pdf-data.py` (원본 PDF 13종에서 독립 추출해 **텍스트·정답 626문항·밑줄**을 전수 대조 — 데이터 수정이 원문을 훼손하면 차단. 조각 수는 실행 출력이 정본이다. python 3.12 + pymupdf) | — |
| `unit` | Unit tests (vitest) | `npm run test:cov` (유닛 + 커버리지, **임계값 게이트**: stmt 75·branch 71·func 74·line 77) | `coverage/`(7일) |
| `mutation` | Mutation tests (Stryker) | `npm run test:mutation` (채점·통계 순수 로직 6파일에 뮤턴트 주입 — **break 85**) | `reports/mutation/`(7일) |
| `mutation-storage` | Mutation tests — 영속화·상태 계층 | `npm run test:mutation:storage` (`storage.ts`·`useQuizStore.ts` — **break 67**, 래칫) | `reports/mutation-storage/`(7일) |
| `build` | Build (tsc + vite) | `npm run build` → **`npm run size`**(번들 예산: JS 140KB·CSS 12KB, gzip) | `dist/`(7일) |
| `android-build` | Android APK build (no deploy) | `npm run build` → `cap sync` → 커밋된 android 프로젝트가 낡았는지 확인 → `./gradlew assembleDebug` | — |
| `e2e` | E2E smoke (Playwright) | `npm run test:e2e`(`--project=react` — 시드 랜덤 스모크·몽키·axe 포함) | 실패 시 `playwright-report/`(7일) |
| `nonfunctional` | Non-functional (Playwright) | `npm run test:nf`(`--project=nonfunctional` — 성능·부하·메모리·타이머·오프라인·데이터 내구성) | 실패 시 `playwright-report-nf/`(7일) |
| `apk` | APK/WebView (Playwright) | `npm run test:apk`(`--project=apk --project=apk-nf`) | 실패 시 `playwright-report-apk/`(7일) |

> **스위트별 테스트 개수는 적지 않는다.** 종전에는 표에 적어 뒀는데 한 달 만에 두 번 어긋났고, 아무도 그 숫자로 판단하지 않으면서 갱신 부채만 남겼다. 정확한 수치는 각 실행 결과와 CI 로그가 정본이다. 같은 규칙이 `AGENTS.md`·`docs/harness/README.md`에도 적혀 있다. 다만 **데이터 계약 수치**(12세트 626문항 등)는 계약 테스트가 강제하므로 남긴다.

> **뮤테이션 게이트가 둘인 이유**와 storage 쪽 break를 올리는 규칙(래칫)은 `docs/harness/README.md`를 참고한다. 요지: 한 설정에 합치면 코어의 높은 기준(85)이 평균에 끌려 내려가 `answer.ts`가 무너져도 통과하게 된다.

### 보안 게이트 (3, 체크리스트 #4)

| job | 이름 | 하는 일 | 차단 기준 |
| --- | --- | --- | --- |
| `audit` | Dependency audit (npm) | `npm audit --omit=dev --audit-level=high`(배포 번들) + 전체 트리 정보성 보고(`continue-on-error`) | **프로덕션 의존성**에 high+ 취약점 |
| `secrets` | Secret scan (gitleaks) | `gitleaks/gitleaks-action@v3`로 전체 커밋 히스토리에서 API 키·토큰·비밀번호 유출 탐지 | 시크릿 패턴 매칭 |
| `codeql` | CodeQL (static analysis) | `github/codeql-action` JS/TS 정적 분석(`security-and-quality`: XSS·프로토타입 오염·안전하지 않은 DOM 등) → Security 탭 업로드 | 분석 오류 시(경보는 Security 탭, 머지 차단은 브랜치 보호 설정에 따름) |

품질 job은 공통으로: `checkout@v6` → `setup-node@v6`(node 24, `cache: npm`) → `npm ci` → 각자 명령(예외: `pdf-data`는 `setup-python@v6` + `pip install pymupdf`, `android-build`는 JDK 21 + Android SDK + Gradle 캐시가 추가된다).
모든 job이 성공해야 머지 게이트를 통과한다(브랜치 보호 설정에 따름).

**설계 근거 — `audit`가 왜 `--omit=dev`인가:** 이 앱은 클라이언트 SPA라 사용자에게 실제로 나가는 코드는 **프로덕션 의존성**뿐이다. dev 툴링(테스트 러너·번들러·린터)의 취약점은 배포물에 포함되지 않으므로, 차단은 프로덕션 트리 기준으로 하고 dev 트리는 `continue-on-error` 정보성 단계로 남겨 가시성만 확보한다.

> **이 게이트가 의도대로 동작하려면 `package.json`의 분류가 정확해야 한다.** 한동안 `vite`·`typescript`·`@vitejs/plugin-react`·`@types/react(-dom)`가 `dependencies`에 들어 있어, "사용자에게 나가는 코드" 게이트가 빌드 도구 체인까지 재고 있었다. 실제로 `vite → postcss → nanoid` 권고가 이 게이트를 막아 CI가 빨간불이 된 적이 있다. 지금은 빌드 전용 패키지를 전부 `devDependencies`로 옮겨 운영 트리에는 실제로 나가는 것만 남아 있다(`@capacitor/*`·`lodash-es`·`react`·`react-dom`·`zustand`). **새 의존성을 추가할 때 분류를 확인한다** — 빌드·테스트에만 쓰이면 `devDependencies`다.

**`codeql` 권한:** 이 job만 `security-events: write`(스캔 결과 업로드용)를 job 레벨에서 부여한다. 나머지는 최상위 `contents: read`(읽기 전용)를 그대로 상속. 저장소에 CodeQL **default setup**이 켜져 있으면 이 advanced 워크플로와 충돌하므로, 둘 중 하나만 사용한다.

**커버리지 임계값 범위:** `vitest.config.ts`의 coverage `include`는 `src/store/**`·`src/utils/**`·`src/hooks/**`다. 컴포넌트/앱 셸은 뷰 계층이라 E2E가 맞는 도구이고, 여기에 넣으면 3,400여 줄이 사실상 0%라 전체 수치가 반토막 나면서 임계값이 무의미해진다. 임계값은 실측보다 약 2%p 낮게 잡아 "지금보다 나빠지지 않는다"는 바닥으로 쓴다(래칫). 현재 값과 갱신 이력은 `vitest.config.ts`의 주석이 정본이다 — 여기 숫자를 적어 두면 갱신이 어긋난다.

> 임계값을 올리는 방법은 렌더러를 들이는 것이 아니라 **훅·컴포넌트 안의 순수 로직을 모듈로 꺼내 유닛으로 덮는 것**이다. `reviewTargetIds`(useQuestions) · `roundHistory`(useQuizSession의 회차 조립) · `wrongNote`(AppModals의 오답 합집합)가 그 사례다.

**번들 예산(`npm run size`):** `scripts/check-bundle-size.js`가 `dist`의 JS·CSS를 **gzip 압축한 크기** 합계를 예산과 대조한다(JS 140KB·CSS 12KB). 서비스워커도 브라우저가 내려받는 JS이므로 `assets`만 세지 않고 함께 계산한다 — 그러지 않으면 SW 비대화가 예산을 우회한다. 여유를 넉넉히 둬 무거운 의존성 유입 같은 **큰** 회귀만 잡고 소폭 증가엔 관대하다.

**비기능(`nonfunctional`) 분리·예산:** `playwright.config.ts`에 별도 프로젝트로 두어 기능 `e2e`(`--project=react`)와 다른 잡에서 돈다(`--project=nonfunctional`, `e2e/nonfunctional.spec.ts`). 측정 항목은 초기 로드(DCL/FCP/LCP)·문항 이동·채점·대량 통계 렌더 시간, 입력 폭주·모드 전환 스트레스, JS 힙, 타이머 정확도, 오프라인(PWA) reload·**세트 미방문 상태의 퀵 출제**, 데이터 내구성. 시간 예산은 러너 변동성 때문에 **CI에서 완화**(`process.env.CI`로 2~3배)해 오탐 없이 "큰 회귀"만 잡는다 — 로컬은 엄격.

**APK/WebView(`apk`) 분리 이유:** 이 앱이 실제로 배포되는 형태는 APK다. `apk`·`apk-nf` 프로젝트는 Pixel 7 프로파일 + WebView UA + `MainActivity`의 안전영역 주입을 모사해, 상태바·제스처바 회피와 터치 타깃처럼 **데스크톱 뷰포트를 줄이는 것만으로는 재현되지 않는** 축을 검증한다. 이전에는 정의만 있고 어느 워크플로에도 걸려 있지 않아 사람이 손으로 돌릴 때만 실행됐다.

---

## e2e job 상세 (가장 복잡)

```yaml
e2e:
  name: E2E smoke (Playwright)
  runs-on: ubuntu-latest
  timeout-minutes: 30   # 근거는 아래 '요약'의 부등식
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-node@v6
      with: { node-version: 24, cache: npm }
    - run: npm ci
    - name: Cache Playwright browsers
      uses: actions/cache@v6
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
        restore-keys: |
          playwright-${{ runner.os }}-
    - run: npx playwright install --with-deps chromium
    - run: npm run test:e2e
    - name: Upload Playwright report
      if: ${{ failure() }}
      uses: actions/upload-artifact@v7
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
    // 실제로는 4개 — react(기능) · nonfunctional · apk · apk-nf.
    // 각각 별도 CI 잡에서 --project로 골라 돈다.
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
| project `react` (`react-*.spec.ts`) | 해당 파일만 실행. 비기능·APK는 별도 프로젝트로 분리 |
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

**push/PR → 14 job 병렬 → 모두 통과해야 머지.** 기능·품질 11개(lint·verify-data·pdf-data·unit·mutation·mutation-storage·build·android-build·e2e·nonfunctional·apk) + 보안 3개(audit·secrets·codeql). `lint` job은 ESLint에 더해 앱 타입 검사(`tsc --noEmit`)와 **테스트·e2e 타입 검사**(`tsc --noEmit -p tsconfig.test.json`)를 함께 돌린다 — 앱 `tsconfig`가 `*.test.ts`를 exclude하고 `e2e`를 포함하지 않아, 이 명령이 없으면 테스트·e2e 파일 전체가 타입 검사를 받지 못한다(루트의 `middleware.ts`도 여기에만 걸려 있다 — 앱 `tsconfig`의 include가 `src`뿐이고 Vercel이 별도로 번들하므로 `npm run build`로는 안 잡힌다). e2e는 `npm ci`(브라우저 skip) → 브라우저 캐시/설치 → `playwright test --project=react`가 `build+preview`로 `dist`를 4173에 서빙하고 → `react-*.spec.ts`를 Chromium으로 병렬 실행(CI 재시도 1, 실측 약 11~13분/한도 30분) → 실패 시 HTML 리포트 아티팩트를 남긴다. 한도 30분은 **스펙 최대 예산(7분) × 2(재시도) + 정상 시간(13분) = 27분 < 30분**이 성립하도록 잡은 값이다 — 이 부등식이 깨지면 무거운 스펙이 한 번 멈출 때 잡이 벽시계로 잘리면서 리포트가 남지 않는다(#256·#257·#266이 그렇게 잘렸다). 스펙 예산을 올릴 때는 이 계산을 다시 한다. nonfunctional은 같은 서버로 `--project=nonfunctional`을, apk는 `--project=apk --project=apk-nf`를 실행한다. 보안 job은 배포 번들의 취약 의존성(audit)·유출 시크릿(gitleaks)·정적 분석 경보(CodeQL)를 각각 차단한다.
