# ISTQB FL APK QA Report

작성일: 2026-05-06  
대상 브랜치: `codex/istqb-sample-ui-fixes`  
최종 반영 커밋: `d527da3 Improve quiz UI and data persistence`

## 1. QA 범위

이번 QA는 ISTQB Foundation Level v4.0 샘플문제 풀이 앱의 문제 표시 품질, 오답/채점 흐름, 기록 저장/백업, 모바일/태블릿 UI, Android APK 산출물을 대상으로 진행했다.

검증 데이터 기준:

| 문제 세트 | 문항 수 |
| --- | ---: |
| 샘플문제 A | 40 |
| 샘플문제 B | 40 |
| 샘플문제 C | 40 |
| 샘플문제 D | 40 |
| 추가 샘플문제 | 26 |
| 합계 | 186 |

## 2. 사용자 요청사항 반영 현황

| 요청사항 | 반영 상태 | 반영 내용 |
| --- | --- | --- |
| 문제 글씨 가시성 개선 | 완료 | 문제 줄바꿈, 목록, 표, 그림 표시를 정리하고 PDF 불필요 텍스트 노출을 줄였다. |
| 오답 설명 가시성 개선 | 완료 | 해설 영역 줄바꿈과 접기/펼치기를 추가하고 문제와 무관한 PDF footer 성격 텍스트를 정리했다. |
| 풀이 중 문제 세트 변경 알림 | 완료 | 풀이 진행 상태가 있을 때 세트/모드 변경 시 확인 알림을 표시하도록 했다. |
| 정답률 영역 삭제 | 완료 | 상시 정답률 표시는 제거하고 채점 후 필요한 결과 중심으로 노출되도록 정리했다. |
| 초기화 의미 명확화 | 완료 | 현재 모드 풀이 초기화와 현재 세트 기록 전체 삭제를 분리하고 위험 버튼 스타일을 적용했다. |
| 앱 재실행 후 기록 복원 | 완료 | `localStorage`와 IndexedDB fallback 기반의 snapshot 저장/복원 구조를 추가했다. |
| UI/UX 점검 | 완료 | 사이드바 그룹화, 모바일 요약, 진행률 바, 버튼 무게 조정, 선택 답 강조를 적용했다. |
| 오답모드 답 수정 제한 | 완료 | 오답 다시풀기 진입 전에는 채점된 오답 보기 상태로 동작하도록 정리했다. |
| 연습 모드 채점하기 제거 | 완료 | 연습 모드에서는 채점 버튼을 숨기고 바로 풀이 중심으로 사용하게 했다. |
| 표/그림/ii 표시 문제 개선 | 완료 | PDF에서 표로 봐야 하는 영역은 표 또는 줄바꿈으로 보정하고, 문제 본문의 `i`, `ii`, `A/B/C/D` 예시가 보기 배지처럼 오인되지 않도록 정리했다. |
| 추가 샘플문제 반영 | 완료 | PDF 하단의 추가 샘플문제를 별도 `EXTRA` 세트로 추가했다. |
| 백업 내보내기/가져오기 | 완료 | JSON 형태로 기록을 내보내고 가져올 수 있게 했으며, 가져오기 전 요약 모달을 추가했다. |
| 오답 노트 뷰 | 완료 | 오답 노트 모달, 세트 필터, 문제 보기, 선택 세트 오답 다시풀기를 추가했다. |
| 데이터 JSON 분리 | 완료 | HTML 내부에 있던 문제 데이터를 `questions.json`과 `questions.js`로 분리했다. |
| Release APK 준비 | 부분 완료 | release signing 환경변수 기반 설정을 추가했다. 실제 signed release APK는 키스토어 설정 후 별도 빌드가 필요하다. |

## 3. 주요 코드 수정사항

### UI 및 문제 표시

- `index.html`, `www/index.html`
  - 문제 제목을 `문제 12 / 40` 형식으로 변경했다.
  - 문제 번호 접기/펼치기 버튼 문구에 현재 위치를 표시했다.
  - 문제 번호 영역을 문제 카드 하단 구조에 맞춰 정리했다.
  - 진행률 바와 미응답 안내 문구를 추가했다.
  - 선택한 보기의 배경과 키 배지를 더 명확하게 표시했다.
  - 그림 확대 모달을 추가했다.
  - 표 영역에 가로 스크롤 힌트를 추가했다.
  - 해설 접기/펼치기를 추가했다.
  - 사이드바의 풀이, 기록 관리, 초기화 섹션을 분리했다.
  - 모바일/작은 태블릿에서 상단 요약과 접이식 설정 패널 구조를 적용했다.

### 기록 저장 및 백업

