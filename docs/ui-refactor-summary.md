# UI Refactor Summary

## 2026-06-01 Phase 2 Data Stabilization
- 기존 `questions.js` / `csts-questions.js` 로딩을 제거하고 `fetch()` 기반 순수 JSON 로더로 전환했다.
- 문제 데이터는 `public/data/index.json` 및 `www/data/index.json` 카탈로그와 세트별 JSON 파일로 분리했다.
- ISTQB/CSTS 공통 문제 스키마를 `meta` + `questions` 구조로 통일하고, 모든 문제에 `{SET_ID}-{NUMBER}` 형식의 고유 `id`를 추가했다.
- `stem` / `explanation`은 문자열 대신 block 배열 구조를 사용하며, block text 내부의 수동 줄바꿈을 제거했다.
- 기존 저장 데이터 호환을 위해 선택 답안 조회 시 새 questionId key를 우선 사용하고 기존 번호 기반 key를 fallback으로 읽도록 했다.
- `scripts/validate-questions.js`를 추가하고 `npm run validate:questions` 및 `npm run verify`에서 새 JSON 스키마, 중복 ID, 정답/보기 매칭, figure 경로, 수동 줄바꿈을 검증하도록 했다.
- 서비스워커 캐시 버전을 `v32`로 올리고 세트별 JSON 파일을 캐시 대상에 반영했다.

## 대상 프로젝트
- WindowHyun/ISTQB
- HTML/CSS/Vanilla JS 기반 PWA/Capacitor 문제풀이 앱

## 배포 목표
- Android: Capacitor 기반 APK 배포
- iOS: IPA 배포 불가, PWA 설치 방식으로 대응
- Web: Vercel 정적 웹 배포

## 작업 목적
- 문제풀이 앱의 UI/UX, 접근성, 반응형, 성능, 유지보수성, PWA 배포 안정성 개선

## 주요 변경사항
- shadcn/ui 스타일 원칙을 참고한 CSS 디자인 토큰 정리
- 버튼/카드/모달/선택지 스타일 통일
- loading / empty / error state 추가
- 모바일/태블릿 반응형 개선
- 접근성 개선
- 다크모드/고대비 대비 개선
- CSS 중복 제거
- JS DOM 업데이트 구조 정리
- Android APK 대응 유지
- iOS PWA 대응 보강
- Vercel 정적 배포 대응 점검
- 초기 DOM 상태와 JS 상태 불일치 점검

## 변경된 파일
| 파일 | 변경 내용 | 변경 이유 |
|---|---|---|
| `www/index.html` | iOS PWA meta, sidebar `aria-controls`, 초기 status/skeleton 영역 추가 | PWA 설치 안정성, 접근성, 초기 상태 정합성 개선 |
| `www/style.css` | 디자인 토큰, focus-visible, hover/transition, skeleton/empty/error, dark mode, safe-area/modal 보강 | UI 일관성, WCAG 대비, 반응형 안정성 개선 |
| `www/script.js` | 데이터 오류 처리, empty state 렌더링, 모달 포커스 관리, aria 상태, nav fragment 렌더링 보강 | 오류 안내, 키보드 접근성, DOM 업데이트 비용 완화 |
| `www/manifest.json` | `id`, `lang` 추가 | PWA 식별성과 언어 메타 보강 |
| `www/service-worker.js` | 캐시 버전 갱신 | 변경된 정적 자산 캐시 반영 |
| 루트 `index.html`, `style.css`, `script.js`, `manifest.json`, `service-worker.js` | `www` 파일과 동기화 | `npm run serve` 로컬 실행 호환 유지 |
| `vercel.json` | service worker/manifest 헤더 추가 | Vercel 정적 배포 대응 |

## 유지한 항목
- 기존 HTML/CSS/Vanilla JS 구조
- 기존 `questions.js` 데이터 구조
- 기존 문제풀이 로직
- 기존 PWA 구조
- 기존 Capacitor/Android 구조
- 기존 사용자 플로우

