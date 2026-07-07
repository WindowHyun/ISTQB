# CI 워크플로 문서

저장소의 GitHub Actions 워크플로별로 **무엇을 언제 어떻게 실행하는지**를 정리한 문서 모음입니다.
(각 문서는 실제 `.github/workflows/*.yml`을 근거로 설명하며, 코드 스니펫을 인용합니다.)

## 워크플로 목록

| 워크플로 | 파일 | 트리거 | 하는 일 | 문서 |
| --- | --- | --- | --- | --- |
| **CI** | `.github/workflows/ci.yml` | push(main)·PR·수동 | 9 job 병렬 — 기능·품질: lint · verify-data · unit · build · **e2e** · **nonfunctional**, 보안: **audit** · **secrets** · **codeql** | [`ci.md`](./ci.md) |
| **Daily E2E** | `.github/workflows/daily-e2e.yml` | 매일 예약(KST 09:17)·수동 | 코드 변화 없이도 E2E 회귀 상시 감시, 실패 시 이슈 알림 | [`daily-e2e.md`](./daily-e2e.md) |
| **Android → Firebase** | `.github/workflows/android-firebase.yml` | 수동·`v*` 태그 | React 빌드 → Capacitor sync → APK → Firebase App Distribution 배포 | [`android-firebase.md`](./android-firebase.md) |

## 공통 규칙

- 러너: `ubuntu-latest`. Node는 CI/Daily가 **22**, Android가 **20**(+ JDK 17).
- 의존성: 전부 `npm ci`(락파일 고정 설치).
- 권한 최소화: CI 최상위는 `contents: read`. `codeql` job만 결과 업로드용 `security-events: write`를 job 레벨로 부여. Daily는 실패 이슈 작성을 위해 `issues: write` 추가.
- 보안 스캔은 공개 저장소라 CodeQL·gitleaks 모두 무료로 동작. `audit`는 배포 번들(프로덕션 의존성) high+ 취약점만 차단.
- 시나리오 "무엇을 테스트하나"는 [`../e2e-test-scenarios.md`](../e2e-test-scenarios.md), "어떻게 실행되나"는 이 폴더 문서가 담당.
