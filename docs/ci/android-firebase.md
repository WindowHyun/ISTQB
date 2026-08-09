# Android → Firebase (`android-firebase.yml`) — APK 빌드·배포

`.github/workflows/android-firebase.yml`. React 앱을 빌드해 Capacitor로 APK를 만들고, **Firebase App Distribution**으로 테스터에게 배포한다. 상세 절차/가이드는 [`../firebase-app-distribution.md`](../firebase-app-distribution.md) 참고 — 이 문서는 워크플로 동작만 설명한다.

## 트리거

```yaml
on:
  workflow_dispatch:
    inputs:
      notes:  { description: "릴리스 노트(테스터에게 표시)", default: "새 빌드" }
      groups: { description: "배포 대상 테스터 그룹(쉼표 구분)", default: "testers" }
  push:
    tags: [ "v*" ]
```

- **수동 실행**(릴리스 노트·테스터 그룹 입력) 또는 **`v*` 태그 푸시** 시.
- CI(`ci.yml`)와 달리 push/PR마다 돌지 않는다 — 배포는 명시적 트리거만.

## job `build-distribute` (단일 job, 순차)

`runs-on: ubuntu-latest`, `timeout-minutes: 30`:

| 단계 | 명령/액션 | 설명 |
| --- | --- | --- |
| Checkout | `actions/checkout@v6` | 소스 |
| Setup Node | `actions/setup-node@v6` (node **24**, `cache: npm`) | CI와 동일 24 |
| Install deps | `npm ci` | 의존성 |
| **Build web** | `npm run build` | React → `dist` |
| Setup JDK 21 | `actions/setup-java@v5` (temurin 21) | Gradle 빌드용 |
| Setup Android SDK | `android-actions/setup-android@v3` | Android SDK |
| **Capacitor sync** | `npx cap sync android` | **`dist`를 `android/app/src/main/assets/public`로 복사**(webDir=dist) |
| **Build debug APK** | `cd android && ./gradlew assembleDebug --no-daemon` | debug APK 생성 |
| **Upload to Firebase** | `wzieba/Firebase-Distribution-Github-Action@v1` | App Distribution 업로드 |
| Upload APK artifact | `actions/upload-artifact@v7` | APK 백업(Actions 아티팩트) |

핵심: **웹(React `dist`)을 먼저 빌드해야** `cap sync`가 최신 산출물을 APK에 담는다(`webDir: dist`).

## 필요한 Secrets

`Settings → Secrets and variables → Actions`:

| Secret | 용도 |
| --- | --- |
| `FIREBASE_ANDROID_APP_ID` | Firebase 안드로이드 앱 ID (예: `1:1234567890:android:abcdef`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | "Firebase App Distribution Admin" 권한 서비스계정 키(JSON 전체) |
| (선택, release 서명) | `ANDROID_KEYSTORE_BASE64` / `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD` |

## 서명(release) 변형

기본은 **debug APK**(서명 키 불필요 — App Distribution 테스터 배포엔 충분). 서명된 release APK를 배포하려면 워크플로 하단 주석의 절차대로 `Build debug APK` 단계를 `assembleRelease`로 교체하고 keystore Secrets를 등록한다(파일 경로: `android/app/build/outputs/apk/release/app-release.apk`).

## 주의

- 배포 채널이 App Distribution(테스터)이라 시험 콘텐츠 저작권 정책상 공개 스토어 배포와 다름 — 비공개 테스터 그룹 대상.
- Android 빌드/서명 관련 상세 점검은 [`../harness/android-build-harness.md`](../harness/android-build-harness.md).
