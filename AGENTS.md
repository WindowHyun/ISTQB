# AGENTS.md

ISTQB/CSTS 기출 문제 풀이 앱. React + Vite(웹, Vercel) · Capacitor(Android APK).
문항 데이터 정본은 `www/data/`(12세트 626문항 — 계약 테스트가 강제하는 수치).

## 시작 전

변경할 경로로 영역을 정하고, 해당 하네스 문서만 읽는다. 여러 영역이면 해당 문서를 모두 읽는다.

| 경로 | 문서 |
| --- | --- |
| `www/data/**`, `www/images/**`, `scripts/` 데이터 도구 | `docs/harness/data.md` |
| `src/components/**`, `src/app/**`, `src/styles/**`, `src/utils/parser.tsx`, `index.vite.html` | `docs/harness/ui-render.md` |
| `src/store/**`, `src/hooks/**`, 나머지 `src/utils/**` | `docs/harness/app-logic.md` |
| `android/**`, `capacitor.config.json`, 웹↔네이티브 JS 브리지 | `docs/harness/android.md` |
| `e2e/**`, `*.test.ts`, `stryker*.json`, `vitest*.config.ts`, `playwright.config.ts`, `.github/workflows/**` | `docs/harness/testing.md` |
| 배포·릴리스 | `docs/release-playbook.md` |

JS 브리지는 `android.md`의 계약 표가 정본이다. 웹과 네이티브가 서로를 검사하지 않아 이름이 갈리면 APK에서만 조용히 실패한다.

## 검증

`npm run check:changed`가 변경 파일(origin/main 대비 + 커밋 안 한 변경)로 영역을 판정해 아래 표의 명령을 골라 실행한다. `--dry-run`은 고른 명령만 보여 주고, `--skip-slow`는 저장 계층 뮤테이션·탐색 E2E를 뺀다. 판정 규칙은 `scripts/changed-areas.js`이고 CI 경로 필터와 같다.

| 변경 | 명령 |
| --- | --- |
| 코드 전반 | `npm run lint && npm run typecheck && npm run typecheck:test && npm test` |
| 데이터(`www/data/**`) | 위 + `npm run verify && python3 scripts/verify-pdf-data.py` |
| UI·앱 동작 | 위 + `npm run test:e2e` |
| 데이터·문항 렌더 경로(`parser.tsx`·`QuestionCard`·채점) | 위 + `npm run test:explore`(626문항 전수 스윕 포함) |
| 모바일 레이아웃·안전영역·터치 타깃 | 위 + `npm run test:apk` |
| 성능·오프라인·저장 내구성 | 위 + `npm run test:nf` |
| 채점·통계 순수 로직(`stryker.config.json`의 `mutate`) | 위 + `npm run test:mutation` |
| `storage.ts` · `useQuizStore.ts` | 위 + `npm run test:mutation:storage`(약 12분) |
| Android 패키징 | `npm run build && npm run cap:sync`, 네이티브 변경이면 `cd android && ./gradlew assembleDebug` |

- `typecheck:test`는 테스트·e2e·`middleware.ts`·`scripts/**/*.test.ts`를 검사하는 유일한 명령이다. 앱 `tsconfig`는 이 파일들을 제외한다.
- Playwright 스위트는 한 번에 하나만 실행한다. 모든 프로젝트가 포트 4173과 `dist/`를 공유해서, 동시에 띄우면 서로의 빌드를 덮어쓰고 플래키처럼 보이는 실패가 난다. 여러 스위트는 `npm run test:e2e:all`로 한 번에 돌린다.
- 엔진 계층(IndexedDB·Blob·서비스워커·Date 파싱)이나 렌더링을 크게 바꿨으면 배포 전에 실기기 Safari로 확인한다(`release-playbook.md` §7).

## 완료 기준

- 위 표에서 해당하는 명령이 통과한다. 돌리지 못한 명령은 이유와 범위를 보고한다.
- 새로 추가한 검사는 대상 결함을 되돌렸을 때 실패하는 것을 한 번 확인하고 원복한다.
- 기존 검사가 못 잡는 결함 유형을 발견했으면 검사를 추가하거나 추가안을 보고에 적는다.
- 컴포넌트·훅 안의 순수 로직을 고쳤다면 먼저 모듈로 꺼내 유닛이 닿게 한다(`sessionDerive`·`roundHistory`·`wrongNote`가 그 예).

## 하지 않는 것

- 문항 `id` 변경 — 챕터 통계·오답노트·저장된 추첨이 id에 묶여 있다. 지문·정답·해설만 고친다.
- 테스트를 skip·삭제·완화해서 CI를 통과시키는 것.
- 빌드·테스트 전용 패키지를 `dependencies`에 넣는 것 — `audit` 게이트는 배포 의존성만 재므로, 잘못 넣으면 배포되지 않는 패키지 때문에 CI가 막힌다.
- 문서에 실측값(테스트 개수·커버리지·뮤테이션 점수)을 적는 것. 정본은 CI 로그다. 설정이나 계약 테스트가 강제하는 값(break 85/68, 626문항)만 적는다.
- `docs/archive/`를 현행 규칙의 근거로 쓰는 것. 당시 기록일 뿐이다.

## 보고

변경 내용 · 읽은 하네스 문서 · 실행한 명령과 결과 · 생략한 점검과 이유. 영역 문서에 추가 보고 항목이 있으면 함께 적는다.
