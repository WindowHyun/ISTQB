# 테스트·CI 하네스

적용: `e2e/**`, `*.test.ts`, `stryker*.json`, `vitest*.config.ts`, `playwright.config.ts`, `.github/workflows/**`.

## 계층

| 계층 | 명령 | 맡는 것 |
| --- | --- | --- |
| 유닛(vitest) | `npm test` / `npm run test:cov` | 순수 로직·저장 계층·스크립트 계약. 커버리지 바닥은 `vitest.config.ts` |
| 뮤테이션(Stryker) | `test:mutation` · `test:mutation:storage` | 유닛이 결함을 실제로 죽이는지 |
| 기능 E2E | `npm run test:e2e`(`react`) | 화면 배선·모드 전이·저장 복원 |
| 탐색 E2E | `npm run test:explore` | 전수 스윕·몽키·페어와이즈·교차 정합·axe. PR 게이트 밖(야간), 데이터·렌더 경로 변경 시에는 PR에서도 실행 |
| 비기능 | `npm run test:nf` | 성능·오프라인·타이머·저장 내구성 |
| APK/WebView | `npm run test:apk` | 안전영역·터치 타깃·재시작 복원 |

같은 계약은 **가장 낮은 계층 한 곳**에서 검사한다. E2E는 그 계약이 화면에 배선됐는지만 본다(예: 백업 정제 규칙은 `storage.import`·`storage.sanitize` 유닛, E2E는 가져오기 한 번).

## E2E 작성 규칙

- 스펙 파일은 **도메인 이름**으로 둔다(`react-<도메인>.spec.ts`). 생긴 시점(`final`, `phase2`, `edge-*`)으로 이름 붙이지 않는다. 새 테스트는 같은 도메인 파일에 넣고, 같은 동작을 검사하는 테스트가 이미 있는지 먼저 찾는다.
- 진입·대기는 `e2e/helpers.ts`의 헬퍼(`openProduct`·`openSet`·`waitForList`·`expectMode`)를 쓴다. 헬퍼 상단 주석이 단언 규약의 정본이다.
- `#questionStem`이 보인다는 것은 상태 단언이 아니다(모든 모드에서 보인다). 모드는 `expectMode`, 세트는 셀렉트 값, 채점은 결과 모달·점수를 직접 읽는다.
- 출제 목록은 비동기로 온다. 진입 완료는 `data-list-mode|set|chapter`로 기다린다(`waitForList`).
- `page.waitForTimeout`은 lint가 막는다(`eslint.config.mjs`). 상태를 기다린다:
  - 화면 상태 → 자동 재시도 단언(`toHaveText`·`toHaveCount`)이나 `expect.poll`
  - 전환·애니메이션·뷰포트 변경 뒤 레이아웃을 잴 때 → `settle(page)`, 모달 처리 뒤 모드가 자리 잡을 때 → `settleMode(page)`
  - localStorage를 직접 읽을 때 → `flushSaves(page)`(앱이 화면을 숨길 때 타는 flushPersist 경로를 태운다)
  - "시간이 지나도 아무 일이 없다"는 부정 단언·시간 측정처럼 대기 자체가 검사일 때만 `// eslint-disable-next-line no-restricted-syntax -- <이유>`
- **새로고침 전에는 기다리지 않는다.** 앱은 페이지를 내리는 순간 저장을 flush한다. 새로고침 전 고정 대기는 디바운스 저장이 먼저 끝나게 해 그 경로를 가린다 — 실제로 `flushPersist`를 빼도 NF11("즉시 reload에도 답안 보존")이 800ms 대기 덕분에 통과하고 있었다. 반대로 "상태 변경이 디바운스 저장을 스스로 촉발하는가"를 보는 검사는 새로고침 **전에** 저장소를 `expect.poll`로 확인한다(새로고침 순간의 flush는 상태 전체를 저장해 구독 누락을 가린다).
- 페이지 오류 0건은 `e2e/fixtures.ts`의 `test`가 모든 테스트에 자동으로 검사한다. 스펙은 `@playwright/test` 대신 `./fixtures`에서 `test`·`expect`를 가져온다. 스펙에서 `pageerror`를 따로 모아 0건을 다시 단언하지 않는다. 앱과 무관한 알려진 잡음은 `test.use({ ignorePageErrors: [/…/] })`로 좁게 빼고, 예외를 일부러 일으키는 테스트만 `allowPageErrors: true`를 쓴다.
- 긴 루프를 도는 스펙은 첫머리에 `page.setDefaultTimeout(...)`을 둔다(Playwright의 `actionTimeout` 기본값은 무제한). 진단 흔적은 루프 첫머리에서 주기적으로 출력한다.

