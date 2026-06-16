# UI Refactor Summary

## 2026-06-02 Phase 1~3 Re-Review
- Phase 1 urgent bugfix items were rechecked in a real Chromium mobile viewport (`430x760`).
- Last-question navigation was verified: pressing Next on `문제 40 / 40` keeps the same question and the Next button remains disabled.
- Refresh restoration was verified: after reload, the current product/set/question is restored to the same screen.
- Timer behavior was verified: elapsed time persists through reload and continues ticking after restore.
- The `[처음]` button location was verified: `#productHomeBtn` is inside `#settingsPanel`.
- The settings panel layout behavior was verified: opening settings does not move or resize `.question-card`, `#questionStem`, or `#options`.
- Phase 2 data migration was rechecked: `questions.js` / `csts-questions.js` are no longer present in the active workspace and `www/index.html` no longer loads them.
- Phase 2 schema verification was rechecked: `public/data/index.json`, `www/data/index.json`, set-level JSON files, question IDs, block-based `stem` / `explanation`, answers, options, and image paths pass validation.
- Phase 3 visual/content verification was rerun with `scripts/visual-audit-render.js`; each rendered question waits for visible images to finish loading before layout checks run.
- Phase 3 visual audit covered ISTQB A/B/C/D and CSTS 2402FL/2403FL/2404FL/2405FL/2018/2019/SW example sets.
- Visual audit result: `badCount: 0`.
- Validation result: `npm.cmd run verify` passed with 626 questions across 12 sets and 90 Phase3 content targets.

## 2026-06-02 Korean Classification Marker Fix
- Added a dedicated audit for `(가)`, `(나)`, `(다)`, `(라)` classification-marker questions.
- Fixed `CSTS-FL-2403` question 2 by cropping and adding the missing original PDF diagram image `csts-figures/2403FL-2.png`.
- Fixed `CSTS-FL-2403` question 26 by converting the smashed truth-table text into a table block.
- Fixed `CSTS-FL-2404` question 10 by normalizing spaced blank markers `( 가 )`, `( 나 )` to `(가)`, `(나)`.
- Fixed `CSTS-FL-2405` question 43 by converting the role/task example into a list block so marker text does not clip on mobile.
- Fixed `CSTS-EL-2019` questions 11 and 37 by converting separated marker paragraphs into list blocks.
- Updated the CSTS PDF extraction script so these marker fixes are preserved on future re-extraction.
- Updated service worker cache to `v34` and added `csts-figures/2403FL-2.png` to the app shell.
- Verification result: `npm.cmd run verify` passed and `scripts/visual-audit-render.js` reported `badCount: 0`.

## 2026-06-01 Phase 3 Content/UI Issue Fixes
- ISTQB 샘플 A/B/C/D와 CSTS 2402FL/2403FL/2404FL/2405FL, 2018/2019 일반등급, SW CSTS 예제문제의 Phase3 대상 90개 문항을 감사 대상으로 등록했다.
- 문제 stem/explanation 렌더러가 Phase2 block 배열에서도 기존 rich-text 파서의 이미지/표/코드/리스트 처리를 다시 적용하도록 수정했다.
- 보기/문제 내용이 붙어 보이는 문항은 list/note/prompt/code/image block으로 분리해 시각적 구분을 강화했다.
- ISTQB B22/B31, D22/D23 등 표 성격의 문항은 기존 `source-visuals` 이미지를 block 이미지로 노출하도록 정리했다.
- ISTQB C31 공식 문항은 공식 block을 명시적으로 분리하고 기존 C31 그래프 매핑이 새 setId에서도 동작하도록 수정했다.
- CSTS 2403FL 60번 그래프 누락 이미지를 PDF에서 재추출해 `csts-figures/2403FL-60.png`로 추가했다.
- SW CSTS 예제 7번 컴포넌트 그림을 PDF에서 크롭해 `csts-figures/SW-CSTS-7.png`로 추가했다.
- CSTS 2402FL 27번, 2403FL 11번, 2405FL 30번처럼 그림 1~4 선택지가 필요한 문항은 각 이미지 앞에 `그림 n` note block을 추가했다.
- 코드 문항(CSTS 2403FL 27/56, 2405FL 25, SW 예제 22/28)은 code block으로 정리해 한 줄로 뭉쳐 보이지 않게 했다.
- `scripts/validate-questions.js`가 stem/explanation 내부 image block 경로까지 검증하도록 보강했다.
- `scripts/audit-phase3-content.js`를 추가하고 `npm run verify`에 연결해 Phase3 대상 문항의 이미지/코드/표/불필요 텍스트/긴 단일 블록 회귀를 자동 검사한다.
- PWA 캐시 버전을 `v33`으로 갱신하고 Phase3에서 노출되는 주요 CSTS 이미지들을 service worker 캐시 대상에 추가했다.

