# AGENTS.md

## 저장소 작업 방식

이 저장소는 Codex 작업에 하네스 우선(harness-first) 방식을 사용합니다. 변경을 시작하기 전에 작업 영향 범위를 분류하고, `docs/harness/` 아래의 관련 하네스 문서를 먼저 읽습니다.

## 필수 하네스 라우팅

- 데이터, 문제 JSON, 정답, 선택지, 해설, 이미지 경로:
  - `docs/harness/data-harness.md`를 읽습니다.
- UI, CSS, 문제 렌더링, 이미지, 표, 선택지, 반응형 레이아웃:
  - `docs/harness/ui-render-harness.md`를 읽습니다.
- 앱 동작, 풀이 모드(연습·시험·퀵·오답 + 통계에서만 들어가는 챕터 미니 시험), 채점, 챕터 통계, 오답 노트, 상태 저장,
  제품 전환, 탭 간 동기화, 가져오기/내보내기:
  - `docs/harness/app-logic-harness.md`를 읽습니다.
- Android, Capacitor, `www/`, APK, 매니페스트, 아이콘, 서비스 워커 패키징:
  - `docs/harness/android-build-harness.md`를 읽습니다.
- 릴리스, 전달 전 점검, 여러 영역에 걸친 큰 변경:
  - `docs/harness/release-harness.md`를 읽습니다.

## 기본 검증

- 데이터, JavaScript, UI, 앱 동작을 변경한 뒤에는 `npm run verify`를 실행합니다.
- 문제 데이터(`www/data/**`)를 수정한 뒤에는 `python3 scripts/verify-pdf-data.py`(원본 PDF 대조 — 텍스트·정답·밑줄)도 통과해야 합니다(CI `pdf-data` job과 동일).
- UI/렌더링/이미지/표/선택지 변경은 `docs/harness/ui-render-harness.md`에 따라 React E2E·스크린샷으로 확인합니다.
- Android 또는 패키징되는 웹 에셋 변경은 `npm run cap:sync`와 `docs/harness/android-build-harness.md`의 Android 빌드 점검 필요 여부를 판단합니다.
- React 앱(운영 배포)·렌더링·풀이 동작 변경은 `npm test`(유닛)와 `npm run test:e2e`(React 기능 E2E, 시나리오 목록은 `docs/e2e-test-scenarios.md`)로 회귀를 검증합니다.
- 모바일 레이아웃·안전영역·터치 타깃에 영향이 있으면 `npm run test:apk`(APK/WebView)도 실행합니다 — 데스크톱 E2E는 뷰포트를 줄여도 WebView UA·안전영역 변수를 재현하지 못합니다.
- 성능·오프라인·저장 내구성에 영향이 있으면 `npm run test:nf`(비기능)를 실행합니다.
- IndexedDB·Blob 다운로드·서비스워커·Date 파싱 등 **엔진 계층**이나 렌더링을 크게 건드렸으면, 배포 전 **실기기 Safari(아이폰·맥)로 30초 직접 확인**합니다. 자동 Safari 게이트는 투자 대비 효과가 낮아 제거했습니다(잡아낸 것이 제품 결함이 아니라 테스트 하네스 이슈뿐이었고, 러너 시간은 11~24분이었습니다). 알려진 Safari 렌더 비용은 `docs/harness/ui-render-harness.md`를 참고하세요.

> **Playwright 스위트는 한 번에 하나씩 실행합니다.** `webServer`가 설정 전체에 하나뿐이라
> 포트(4173)와 `dist/`를 모든 프로젝트가 공유합니다 — 두 개를 별개 프로세스로 동시에 띄우면
> 각자 `npm run build`를 돌려 같은 `dist/`에 겹쳐 쓰고, 먼저 돌던 쪽의 테스트가 산출물이
> 갈리면서 타임아웃합니다. 이 증상은 **테스트 플래키로 오인되기 쉽습니다**(실패 지점이 매번
> 다르고 단독 실행은 통과). 여러 스위트를 한꺼번에 돌리려면 `npm run test:e2e:all`을 씁니다 —
> 한 번의 호출에 `--project`를 여러 개 주어 서버·빌드를 공유합니다. CI는 잡이 분리돼 무관합니다.

> 스위트별 테스트 **개수는 여기 적지 않습니다.** 종전에는 적어 뒀는데 한 달 만에 두 번 어긋났고,
> 아무도 그 숫자로 판단하지 않으면서 갱신 부채만 남겼습니다.
> 정확한 수치는 각 스위트 실행 결과와 CI 로그가 정본입니다. 다만 **데이터 계약 수치**(12세트
> 626문항 등)는 계약 테스트가 강제하므로 문서에 남깁니다.
- 채점·통계·저장 키 등 핵심 순수 로직을 고쳤다면 `npm run test:mutation`(Stryker 코어, CI break 85)으로 테스트의 결함 검출력을 확인합니다.
- `src/utils/storage.ts`·`src/store/useQuizStore.ts`(영속화·상태 계층)를 고쳤다면 `npm run test:mutation:storage`(CI break 65, ~12분)를 실행합니다. 게이트가 둘로 나뉜 이유와 래칫 규칙은 `docs/harness/README.md`를 참고하세요 — **검사를 보강하면 break도 함께 올립니다.**
- 테스트·e2e 파일을 추가·수정했다면 `npm run typecheck:test`를 실행합니다 — 앱 `tsconfig`는 테스트를 exclude하므로 이 명령이 아니면 타입 검사를 받지 않습니다. **루트의 `middleware.ts`(사이트 전체 Basic Auth 관문)도 같은 이유로 여기에만 걸려 있습니다** — 앱 `tsconfig`의 `include`가 `src`뿐이고 Vercel이 별도 번들하므로 `npm run build`로는 안 잡힙니다.
- e2e 스펙에 `test.setTimeout`을 새로 주거나 올렸다면 **잡 타임아웃과의 부등식**을 다시 계산합니다 — `스펙 최대 예산 × 2(CI 재시도) + 정상 스위트 시간 < 잡 timeout`. 깨지면 멈춘 스펙이 예산을 태우는 동안 잡이 벽시계로 먼저 잘려 **원인이 로그에 한 줄도 안 남습니다.** 근거와 실측표는 `docs/harness/README.md`를 참고하세요.
- 의존성을 추가했다면 `dependencies` / `devDependencies` 분류를 확인합니다. 빌드·테스트에만 쓰이면 `devDependencies`입니다 — 잘못 넣으면 `audit` 게이트("배포 번들의 취약점만 차단")가 빌드 도구 체인까지 재서, 사용자에게 나가지도 않는 패키지의 권고로 CI가 막힙니다(실제로 겪었습니다).
- 컴포넌트·훅 안의 순수 로직을 고쳤다면, 유닛이 닿을 수 있게 **모듈로 꺼내는 것**을 먼저 검토합니다. `reviewTargetIds`(useQuestions) · `roundHistory`(useQuizSession) · `wrongNote`(AppModals)가 그 사례이고, 셋 다 꺼낸 뒤에야 결함이 검사로 고정됐습니다.
- 추가한 테스트가 헛돌지 않는지 확인합니다: 대상 결함을 일부러 되돌려 **실패하는 것을 보고** 원복합니다.
- 요청된 변경에서 기존 하네스가 잡지 못하는 결함 유형이 드러나면, 작업 완료로 보기 전에 하네스를 보강하거나 보강안을 제시합니다.

## 보고 기준

최종 응답에는 다음을 포함합니다.

- 변경한 내용
- 사용한 하네스 문서
- 실행한 정확한 명령과 결과
- 생략한 점검이 있다면 생략 사유와 범위
