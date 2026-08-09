# CI 워크플로 문서

저장소의 GitHub Actions 워크플로별로 **무엇을 언제 어떻게 실행하는지**를 정리한 문서 모음입니다.
(각 문서는 실제 `.github/workflows/*.yml`을 근거로 설명하며, 코드 스니펫을 인용합니다.)

## 워크플로 목록

| 워크플로 | 파일 | 트리거 | 하는 일 | 문서 |
| --- | --- | --- | --- | --- |
| **CI** | `.github/workflows/ci.yml` | push(main)·PR·수동 | 14 job 병렬 — 기능·품질: lint · verify-data · **pdf-data** · unit · **mutation** · **mutation-storage** · build · android-build · **e2e** · **nonfunctional** · **apk**, 보안: **audit** · **secrets** · **codeql** | [`ci.md`](./ci.md) |
| **Daily E2E** | `.github/workflows/daily-e2e.yml` | 매일 예약(KST 09:17)·수동 | 코드 변화 없이도 기능 E2E + 비기능 회귀 상시 감시, 실패 시 추적 이슈에 알림 | [`daily-e2e.md`](./daily-e2e.md) |
| **Android → Firebase** | `.github/workflows/android-firebase.yml` | 수동·`v*` 태그 | React 빌드 → Capacitor sync → APK → Firebase App Distribution 배포 | [`android-firebase.md`](./android-firebase.md) |

## 공통 규칙

- 러너: `ubuntu-latest`. Node는 CI/Daily/Android 모두 **24**(안드로이드 빌드는 + JDK **21** temurin).
- 의존성: 전부 `npm ci`(락파일 고정 설치).
- 권한 최소화: 세 워크플로 모두 최상위는 `contents: read`. 더 필요한 권한은 **job 레벨로만** 준다 — CI는 `codeql` job에 `security-events: write`(결과 업로드), Daily는 `notify` job에 `issues: write`(실패 이슈). 테스트를 돌리는 job은 전부 읽기 전용이다.
- 보안 스캔은 공개 저장소라 CodeQL·gitleaks 모두 무료로 동작. `audit`는 배포 번들(프로덕션 의존성) high+ 취약점만 차단하며, 그 게이트가 의미를 가지려면 `package.json`의 dependencies/devDependencies 분류가 정확해야 한다(`ci.md` 참고).
- 시나리오 "무엇을 테스트하나"는 [`../e2e-test-scenarios.md`](../e2e-test-scenarios.md), "어떻게 실행되나"는 이 폴더 문서가 담당.
