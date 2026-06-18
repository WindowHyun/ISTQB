# APK 빌드 → Firebase App Distribution 배포 가이드

이 앱을 **APK로 빌드해 Firebase App Distribution(테스터 배포)** 으로 올리는 방법.
APK에는 이제 **React 앱(`dist`)** 이 번들된다(`capacitor.config.json`의 `webDir: "dist"`).

> ⚠️ **저작권**: 앱에 ISTQB®/TTA 기출(제3자 저작권물)이 포함되어 있다. 공개 스토어·공개 링크
> 배포는 부적절하며, **비공개 테스터에게만** 배포할 것.

---

## 0. 사전 준비 (한 번만)

1. **Firebase 프로젝트** 생성 → **Android 앱 등록**
   - 패키지명: `com.local.istqbfl` (== `capacitor.config.json`의 `appId`)
   - 등록 후 **앱 ID** 확보(형식: `1:1234567890:android:abcdef…`) → `FIREBASE_ANDROID_APP_ID`
2. **App Distribution 활성화**: Firebase 콘솔 → Release & Monitor → App Distribution
3. **테스터 그룹** 생성(예: `testers`) + 테스터 이메일 등록
4. **서비스 계정 키** 발급(자동화용):
   - Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성(JSON 다운로드)
   - GCP IAM에서 해당 서비스 계정에 **"Firebase App Distribution Admin"** 역할 부여
   - JSON 파일 **전체 내용** → `FIREBASE_SERVICE_ACCOUNT_JSON`

---

## 1. 이 저장소에서 이미 끝난 부분 (SDK 불필요)

- ✅ `webDir`를 `dist`로 전환 → APK가 **새 React 앱**을 담음
- ✅ `npm run build` + `npx cap sync android` 로 `android/app/src/main/assets/public/`에 React 앱 주입(빌드 직전 상태)
- ✅ CI 워크플로 `.github/workflows/android-firebase.yml` 작성

남은 것은 **APK 컴파일(Android SDK 필요)** 과 **Firebase 업로드** 뿐.

---

## 2. 로컬에서 직접 빌드·배포 (Android SDK 보유 시)

```bash
# (1) 웹 빌드 + 안드로이드 동기화
npm run build
npx cap sync android

# (2) APK 빌드 (debug — 서명 키 불필요, 테스터 배포용으로 충분)
cd android
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
# 결과: android/app/build/outputs/apk/debug/app-debug.apk

# (3) Firebase App Distribution 업로드
npm i -g firebase-tools
firebase login
firebase appdistribution:distribute \
  android/app/build/outputs/apk/debug/app-debug.apk \
  --app "<FIREBASE_ANDROID_APP_ID>" \
  --groups "testers" \
  --release-notes "새 빌드(React 앱)"
```

> 정식 배포용 **release 서명 APK**가 필요하면 `assembleRelease` + keystore(환경변수
> `ISTQB_RELEASE_*`)를 사용한다. 결과물은 `…/apk/release/app-release.apk`.

---

## 3. GitHub Actions로 자동화 (SDK 없는 환경에서도 CI가 빌드)

워크플로: **`.github/workflows/android-firebase.yml`** (웹빌드 → cap sync → APK → 업로드)

1. **Secrets 등록** (Settings → Secrets and variables → Actions):
   | Secret | 값 |
   |--------|----|
   | `FIREBASE_ANDROID_APP_ID` | Firebase 안드로이드 앱 ID |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | 서비스 계정 키 JSON 전체 |
2. **실행**: Actions 탭 → "Android → Firebase App Distribution" → **Run workflow**
   - 입력: 릴리스 노트, 테스터 그룹
   - 또는 `v*` 태그를 푸시하면 자동 실행
3. 완료되면 테스터에게 새 빌드 알림이 가고, App Distribution 콘솔/아티팩트에서 APK 확인 가능.

---

## 4. 알아둘 점 (권장/주의)

- **서비스워커**: React 앱은 PWA 서비스워커(`sw.js`)와 업데이트 배너를 포함한다. APK처럼
  **번들된 환경에선 SW 캐시가 불필요·혼란 요소**가 될 수 있다(앱 갱신은 APK 교체로 함).
  필요하면 APK 빌드용으로 SW를 비활성화하는 빌드 모드를 추가하는 것을 권장
  (`vite-plugin-pwa`의 `selfDestroying` 또는 환경변수로 PWA 플러그인 토글).
- **데이터/이미지 경로**: React 앱은 `/images/…` 절대경로와 상대 `data/index.json`을 쓰며,
  `cap sync`가 `dist`의 `data/`·`images/`·`figures/` 등을 함께 번들하므로 오프라인에서도
  동작한다(번들 후 실기기 1회 점검 권장).
- **레거시 분리**: 루트 `service-worker.js`(tombstone)·`www/`(레거시 바닐라 앱)은 그대로 둔다.
  웹 운영 배포(Vercel)는 영향 없음.
- **APK 서명**: debug APK는 디버그 키로 서명된다. App Distribution 테스트엔 문제없지만,
  배포 채널을 넓히려면 release 서명을 사용한다(섹션 2/워크플로 주석 참고).
