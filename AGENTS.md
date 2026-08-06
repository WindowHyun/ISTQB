# AGENTS.md

## 저장소 작업 방식

이 저장소는 Codex 작업에 하네스 우선(harness-first) 방식을 사용합니다. 변경을 시작하기 전에 작업 영향 범위를 분류하고, `docs/harness/` 아래의 관련 하네스 문서를 먼저 읽습니다.

## 필수 하네스 라우팅

- 데이터, 문제 JSON, 정답, 선택지, 해설, 이미지 경로:
  - `docs/harness/data-harness.md`를 읽습니다.
- UI, CSS, 문제 렌더링, 이미지, 표, 선택지, 반응형 레이아웃:
  - `docs/harness/ui-render-harness.md`를 읽습니다.
- 앱 동작, 풀이 모드(연습·시험·랜덤·오답·퀵), 채점, 챕터 통계, 오답 노트, 상태 저장,
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
- IndexedDB·Blob 다운로드·서비스워커·Date 파싱 등 **엔진 계층**을 건드렸으면 `npm run test:webkit`(Safari/WebKit)을 실행합니다 — Chromium 단독 검증으로는 이 계층의 결함이 배포까지 살아남습니다(CI 게이트에도 있습니다).

> 스위트별 테스트 **개수는 여기 적지 않습니다.** 종전에는 적어 뒀는데 한 달 만에 두 번 어긋났고
> (유닛 436→486, 기능 E2E 404→409), 아무도 그 숫자로 판단하지 않으면서 갱신 부채만 남겼습니다.
> 정확한 수치는 각 스위트 실행 결과와 CI 로그가 정본입니다. 다만 **데이터 계약 수치**(12세트
> 626문항 등)는 계약 테스트가 강제하므로 문서에 남깁니다.
- 채점·통계·저장 키 등 핵심 순수 로직을 고쳤다면 `npm run test:mutation`(Stryker, CI break 85)으로 테스트의 결함 검출력을 확인합니다.
- 테스트·e2e 파일을 추가·수정했다면 `npm run typecheck:test`를 실행합니다 — 앱 `tsconfig`는 테스트를 exclude하므로 이 명령이 아니면 타입 검사를 받지 않습니다.
- 추가한 테스트가 헛돌지 않는지 확인합니다: 대상 결함을 일부러 되돌려 **실패하는 것을 보고** 원복합니다.
- 요청된 변경에서 기존 하네스가 잡지 못하는 결함 유형이 드러나면, 작업 완료로 보기 전에 하네스를 보강하거나 보강안을 제시합니다.

## 보고 기준

최종 응답에는 다음을 포함합니다.

- 변경한 내용
- 사용한 하네스 문서
- 실행한 정확한 명령과 결과
- 생략한 점검이 있다면 생략 사유와 범위
