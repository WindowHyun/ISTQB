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
| 문제 데이터, 정답, 선택지, 해설, 이미지 경로 | `data-harness.md` | `npm run verify` |
| UI, CSS, 렌더링, 이미지, 표, 선택지, 반응형 레이아웃 | `ui-render-harness.md` | `npm run verify`, 필요 시 시각 감사 |
| 앱 동작, 풀이 모드, 채점, 상태 저장, 가져오기/내보내기 | `app-logic-harness.md` | `npm run verify`, 변경 흐름에 맞는 동작 점검 |
| Android, Capacitor, 패키징되는 `www/` 에셋, APK | `android-build-harness.md` | `npm run verify`, 패키징 변경 시 `npm run cap:sync` |
| 릴리스 또는 여러 영역에 걸친 전달 | `release-harness.md` | 관련 영역 점검 전체 |

## 기본 명령 세트

```bash
npm run verify
```

UI 렌더링 감사를 할 때는 로컬 서버를 시작한 뒤 다음을 실행합니다.

```bash
npm run serve
node scripts/visual-audit-render.js
```

Android 패키징 변경이 있을 때는 다음 명령 실행 여부를 판단합니다.

```bash
npm run cap:sync
cd android
./gradlew assembleDebug
```

Windows 환경에서는 README에 있는 Windows용 Gradle wrapper 명령을 사용합니다.
