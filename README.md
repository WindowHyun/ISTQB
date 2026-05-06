# ISTQB FL 문제 풀이 앱

ISTQB Foundation Level v4.0 한국어 샘플 문제를 태블릿과 Android APK에서 풀 수 있도록 만든 오프라인 문제 풀이 앱입니다.

## 현재 포함된 문제

- 샘플문제 A: 40문항
- 샘플문제 B: 40문항
- 샘플문제 C: 40문항
- 샘플문제 D: 40문항
- 추가 샘플문제: 26문항

총 186문항이 포함되어 있습니다.

## 주요 기능

- 연습 모드, 시험 모드, 랜덤 모드, 오답 모드 지원
- 연습 모드에서는 답 선택 후 즉시 정답/해설 확인
- 시험/랜덤/오답 모드에서는 채점 후 결과 확인
- 오답 모드에서 `오답 다시풀기`를 누르기 전까지 기존 오답 기록 보호
- 문제 풀이 중 문제 세트나 모드 변경 시 확인 알림 표시
- 앱을 껐다 켜도 풀이 상태를 복원할 수 있도록 localStorage와 IndexedDB에 저장
- 풀이 기록을 JSON 파일로 내보내기/가져오기 지원
- PDF에서 추출한 표, 줄바꿈, 목록, 그림 표시 보정
- 정답률 영역 제거
- 반응형 레이아웃 및 태블릿 사용성 개선

## 주요 파일

- `index.html`: 루트 미리보기용 앱 HTML
- `www/index.html`: Capacitor APK에 포함되는 앱 HTML
- `questions.json`, `www/questions.json`: 문제 데이터 원본
- `questions.js`, `www/questions.js`: `file://` 미리보기 호환용 데이터 래퍼
- `service-worker.js`, `www/service-worker.js`: 오프라인 캐시 설정
- `figures/`, `www/figures/`: 문제에 필요한 그림 이미지
- `server.js`: 로컬 미리보기 서버
- `android/`: Capacitor Android 프로젝트
- `capacitor.config.json`: Capacitor 설정

## 로컬 미리보기

```powershell
npm install
npm run serve
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:8080/
```

단순 확인은 `www/index.html`을 직접 열어도 가능하지만, 최종 동작 확인은 로컬 서버에서 보는 것을 권장합니다.

## APK 빌드

필요한 프로그램:

- Node.js
- JDK 17 이상
- Android Studio 또는 Android SDK

빌드 순서:

```powershell
npm install
npm run cap:sync
cd android
.\gradlew.bat assembleDebug
```

빌드가 성공하면 APK가 생성됩니다.

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

프로젝트 루트에 복사해 둔 배포용 debug APK 이름은 다음과 같습니다.

```text
ISTQB-FL-debug.apk
```

### Release APK 서명

정식 배포용 APK는 debug APK가 아니라 release 서명 APK를 사용합니다. 키스토어 파일과 비밀번호는 저장소에 커밋하지 말고 환경변수로만 전달합니다.

```powershell
$env:ISTQB_RELEASE_STORE_FILE="C:\path\to\istqb-release.jks"
$env:ISTQB_RELEASE_STORE_PASSWORD="키스토어 비밀번호"
$env:ISTQB_RELEASE_KEY_ALIAS="키 별칭"
$env:ISTQB_RELEASE_KEY_PASSWORD="키 비밀번호"
npm run cap:sync
npm run android:release
```

결과 파일:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Android SDK 경로

Gradle이 Android SDK를 찾지 못하면 `android/local.properties` 파일에 SDK 경로를 지정합니다.

```properties
sdk.dir=C\:\\Users\\PC\\AppData\\Local\\Android\\Sdk
```

`android/local.properties`는 로컬 환경 전용 파일이라 Git에는 포함하지 않습니다.

## 검증 기준

최근 빌드 기준으로 다음 항목을 확인했습니다.

- 앱 로딩 시 콘솔 오류 없음
- 문제 세트 5개 표시 확인
- 추가 샘플문제 26문항 표시 확인
- 연습 모드에서 `채점하기` 버튼 숨김 확인
- 추가 샘플문제 20번의 플래닝 포커 표 렌더링 확인
- A23 등 그림 문제 이미지 표시 확인
- APK 내부에 `assets/public/index.html`과 `assets/public/figures/*.png` 포함 확인
- Gradle `assembleDebug` 빌드 성공

## Git 주의사항

APK, Gradle 빌드 결과물, Android SDK 로컬 설정은 Git에 포함하지 않습니다.

```text
node_modules/
android/**/build/
android/local.properties
*.apk
*.aab
*.jks
*.keystore
```

앱 변경 후 APK를 다시 만들 때는 `www/`와 루트 파일이 동기화되어 있는지 확인한 뒤 `npm run cap:sync`를 실행하세요.
