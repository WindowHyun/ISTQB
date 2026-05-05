# APK 빌드 방법

현재 폴더는 APK로 포장할 수 있게 준비된 Capacitor 프로젝트입니다.

## 1. 필요한 프로그램

Windows에 아래 프로그램이 필요합니다.

- Android Studio
- Android SDK Platform
- Android SDK Build-Tools
- JDK 17 이상

Android Studio 설치 후 첫 실행에서 SDK 설치까지 완료해야 합니다.

## 2. 의존성 설치

이 폴더에서 실행합니다.

```powershell
npm install
```

## 3. Android 프로젝트 생성

```powershell
npx cap add android
npx cap sync android
```

## 4. Android Studio에서 APK 만들기

```powershell
npx cap open android
```

Android Studio가 열리면:

1. `Build`
2. `Build Bundle(s) / APK(s)`
3. `Build APK(s)`

빌드가 끝나면 보통 아래 위치에 APK가 생성됩니다.

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

이 APK를 Android 태블릿으로 옮겨 설치하면 됩니다.

## 참고

처음 설치할 때 Android에서 `알 수 없는 앱 설치 허용`을 켜야 할 수 있습니다.
