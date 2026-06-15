# 코드 리뷰 리포트 — `fix-codex-phase4-compliance`

- 작성일: 2026-06-15
- 대상 브랜치: `fix-codex-phase4-compliance`
- 범위: 코드 변경 없이 정적 리뷰(읽기 전용). 발견 이슈는 `docs/github_issues/R*.md`로 기록.
- 방식: 전문가 체크리스트 기반 — 아키텍처/정확성/보안/에러처리/타입안전성/PWA·빌드/접근성/의존성·리포위생/검증도구.

---

## 1. 한눈에 보기

이 브랜치는 단순 정리가 아니라, **레거시 바닐라 앱(`script.js`)을 유지한 채 Vite + React/TypeScript 재작성(`src/`)을 새로 얹은 대형 전환 브랜치**다. 따라서 두 트랙을 분리해서 봐야 한다.

- **레거시 앱(실제 배포본)**: `vercel.json`의 `buildCommand: ""`, `outputDirectory: "."` 설정으로 Vercel은 루트의 `index.html` + `script.js`를 그대로 서빙한다. 이 앱은 이번 브랜치에서 `questions.js` 전역 의존을 버리고 `./data/index.json`(+ `./public/data` 폴백)을 fetch하도록 마이그레이션되어 **오히려 개선**되었다. `verify.js`/`sync-assets.js`도 실효성 있게 정비됐다.
- **신규 React 앱(미배포)**: `index.vite.html` + `src/`. Vite 빌드 산출물(`dist/`)은 커밋되지 않으며 배포 경로가 아니다. **현재 데이터로는 동작하지 않는 미완성 상태**이며, 핵심 원인은 src/ 내부의 이중 구현이다.

결론: 배포본은 안전하나, **이 브랜치의 본체인 React 앱은 머지 가능한 상태가 아니다.**

---

## 2. 전문가 체크리스트 결과

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| A1 | 단일 데이터 모델/구현 경로 | ❌ Critical | R2 — `src/`에 비통합 구현 2벌 |
| A2 | 데이터 스키마 ↔ 로더 정합성 | ❌ Critical | R1 — `useQuestions`가 실제 JSON과 불일치 |
| A3 | 죽은 코드 없음 | ❌ High | R2 — 정합 컴포넌트 8개 미사용 |
| A4 | 배포 대상 명확성 | ⚠️ Medium | Vercel=루트 레거시, Vite=미배포 |
| B1 | 런타임 크래시 경로 차단 | ❌ Critical | R1 — Sidebar `appData.istqb.sets` TypeError |
| B2 | 백업 가져오기 정확성 | ❌ High | R4 — debounce/복원 레이스 |
| B3 | 랜덤 셔플 균일성 | ⚠️ Medium | R7 — `sort(Math.random)` 편향 |
| B4 | 타이머 정확성 | ⚠️ Medium | R8 — 백그라운드 과다 집계 |
| S1 | XSS(리치텍스트 렌더) | ✅ Pass | `RichText`가 `textContent`만 사용 |
| S2 | 외부 입력 검증 | ⚠️ Medium | R10 — last-product/백업 무검증 |
| E1 | React Error Boundary | ❌ High | R3 — 전무 |
| T1 | `strict` 준수 | ❌ High | R6 — `@ts-nocheck`/`any` |
| P1 | 단일 SW 전략 | ⚠️ Medium | R9 — 수기 SW + vite-plugin-pwa |
| X1 | 접근성(ARIA/포커스) | ⚠️ Medium | R11 — React 측 회귀 |
| D1 | dependencies 분류 | ⚠️ Low | R12 — 빌드 전용이 런타임 deps |
| D2 | 스크래치 산출물 비추적 | ❌ High | R5 — dump/tmp/test 파일 커밋 |
| V1 | `verify.js` 실효성 | ✅ Pass | 두 `script.js` `node -c` + 데이터 검증 |
| V2 | 자산 동기화 자동화 | ✅ Pass | `sync-assets.js` |

---

## 3. 등록 이슈 목록