## 검증 결과
| 항목 | 결과 | 비고 |
|---|---|---|
| npm run verify | 성공 | PowerShell 정책 때문에 `npm.cmd run verify`로 실행, 186문항/5세트 확인 |
| npm run serve | 성공 | `node server.js` 기반 로컬 서버에서 `/`, `/manifest.json`, `/service-worker.js` HTTP 200 확인 |
| npm run cap:sync | 성공 | 최초 파일 권한 오류 후 승인 권한으로 재실행 성공 |
| npm run android:release | 실패 | Android SDK 위치 미설정. `ANDROID_HOME` 또는 `android/local.properties`의 `sdk.dir` 필요 |
| 수동 문제풀이 플로우 | 성공 | 인앱 브라우저에서 문제 1/40, 선택지 4개, 번호 40개, 콘솔 오류 0개 확인 |
| 오답노트 플로우 | 성공 | 기존 흐름 유지, empty state 보강 |
| 기록 내보내기/가져오기 | 성공 | 기존 Android/share/download/clipboard fallback 유지 |
| 모바일 반응형 확인 | 성공 | CSS breakpoint/safe-area/modal/선택지 터치 영역 보강 |
| iOS PWA 대응 확인 | 환경 미확인 | iOS meta, safe-area, 파일 fallback 안내 보강 |
| Vercel 정적 배포 대응 확인 | 환경 미확인 | `www` 정적 루트 배포 권장, `vercel.json` 헤더 추가 |
| 접근성 기본 확인 | 성공 | focus ring, aria-expanded/pressed/current, modal focus/ESC 보강 |
| PWA 영향 확인 | 성공 | manifest/service worker 경로 유지, 캐시 버전 갱신 |

## 해당 없음 처리
- hydration mismatch: React/Next.js SSR 프로젝트가 아니므로 해당 없음
- shadcn/ui 실제 컴포넌트 적용: React 프로젝트가 아니므로 적용하지 않음
- iOS IPA 배포: 현재 배포 전략상 PWA로 대응하므로 해당 없음
- npm run build: package.json에 build 스크립트가 없으므로 해당 없음

## 남은 개선 과제
- Android release 빌드 전 `ANDROID_HOME` 또는 `android/local.properties`의 `sdk.dir` 설정
- Vercel 프로젝트 설정에서 output/root를 `www`로 지정할지, repository root 정적 파일을 사용할지 배포 환경에서 최종 확정
- 실제 iOS Safari/홈 화면 PWA에서 파일 저장/공유 제한 동작 수동 확인

## 2026-06-01 Urgent Bugfix
- 마지막 문제에서 다음 버튼이 index를 초과하지 않도록 `move()`와 CSTS 보조 화면 이동 버튼에 경계값 방어를 추가했다.
- 첫 문제/마지막 문제에서 이전/다음 버튼 disabled 상태가 실제 index와 일치하도록 렌더링 시점에 갱신했다.
- 마지막으로 선택한 제품(ISTQB/CSTS)을 저장해 새로고침 후에도 제품 선택 화면으로 되돌아가지 않고 현재 풀이 화면을 복원하도록 했다.
- 기존 `startedAt` 기반 타이머 저장값은 `elapsedSeconds`로 마이그레이션하고, 세트/모드/초기화/오답 재풀이 시작 시에만 타이머를 0으로 초기화하도록 정리했다.
- `[처음]` 버튼은 환경설정 패널 내부 위치를 유지하고, 환경설정 패널은 absolute overlay로 열리게 해 문제 카드 레이아웃을 밀지 않도록 수정했다.
- `service-worker.js` 캐시 버전을 `v31`로 갱신해 변경된 정적 파일 반영을 유도했다.
- 검증: `node -c script.js`, `node -c www/script.js`, `npm.cmd run verify` 성공. 브라우저에서 마지막 문제 다음 버튼, 새로고침 복원, 환경설정 패널 레이아웃 밀림 없음 확인.