- `index.html`, `www/index.html`
  - 풀이 상태, 채점 상태, 오답 다시풀기 상태, 랜덤 문제 참조, UI 접힘 상태를 snapshot으로 저장한다.
  - `localStorage` 저장 실패 가능성을 고려해 IndexedDB fallback을 추가했다.
  - JSON 내보내기/가져오기를 추가했다.
  - 백업 가져오기 전 현재 기록과 백업 내용을 비교하는 요약 모달을 추가했다.

### 오답 노트

- `index.html`, `www/index.html`
  - 전체/세트별/랜덤 오답 필터를 추가했다.
  - 선택 세트 오답 다시풀기 버튼을 추가했다.
  - 오답 노트에서 문제 보기 이동 시 세트와 모드 전환을 보정했다.
  - 랜덤 오답의 내 답 조회 기준을 랜덤 답안 기준으로 보정했다.

### 데이터 및 검증

- `questions.json`, `www/questions.json`
  - 문제 데이터 원본을 JSON 파일로 분리했다.
- `questions.js`, `www/questions.js`
  - `file://` 미리보기 호환을 위해 `window.ISTQB_DATA` 래퍼를 유지했다.
- `scripts/verify.js`
  - 186문항 데이터 구조, 세트/번호 중복, 답안/보기 정합성, HTML/JS 문법을 검증한다.
- `service-worker.js`, `www/service-worker.js`
  - `questions.json`, `questions.js`를 앱 셸 캐시에 포함했다.

### Android 및 배포

- `android/app/src/main/AndroidManifest.xml`
  - 불필요한 네트워크 권한 제거 및 백업 제한 설정을 반영했다.
- `android/app/build.gradle`
  - `ISTQB_RELEASE_STORE_FILE`, `ISTQB_RELEASE_STORE_PASSWORD`, `ISTQB_RELEASE_KEY_ALIAS`, `ISTQB_RELEASE_KEY_PASSWORD` 환경변수 기반 release signing 설정을 추가했다.
- `package.json`
  - `verify`, `android:release` 스크립트를 추가했다.
- `.gitignore`
  - 키스토어 파일(`*.jks`, `*.keystore`)이 커밋되지 않도록 제외했다.

## 4. 수행한 검증

| 검증 항목 | 결과 |
| --- | --- |
| 문제 데이터 검증 | 통과 |
| 총 문항 수 확인 | 186문항 |
| `index.html` / `www/index.html` 동기화 | 통과 |
| `www/questions.json` / Android asset 반영 확인 | 통과 |
| `npm run verify` | 통과 |
| `npm run cap:sync` | 통과 |
| `gradlew assembleDebug` | 통과 |
| GitHub push | 완료 |
| GitHub Release asset 업로드 | 완료 |

검증 명령:

```powershell
npm run verify
npm run cap:sync
cd android
.\gradlew.bat assembleDebug
```

## 5. APK 산출물

Debug APK:

```text
ISTQB-FL-debug.apk
```

SHA256:

```text
FB03C61B0255C16E00AA2A14EBD2276644B5997B172973F2CFE84EDD28F72C81
```

GitHub Release:

```text
https://github.com/WindowHyun/ISTQB-APK/releases/download/v1.0.0-debug/ISTQB-FL-debug.apk
```

## 6. 남은 확인사항 및 권장 작업

| 항목 | 우선순위 | 내용 |
| --- | --- | --- |
| Signed release APK 생성 | 높음 | 현재 릴리즈에 올린 APK는 debug APK다. 정식 배포 전 키스토어 기반 signed release APK를 생성해야 한다. |
| 실제 기기 QA | 높음 | Android 태블릿/휴대폰에서 설치, 앱 재실행 후 기록 복원, 백업 가져오기, 오답 다시풀기 흐름을 확인해야 한다. |
| PDF 원문 대비 샘플링 검수 | 중간 | 표/그림/목록이 많은 문항을 중심으로 PDF와 앱 표시를 추가 샘플링하는 것이 좋다. |
| 오답 노트 UX 추가 개선 | 중간 | 필터별 정렬, 검색, 자주 틀린 문항 표시를 추가하면 학습성이 좋아진다. |
| 데이터 편집 파이프라인 | 중간 | `questions.json`을 원본으로 두고 `questions.js`를 자동 생성하는 스크립트를 추가하면 유지보수가 쉬워진다. |
| Release note 정리 | 낮음 | GitHub Release 설명에 변경사항과 APK 해시를 함께 남기면 배포 이력이 더 명확해진다. |

## 7. 결론

사용자가 제기한 문제 가시성, 표/그림/목록 표시, 오답 설명, 오답 모드, 저장/복원, 백업, UI/UX 관련 핵심 이슈는 코드에 반영되었다. 현재 debug APK 빌드와 GitHub Release 업로드까지 완료되었으며, 정식 배포 단계에서는 signed release APK 생성과 실제 기기 QA가 다음 필수 확인 항목이다.
