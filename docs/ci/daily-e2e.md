# Daily E2E (`daily-e2e.yml`) — 예약 회귀 감시

`.github/workflows/daily-e2e.yml`. **코드 변화가 없어도** 매일 E2E를 돌려 회귀를 상시 감시하고, 실패 시 이슈로 알린다. CI(`ci.yml`)의 e2e job과 실행 방식은 같지만 트리거와 실패 처리가 다르다.

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
  contents: read
  issues: write

env:
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
```

- **매일 KST 09:17**(cron은 UTC 기준, `17 0 * * *` = 00:17 UTC) + 수동(`workflow_dispatch`).
- 예약 트리거는 **기본 브랜치(main)의 워크플로 파일** 기준으로만 동작한다.
- `cancel-in-progress: false` — CI와 별도 그룹이라 서로 취소하지 않는다.
- `issues: write` — 실패 시 이슈 코멘트/생성을 위해 필요(CI보다 권한 1개 추가).

## job — CI e2e와 동일 실행 + 실패 알림

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: actions/cache@v4          # ~/.cache/ms-playwright (락파일 해시 키)
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - name: Upload Playwright report
        if: ${{ failure() }}
        uses: actions/upload-artifact@v4
        with: { name: playwright-report-daily, path: playwright-report/, retention-days: 14 }
      - name: Notify on failure (open/append issue)
        if: ${{ failure() && github.event_name == 'schedule' }}
        uses: actions/github-script@v7
        with: { script: "... (아래 설명) ..." }
```

- 브라우저 캐시/설치·`npm run test:e2e` 흐름은 [`ci.md`의 e2e 상세](./ci.md#e2e-job-상세-가장-복잡)와 **완전히 동일**(같은 `playwright.config.ts` → build+preview로 dist 서빙 → Chromium 병렬 실행, CI 재시도 1).
- 실패 리포트 아티팩트는 이름 `playwright-report-daily`, 보관 **14일**.

## 실패 알림 (핵심 차이)

마지막 `github-script` 단계는 **예약 실행이 실패했을 때만**(`failure() && event_name == 'schedule'`) 동작한다:

1. `daily-e2e-failure` 라벨이 없으면 생성.
2. 그 라벨의 **열린 이슈가 있으면 코멘트 추가**, 없으면 **새 이슈 생성** → 매일 새 이슈가 쌓이지 않도록 하나의 추적 이슈를 재사용.
3. 코멘트에는 실행 로그 URL·커밋 SHA·시각(UTC)을 남긴다.

원인 해결 후 그 추적 이슈를 닫으면, 다음 실패 시 새 이슈가 다시 열린다.

## 운영 주의

- 예약 시각은 러너 혼잡으로 수 분~수십 분 지연될 수 있다(정시 :00 회피 위해 분=17).
- 저장소가 60일간 활동이 없으면 GitHub이 예약 트리거를 자동 비활성화한다.
- 시간 변경은 cron만 조정(예: KST 03:00 = `0 18 * * *`).
- Actions 탭 → **Daily E2E → Run workflow** 로 즉시 수동 실행 가능.
