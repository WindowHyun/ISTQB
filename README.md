# ISTQB FL Android Tablet PWA

이 폴더는 `offline.html`을 Android 태블릿에서 앱처럼 쓰기 위한 PWA 패키지입니다.

## 포함 파일

- `index.html`: 원본 HTML 앱에 PWA 설정과 서비스워커 등록을 추가한 파일
- `manifest.json`: Android Chrome이 앱 이름, 아이콘, 전체화면 실행 방식을 읽는 파일
- `service-worker.js`: 오프라인 실행을 위한 캐시 파일
- `icons/`: 홈 화면 앱 아이콘
- `server.js`: PC에서 미리 확인할 때 쓰는 간단한 로컬 서버

## PC에서 미리 보기

이 폴더에서 아래 명령을 실행합니다.

```powershell
node server.js
```

PC 브라우저에서 `http://localhost:8080/`을 엽니다.

## Android 태블릿 설치 방법

PWA 설치는 `file://`로 직접 열면 안 되고, Chrome이 보안 주소로 인식하는 위치에서 열어야 합니다.

가장 안정적인 방법은 이 폴더를 HTTPS가 되는 웹 호스팅에 올린 뒤 Android Chrome에서 접속하고, Chrome 메뉴의 `앱 설치` 또는 `홈 화면에 추가`를 누르는 것입니다.

임시 테스트만 할 때는 PC에서 `node server.js`를 실행한 뒤 같은 와이파이의 태블릿에서 `http://PC_IP주소:8080/`로 접속할 수 있습니다. 다만 이 방식은 일반 HTTP라서 기기/Chrome 버전에 따라 설치 버튼이나 오프라인 캐시가 제한될 수 있습니다.

## APK가 필요한 경우

태블릿 여러 대에 배포하거나 Chrome 메뉴를 거치지 않고 설치 파일로 배포해야 한다면, 이 PWA 폴더를 Capacitor 같은 도구로 감싸서 APK로 만들면 됩니다.