| 코드 | GitHub | 등급 | 제목 | 파일 |
|------|--------|------|------|------|
| R1 | #56 | Critical | React 앱(useQuestions)이 실제 데이터 스키마와 불일치하여 렌더 불가/크래시 | `R1_react-data-schema-mismatch.md` |
| R2 | #57 | High | src/ 내 이중 구현 + 미사용 컴포넌트 8개 | `R2_dual-implementation-dead-code.md` |
| R3 | #58 | High | React Error Boundary 부재 | `R3_no-error-boundary.md` |
| R4 | #59 | High | 백업 가져오기 debounce 저장-복원 레이스 | `R4_import-backup-race.md` |
| R5 | #60 | High | 스크래치/디버그 산출물 git 추적(리포 위생) | `R5_repo-hygiene-scratch-artifacts.md` |
| R6 | #61 | Medium | TypeScript strict 우회 | `R6_typescript-strict-bypass.md` |
| R7 | #62 | Medium | 랜덤 모드 셔플 편향 | `R7_random-shuffle-bias.md` |
| R8 | #63 | Medium | 타이머 과다 집계 + 이중 모델 | `R8_timer-overcount-dual-model.md` |
| R9 | #64 | Medium | 서비스워커 이중 전략 + PWA 아이콘 빈 배열 | `R9_service-worker-dual-strategy.md` |
| R10 | #65 | Medium | 외부 입력 무검증 | `R10_missing-input-validation.md` |
| R11 | #66 | Medium | React 접근성 회귀 | `R11_react-accessibility-regression.md` |
| R12 | #67 | Low | 빌드 전용 패키지가 dependencies에 분류 | `R12_dependency-classification.md` |

---

## 4. 근거 상세 (핵심 3건)

### R1 — 데이터 스키마 불일치 (Critical)
- `public/data/index.json`은 `{ schemaVersion, sets: [...] }`(평면 배열) ↔ `useQuestions`는 `{ istqb:{sets}, csts:{sets} }` 기대 → `appData.istqb` undefined → `Sidebar.tsx:41`에서 TypeError.
- 세트 파일은 `{ meta, questions: [...] }` ↔ `useQuestions`는 전체를 배열로 취급(`:54-58`).
- index 항목 경로 필드는 `path` ↔ `SetData.file` 사용(`:18,54`) → `fetch('data/undefined')`.

### R2 — 이중 구현 (High)
- Track A(배선): `hooks/useQuestions` + `store/useQuizStore` + `utils/storage` + `QuestionCard/Workspace/Sidebar`.
- Track B(정합·미사용): `features/quiz/*` + `QuestionStem/OptionList/QuestionNav/ResultPanel/AppShell/Empty·Error·LoadingState`(import 0회).
- IndexedDB 3종 파편화: `istqb-db` / `istqb-quiz` / (레거시)`istqb-fl-v4-sample-db`.

### R4 — 가져오기 레이스 (High)
- `importUserData`가 디바운스(500ms) 저장 직후 즉시 동기 복원 → 이전 값 복원 가능, 그럼에도 성공 알림.

---

## 5. 잘 된 점

- 레거시 `script.js`를 `./data/index.json`(+`./public/data` 폴백)으로 마이그레이션 — 데이터 단일화 방향이 옳음.
- `verify.js`가 실효화(두 `script.js` `node -c` + `validate-questions`/`audit-*`).
- `sync-assets.js`로 www→public/dist/root 자산 동기화 자동화(predev/prebuild/precap 훅).
- `RichText`가 imperative DOM + `textContent`라 XSS 표면이 사실상 없음.
- `features/quiz/*` 타입 설계는 데이터와 정합적 — 통합의 토대로 활용 가능.

---

## 6. 권장 우선순위 (머지 전)

1. **R1 → R2**: `features/quiz/*`(데이터 정합) 쪽으로 단일화하고 `useQuestions` 경로 제거.
2. **R3**: Error Boundary 추가(+ `ErrorState` 연결).
3. **R4**: 가져오기 즉시 저장/복원으로 레이스 제거.
4. **R5**: 스크래치 파일 `.gitignore` 처리 및 추적 해제.
5. 이후 R6~R12 순차 정리.

> 비고: 본 리뷰는 코드를 변경하지 않았다. 위 항목은 후속 작업 대상이며, 진행 여부는 별도 결정에 따른다.
