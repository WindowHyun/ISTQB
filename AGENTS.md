# AGENTS.md

## 저장소 작업 방식

이 저장소는 Codex 작업에 하네스 우선(harness-first) 방식을 사용합니다. 변경을 시작하기 전에 작업 영향 범위를 분류하고, `docs/harness/` 아래의 관련 하네스 문서를 먼저 읽습니다.

## 필수 하네스 라우팅

- 데이터, 문제 JSON, 정답, 선택지, 해설, 이미지 경로:
  - `docs/harness/data-harness.md`를 읽습니다.
- UI, CSS, 문제 렌더링, 이미지, 표, 선택지, 반응형 레이아웃:
  - `docs/harness/ui-render-harness.md`를 읽습니다.
- 앱 동작, 풀이 모드, 채점, 오답 노트, 상태 저장, 가져오기/내보내기:
  - `docs/harness/app-logic-harness.md`를 읽습니다.
- Android, Capacitor, `www/`, APK, 매니페스트, 아이콘, 서비스 워커 패키징:
  - `docs/harness/android-build-harness.md`를 읽습니다.
- 릴리스, 전달 전 점검, 여러 영역에 걸친 큰 변경:
  - `docs/harness/release-harness.md`를 읽습니다.

## 기본 검증

- 데이터, JavaScript, UI, 앱 동작을 변경한 뒤에는 `npm run verify`를 실행합니다.
- UI/렌더링/이미지/표/선택지 변경은 `docs/harness/ui-render-harness.md`에 설명된 시각 감사도 실행합니다.
- Android 또는 패키징되는 웹 에셋 변경은 `npm run cap:sync`와 `docs/harness/android-build-harness.md`의 Android 빌드 점검 필요 여부를 판단합니다.
- React 앱(운영 배포)·렌더링·풀이 동작 변경은 `npm test`(유닛 52개)와 `npm run test:e2e`(React E2E 251개, `docs/e2e-test-scenarios.md`)로 회귀를 검증합니다.
- 요청된 변경에서 기존 하네스가 잡지 못하는 결함 유형이 드러나면, 작업 완료로 보기 전에 하네스를 보강하거나 보강안을 제시합니다.

## 보고 기준

최종 응답에는 다음을 포함합니다.

- 변경한 내용
- 사용한 하네스 문서
- 실행한 정확한 명령과 결과
- 생략한 점검이 있다면 생략 사유와 범위
