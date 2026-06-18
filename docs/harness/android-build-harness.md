# Android 빌드 하네스

## 적용 범위

다음 변경에는 이 하네스를 사용합니다.

- `android/**`
- `capacitor.config.json`
- 패키징되는 웹 에셋 — **`webDir`는 이제 `dist`(React 앱)** 입니다(과거 `www` 레거시 바닐라 앱에서 전환, PR #111). 따라서 APK엔 React 빌드 산출물이 들어갑니다. `www/`는 로컬 미리보기·레거시 E2E 전용으로만 유지됩니다.
- 설치 결과에 영향을 주는 아이콘, 매니페스트, 서비스 워커 동작
- APK 서명, 빌드 설정, Gradle 파일, Android 권한
- Firebase App Distribution 배포 — 절차/CI는 [`docs/firebase-app-distribution.md`](../firebase-app-distribution.md) 참고

## 목표

Android 빌드 하네스는 웹 변경이 올바르게 패키징되고 Android 프로젝트가 계속 빌드된다는 것을 증명해야 합니다.

## 필수 점검

저장소 검증부터 실행합니다.

```bash
npm run verify
```

패키징되는 웹 에셋 또는 Capacitor 설정이 영향받는 경우, **먼저 React 웹을 빌드한 뒤** 동기화합니다(`webDir: dist` 이므로 빌드 산출물이 선행되어야 함).

```bash
npm run build      # React → dist
npm run cap:sync   # dist → android/app/src/main/assets/public
```

Android 빌드 파일, 네이티브 코드, 권한, 서명, 릴리스 핵심 에셋이 영향받는 경우 debug 빌드를 실행합니다.

```bash
cd android
./gradlew assembleDebug
```

Windows에서는 다음을 사용합니다.

```powershell
cd android
.\gradlew.bat assembleDebug
```

## 확인할 내용

- 필요한 경우 `npm run cap:sync`가 성공하는지 확인합니다.
- Android 권한이 의도된 최소 범위로 유지되는지 확인합니다.
- 패키징된 에셋(`android/app/src/main/assets/public`)에 **예상 React(`dist`) 출력**(`index.html`이 `/assets/*.js` 참조 + `data/`·`images/` 번들)이 포함되는지 확인합니다.
- 네이티브 또는 패키징 변경 시 debug APK가 성공적으로 빌드되는지 확인합니다.
- 릴리스 서명 비밀값이 커밋되지 않았는지 확인합니다.
- 생성된 빌드 산출물, APK, AAB, keystore, `android/local.properties`가 추적되지 않는지 확인합니다.

## 하네스를 보강해야 하는 경우

다음 경우에는 점검을 추가하거나 보강안을 제안합니다.

- APK 내부에서만 보이는 패키징 회귀가 있는 경우
- 서비스 워커 또는 매니페스트 문제가 설치된 앱 동작에 영향을 주는 경우
- 권한 또는 서명 변경에 명시적 정책 검증이 필요한 경우
- 빌드는 성공하지만 패키징된 콘텐츠가 오래된 상태인 경우

## 보고 체크리스트

최종 응답에는 다음을 포함합니다.

- `npm run cap:sync` 필요 여부와 실행 여부
- Android 빌드 명령 결과 또는 실행하지 않은 이유
- 의도적으로 커밋하지 않은 생성 파일
- 빌드가 생성된 경우 APK 경로