### Phase 3 검증 결과
| 항목 | 결과 | 비고 |
|---|---|---|
| npm run verify | 성공 | 626문항/12세트 스키마 검증, Phase3 90개 대상 감사 통과 |
| node -c script.js | 성공 | 루트 실행용 JS 문법 확인 |
| node -c www/script.js | 성공 | Capacitor/Vercel 실행용 JS 문법 확인 |
| 이미지 경로 검증 | 성공 | figure 및 stem/explanation image block 경로 확인 |
| 브라우저 화면 확인 | 부분 확인 | in-app browser는 기존 service worker 캐시가 남아 일부 이전 데이터가 보였고, 별도 Chromium 실행은 권한/사용량 제한으로 미실행 |

## 2026-06-02 CSTS Source PDF Re-Extraction
- `DATA/(공개답안) CSTS 2404FL` 아래의 CSTS 원본 PDF 7개를 기준으로 CSTS JSON을 다시 추출했다.
- 대상 세트: 2402FL, 2403FL, 2404FL, 2405FL, 2018 일반등급, 2019 일반등급, SW CSTS 예제문제.
- 기존 CSTS JSON에서 보이던 보기 누락, 이미지 보기 빈 텍스트, PDF 줄바꿈으로 인한 단어 분리, 일부 불필요 텍스트 섞임 문제를 원본 PDF 기준으로 재정리했다.
- `scripts/extract-csts-from-pdfs.py`를 추가해 문제/보기/정답을 원본 PDF에서 재추출하고 `www/data/csts`와 `public/data/csts`를 동시에 갱신하도록 했다.
- 그림 보기 문항은 option text를 `그림 1~4`로 보정하고, 기존 `csts-figures` 이미지 파일을 문항 번호 기준으로 다시 연결했다.
- 2402FL 31번 IPO 표는 table block으로 재구성해 세로로 늘어지는 텍스트 대신 표로 렌더링되도록 했다.
- 2019 일반등급 31번 상태 전이도 문항은 상태 전이도 이미지를 유지하고 보기 버튼을 `테스트 케이스 1~4`로 정리했다.
- 2018 일반등급 20번은 객관식이 아닌 단답형으로 복구하고 정답을 `50%`로 보정했다.
- 재확인 중 2018/2019 예제 PDF가 문제별 즉시 정답이 아니라 뒤쪽 정답/해설 및 정답표를 사용하는 구조임을 확인하고, 정답표 파싱을 추가해 객관식/진위형 answer key를 원본 기준으로 복구했다.
- 2018 일반등급 1번 보기 ②가 저작권 문구 제거 필터에 같이 제거되던 문제를 수정했다.
- 2018 일반등급 15번 보기 D에 `진위형(O/X) 문항 예제` 섹션 제목이 붙던 문제를 수정했다.
- 검증 결과: `npm.cmd run verify` 성공, 626문항/12세트 검증 및 Phase3 90개 대상 감사 통과.
- 추가 대조 결과: CSTS 객관식/진위형 PDF 정답 대조 0건, CSTS 빈 보기/이미지 누락 0건, ISTQB 빈 보기/이미지/깨진 문자 기본 감사 0건.

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