## 예산 부등식

`test.setTimeout`을 새로 주거나 올리면 다시 계산한다:

```
스펙 최대 예산 × 2(CI 재시도 1회) + 정상 스위트 시간 < 잡 timeout-minutes
```

깨지면 멈춘 스펙이 예산을 태우는 동안 잡이 먼저 잘려 로그에 원인이 남지 않는다. 예산은 실측(`--reporter=list`)의 수 배로 정한다. 경위: [`../decisions/e2e-test-budget.md`](../decisions/e2e-test-budget.md).

## 뮤테이션 게이트

| 설정 | 대상 | break |
| --- | --- | --- |
| `stryker.config.json` | 채점·통계 순수 로직(`mutate` 목록) | 85 |
| `stryker.storage.config.json` | `storage.ts` · `useQuizStore.ts` | 68(래칫) |

- 둘을 합치지 않는다 — 평균이 저장 계층 쪽으로 끌려가 코어의 높은 기준이 무의미해진다.
- 코어에 파일을 추가하기 전에 그 파일만 단독으로 잰다(`npx stryker run --mutate <경로>`).
- 저장 계층 검사를 보강하면 break도 올린다. 올릴 폭은 실측이 아니라 **관측된 드리프트 폭**을 여유로 남긴다(새 기능이 검사 없는 코드를 들여오면 점수가 저절로 1~2%p 내려간다).
- 수정 전 점수를 직접 한 번 재고 그것과 비교한다. 문서의 옛 값과 비교하지 않는다.
- timeout은 '검출'로 집계되므로 느린 머신일수록 점수가 높게 나온다. 로컬 통과는 CI 통과를 보증하지 않는다 — break는 낮게 나온 쪽을 기준으로 정한다.
- 저장 계층 뮤테이션은 PR에서 경로 필터(`scripts/changed-areas.js`)로 돌고, main에서는 매일 돈다. 필터 범위는 `mutate` 대상의 import 그래프로 계산하므로, 테스트가 대상을 `import type`으로만 쓰면 그 테스트 변경은 뮤테이션을 켜지 않는다.

경위와 라운드별 실측: [`../decisions/mutation-gates.md`](../decisions/mutation-gates.md).

## 커버리지

`vitest.config.ts`의 임계값은 실측보다 약 2%p 낮은 바닥이다. 올리는 방법은 렌더러 도입이 아니라 훅·컴포넌트 안의 순수 로직을 모듈로 꺼내 유닛으로 덮는 것이다. 꺼낼 때마다 임계값도 올린다.

## 로컬 실행

- Playwright 스위트는 한 번에 하나만 실행한다. 여러 개는 `npm run test:e2e:all`로 한 번에(서버·빌드를 공유한다).
- 설치된 Chromium 빌드가 `@playwright/test`가 요구하는 빌드와 다르면(클라우드 컨테이너 등) `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-<빌드>/chrome-linux/chrome`처럼 실행 파일을 지정한다. `playwright.config.ts`가 이 환경변수를 `launchOptions.executablePath`로 넘긴다.

## 보고 추가 항목

- 지우거나 옮긴 테스트가 있으면, 그 테스트가 보던 계약이 이제 어디서 검사되는지.
- `test.setTimeout`을 바꿨으면 예산 부등식 계산.
