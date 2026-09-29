# Android 하네스

적용: `android/**`, `capacitor.config.json`, 패키징되는 웹 산출물(`webDir: dist`), 아이콘·매니페스트·서비스워커, 서명·Gradle·권한, 웹↔네이티브 JS 브리지. 배포 절차는 [`../firebase-app-distribution.md`](../firebase-app-distribution.md).

## 필수 점검

```bash
npm run build      # React → dist (webDir이 dist라 먼저 빌드한다)
npm run cap:sync   # dist → android/app/src/main/assets/public
npm run test:apk   # Pixel 7 + WebView UA + 안전영역 모사
```

네이티브 코드·권한·서명·Gradle을 바꿨으면 `cd android && ./gradlew assembleDebug`(Windows: `gradlew.bat`). 로컬에서 못 돌리면 CI `android-build`가 컴파일한다 — 보고에 그렇게 적는다.

## JS 브리지 계약

웹과 네이티브는 서로를 검사하지 않는다. 웹 유닛은 브리지를 목으로 대체하고 네이티브는 웹을 모른다 — 이름이나 시그니처가 갈리면 웹의 `bridge?.method` 옵셔널 체이닝에 걸려 **APK에서만 조용히 아무 일도 일어나지 않는다.**

| 주입 이름 | 네이티브 | 웹 호출부 | 없을 때 |
| --- | --- | --- | --- |
| `AndroidBackup` | `MainActivity.BackupBridge` | `src/utils/storage.ts` | 백업 저장이 브라우저 다운로드로 폴백 |
| `AndroidTheme` | `MainActivity.ThemeBridge` | `src/utils/nativeSystemBars.ts` | 시스템 바 색이 라이트로 고정(다크에서 흰 띠) |

- 브리지를 추가·변경하면 양쪽 이름을 이 표에 함께 적는다. 웹 쪽 타입은 `src/vite-env.d.ts`의 `Window` 확장에 둔다(타입은 네이티브와의 일치를 증명하지 않는다).
- 색·치수 같은 값은 웹이 넘기고 네이티브는 받기만 한다. 팔레트의 정본은 `globals.css` 토큰 하나다.
- 브리지는 WebView의 모든 JS에 노출된다. `capacitor.config.json`에 `server.url`이 없어 로컬 번들만 싣는 동안은 안전하다. 라이브 리로드를 도입하면 출처 검사를 함께 설계한다.

## 확인할 것

- 패키징된 `assets/public`에 React 산출물(`index.html` → `/assets/*.js`, `data/`·`images/`)이 들어갔다. CI의 "Fail if committed Android project is stale" 단계가 커밋된 `android/`가 sync 결과와 같은지 본다.
- 권한은 최소 범위.
- 서명 비밀값·`*.apk`·`*.aab`·`*.jks`·`*.keystore`·`android/local.properties`·`android/**/build/`를 커밋하지 않는다.
- 시스템 바 색·안전영역처럼 네이티브가 최종 결정하는 값은 웹 유닛이 "무엇을 넘겼나"까지만 증명한다. 나머지는 CI 컴파일과 실기기 확인이 맡는다.

## 보고 추가 항목

- `cap:sync`·`assembleDebug` 실행 여부와 결과(못 돌렸으면 이유)
- 빌드했다면 APK 경로
