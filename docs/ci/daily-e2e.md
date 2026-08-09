# Daily E2E (`daily-e2e.yml`) — 예약 회귀 감시

`.github/workflows/daily-e2e.yml`. **코드 변화가 없어도** 매일 E2E를 돌려 회귀를 상시 감시하고, 실패 시 이슈로 알린다. CI(`ci.yml`)의 e2e·nonfunctional job과 실행 방식은 같지만 트리거와 실패 처리가 다르다.

코드 변화가 없는 날에도 도는 이유는 러너 이미지·브라우저·의존성이 우리와 무관하게 바뀌기 때문이다. PR CI에서만 돌면 머지가 없는 기간의 드리프트를 놓친다.

## 트리거

```yaml
on:
  schedule:
    - cron: "17 0 * * *"   # UTC 00:17 = KST 09:17
  workflow_dispatch:

concurrency:
  group: daily-e2e-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read           # 워크플로 기본은 읽기 전용

env:
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
```

- **매일 KST 09:17**(cron은 UTC 기준, `17 0 * * *` = 00:17 UTC) + 수동(`workflow_dispatch`).
- 예약 트리거는 **기본 브랜치(main)의 워크플로 파일** 기준으로만 동작한다.
- `cancel-in-progress: false` — CI와 별도 그룹이라 서로 취소하지 않는다.
- 이슈 쓰기 권한은 **워크플로 전체가 아니라 `notify` job에만** 준다(최소 권한). 테스트를 돌리는 job은 읽기 전용이다.

## job 구성 — 테스트 2개 + 알림 1개

| job | 실행 | timeout | 실패 리포트 아티팩트 |
| --- | --- | ---: | --- |
| `e2e` | `npm run test:e2e` (React 기능, `--project=react`) | 30분 | `playwright-report-daily` (14일) |
| `nonfunctional` | `npm run test:nf` (성능·오프라인·타이머·저장 내구성) | 30분 | `playwright-report-daily-nf` (14일) |
| `notify` | 위 둘 중 하나라도 실패하면 이슈 생성/코멘트 | — | — |

두 테스트 job은 서로 독립이라 병렬로 돈다(러너가 분리되므로 `dist/` 충돌 문제가 없다 — 로컬 동시 실행 주의사항은 `docs/harness/README.md` 참고).

APK 스위트(`test:apk`)는 여기 없다. WebView 프로파일은 뷰포트·UA 모사라 러너/의존성 드리프트에 노출되는 면이 기능 E2E와 겹치고, 매일 돌릴 만큼 추가로 잡아내는 것이 없다고 판단했다. PR CI에서는 계속 돈다.

각 테스트 job의 단계는 동일하다:

```yaml
- uses: actions/checkout@v6
- uses: actions/setup-node@v6
  with: { node-version: 24, cache: npm }
- run: npm ci
- uses: actions/cache@v6          # ~/.cache/ms-playwright (락파일 해시 키)
- run: npx playwright install --with-deps chromium
- run: npm run test:e2e           # 또는 npm run test:nf
- name: Upload Playwright report
  if: ${{ failure() }}
  uses: actions/upload-artifact@v7
```

브라우저 캐시/설치·실행 흐름은 [`ci.md`의 e2e 상세](./ci.md#e2e-job-상세-가장-복잡)와 동일하다(같은 `playwright.config.ts` → build+preview로 dist 서빙 → Chromium 병렬 실행, CI 재시도 1).

> **timeout 30분은 `ci.yml`의 e2e와 같은 부등식으로 정해져 있다** — 스펙 최대 예산(7분) × 2(재시도) + 정상 시간(약 12분) < 30분. 스펙의 `test.setTimeout`을 올릴 때는 여기 timeout도 함께 계산한다. 근거는 `docs/harness/README.md`의 "테스트 예산은 CI 잡 타임아웃보다 작아야 한다" 참고.

## 실패 알림 (핵심 차이)

`notify` job은 **예약 실행이 실패했을 때만** 동작한다:

```yaml
needs: [e2e, nonfunctional]
if: ${{ always() && github.event_name == 'schedule' && contains(needs.*.result, 'failure') }}
permissions:
  issues: write
```

- `always()`가 필요한 이유: 선행 job이 실패하면 기본적으로 후속 job이 건너뛰어져 알림 자체가 안 나간다.
- `event_name == 'schedule'` 조건 때문에 **수동 실행(`workflow_dispatch`)은 이슈를 만들지 않는다.** 손으로 돌려 보다가 추적 이슈가 열리는 것을 막는다.

동작(`actions/github-script@v9`):

1. `daily-e2e-failure` 라벨이 없으면 생성.
2. 그 라벨의 **열린 이슈가 있으면 코멘트 추가**, 없으면 **새 이슈 생성** → 매일 새 이슈가 쌓이지 않도록 하나의 추적 이슈를 재사용한다.
3. 본문에 **어느 스위트가 실패했는지**(기능 E2E / 비기능), 실행 로그 URL, 커밋 SHA, 시각(UTC)을 남긴다.

원인 해결 후 그 추적 이슈를 닫으면, 다음 실패 시 새 이슈가 다시 열린다.

## 운영 주의

- 예약 시각은 러너 혼잡으로 수 분~수십 분 지연될 수 있다(정시 :00 회피 위해 분=17).
- 저장소가 60일간 활동이 없으면 GitHub이 예약 트리거를 자동 비활성화한다.
- 시간 변경은 cron만 조정(예: KST 03:00 = `0 18 * * *`).
- Actions 탭 → **Daily E2E → Run workflow** 로 즉시 수동 실행 가능(이 경우 실패해도 이슈는 안 열린다).
