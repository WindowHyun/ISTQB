# 하네스 엔지니어링 가이드

이 디렉터리는 ISTQB/CSTS 문제 풀이 앱의 하네스 전략을 정의합니다. 여기서 하네스란 변경이 정상 동작함을 반복적으로 증명하고, 같은 유형의 결함이 재발하지 않도록 막는 검증 체계입니다.

## 문서 사용 방법

1. 요청된 변경을 영향 범위별로 분류합니다.
2. 수정 전에 해당 하네스 문서를 엽니다.
3. 최소 필수 점검 항목을 확인합니다.
4. 기존 점검으로 결함 유형을 잡을 수 없다면 하네스 보강을 추가하거나 제안합니다.
5. 관련 명령을 실행하고 결과를 보고합니다.

## 하네스 맵

| 변경 유형 | 기본 문서 | 최소 점검 |
| --- | --- | --- |
| 문제 데이터, 정답, 선택지, 해설, 이미지 경로 | `data-harness.md` | `npm run verify` + `python3 scripts/verify-pdf-data.py` |
| UI, CSS, 렌더링, 이미지, 표, 선택지, 반응형 레이아웃 | `ui-render-harness.md` | `npm run lint typecheck` + `npm run test:e2e`, 모바일 영향 시 `npm run test:apk` |
| 앱 동작, 풀이 모드(연습·시험·랜덤·오답·**퀵**), 채점, 챕터 통계, 상태 저장, 가져오기/내보내기 | `app-logic-harness.md` | `npm test` + `npm run test:e2e`, 채점·통계·저장 키를 고쳤으면 `npm run test:mutation` |
| Android, Capacitor, 패키징되는 에셋, APK | `android-build-harness.md` | `npm run build` → `npm run cap:sync` + `npm run test:apk` |
| 릴리스 또는 여러 영역에 걸친 전달 | `release-harness.md` | 관련 영역 점검 전체 |

> **최소 점검에서 `npm run verify`만 적어 두지 않는다.** `verify`는 문제 데이터 검증 스크립트라
> 유닛도 E2E도 한 줄 실행하지 않는다. 종전 이 표는 모든 행의 최소 점검이 `npm run verify`였고,
> 그래서 표를 그대로 따른 앱 로직 변경은 **동작 테스트를 한 번도 거치지 않고** 끝날 수 있었다.
> 각 행의 최소 점검은 "그 변경이 깨뜨릴 수 있는 것을 실제로 실행하는 명령"이어야 한다.

## 기본 명령 세트

```bash
npm run lint && npm run typecheck && npm run typecheck:test   # 정적 게이트
npm run verify                                                # 문제 데이터·콘텐츠 감사
npm test                                                      # 유닛(store·utils 순수 로직)
npm run test:e2e                                              # React 기능 E2E(Chromium)
```

영향 범위에 따라 추가로 실행합니다. 넷 다 CI 게이트이므로 여기서 빠뜨리면 PR에서 잡힙니다.

```bash
npm run test:nf        # 비기능 — 성능·오프라인·타이머·저장 내구성
npm run test:apk       # APK/WebView — 안전영역·터치 타깃(데스크톱 E2E가 대체 못 함)
npm run test:webkit    # Safari/WebKit — IndexedDB·Blob·서비스워커·Date 파싱 계층
npm run test:mutation  # Stryker — 테스트의 결함 검출력(살충제 패러독스 대응)
```

### ⚠️ Playwright 스위트를 동시에 띄우지 않는다

`test:e2e`·`test:nf`·`test:apk`·`test:webkit`은 **한 번에 하나씩** 실행한다.
`playwright.config.ts`의 `webServer`는 설정 전체에 하나뿐이라 포트(4173)와 산출물(`dist/`)을
모든 프로젝트가 공유한다. 별개 프로세스로 두 개를 띄우면 둘 다 "서버가 없다"고 판단해 각자
`npm run build`를 돌리고, 같은 `dist/`에 동시에 쓴다 — 먼저 돌던 쪽이 테스트하던 산출물이
밑에서 갈리면서 문항이 뜨지 않고 locator가 타임아웃한다.

증상이 **테스트 자체의 플래키처럼 보인다.** 실패 지점이 매번 달라지고 단독 실행하면 통과하기
때문이다(실측: apk + nonfunctional 동시 별도 실행 → 각각 2건씩 실패, 단독 실행은 20/20·13/13 통과).
원인을 테스트에서 찾기 전에 **다른 스위트를 같이 돌리고 있지 않은지부터 본다.**

여러 스위트를 한꺼번에 돌려야 하면 한 번의 호출에 `--project`를 여러 개 준다 — 서버와 빌드가
하나로 공유되어 안전하다(같은 두 스위트가 이 방식에서는 33/33 통과했다).

```bash
npm run test:e2e:all   # react + nonfunctional + apk + apk-nf 를 한 번에(직렬 안전)
```

CI는 잡마다 러너가 분리되므로 이 문제가 없다 — 로컬 전용 주의사항이다.

Android 패키징 변경이 있을 때는 `npm run build` → `npm run cap:sync` 순서를 지킵니다
(`webDir: dist`라 빌드 산출물이 선행되어야 합니다).

Android 패키징 변경이 있을 때는 다음 명령 실행 여부를 판단합니다.

```bash
npm run cap:sync
cd android
./gradlew assembleDebug
```

Windows 환경에서는 README에 있는 Windows용 Gradle wrapper 명령을 사용합니다.
