# ISTQB / CSTS 문제 풀이 앱 — 기능 & QA 포트폴리오

![CI](https://github.com/WindowHyun/ISTQB/actions/workflows/ci.yml/badge.svg)
![tests](https://img.shields.io/badge/tests-51%20unit%20%2B%20223%20e2e-brightgreen)
![License](https://img.shields.io/badge/License-MIT%20(code)-yellow)
![stack](https://img.shields.io/badge/React%2019-TypeScript-blue)

ISTQB Foundation Level v4.0 및 CSTS(SW 테스트 전문가) 한국어 기출 **12세트·626문항**을 푸는 오프라인 CBT 문제 풀이 앱입니다.

> **한 줄 요약** — 단순 기능 구현을 넘어 **테스트 자동화(유닛 51 + E2E 223) · 데이터 정합성 검증 ·
> 결함 근본원인 분석(RCA) · CI 품질 게이트**로 품질을 책임진 1인 프로젝트입니다.
> "무엇을 만들었는가"보다 **"품질을 어떻게 보장했는가"** 를 보여주는 사례입니다.

- 저장소: `github.com/WindowHyun/ISTQB`
- 역할: 1인 (기획 · 데이터 · 프론트엔드 · **QA/테스트 자동화 · CI/CD**)
- 데모: 시험 콘텐츠 저작권상 **공개 라이브 배포 대신 스크린샷·GIF·로컬/비공개 데모로 제공** (아래 [데모 자료](#데모-자료-gif--스크린샷) · [라이선스/데모 정책](#라이선스--데이터-저작권--데모-정책) 참고)

---

## 목차

- [하이라이트 (Quality Engineering)](#하이라이트-quality-engineering)
- [QA 역량 매핑](#qa-역량-매핑)
- [주요 기능](#주요-기능)
- [데모 자료 (GIF · 스크린샷)](#데모-자료-gif--스크린샷)
- [테스트 전략](#테스트-전략)
- [테스트 자동화 상세 (E2E 223)](#테스트-자동화-상세-e2e-223)
- [결함 발견 & 근본원인 분석](#결함-발견--근본원인-분석-case-studies)
- [CI 품질 게이트](#ci-품질-게이트)
- [품질 지표](#품질-지표-metrics)
- [아키텍처](#아키텍처)
- [포함된 문제](#포함된-문제)
- [기술 스택](#기술-스택)
- [로컬 실행](#로컬-실행)
- [라이선스 / 데이터 저작권 / 데모 정책](#라이선스--데이터-저작권--데모-정책)
- [회고 & 개선](#회고--개선)

---

## 하이라이트 (Quality Engineering)

- **테스트 자동화 274개** — Vitest 유닛 51 + Playwright **E2E 223**(스모크·모드·문항유형·네비·설정·영속성·엣지·반응형·접근성·**대용량 import**·**표/그림 문항**·**라이트박스/콘솔**). 전체 시나리오: [`docs/e2e-test-scenarios.md`](docs/e2e-test-scenarios.md).
- **PDF ↔ 데이터 전수 정합성 검증** — 626문항 정답·보기·stem을 **공식 PDF와 1:1 대조**(대조 가능 600문항 불일치 0). 더해 `npm run verify`로 정답·이미지·스키마 자동 점검 + 전 문항 렌더 스윕(404·예외·깨진 이미지 0).
- **자격증별 컷스코어·접근성** — ISTQB 65% / CSTS 환산 52.5점 합격 판정, 색각 대비 글리프·포커스 트랩·reduced-motion 등 a11y 반영.
- **결함 RCA & 회귀 방지** — PDF 원본 ↔ 앱 렌더를 전수 대조해 결함을 찾고, 반복 결함의 근본원인을 분석해 **클래스 단위**로 차단(케이스별 회귀 테스트 추가).
- **CI 품질 게이트** — GitHub Actions 5-job(lint·verify·unit·build·e2e) 통과 시에만 머지.

## QA 역량 매핑

| QA 역량 | 본 프로젝트에서 한 일 | 근거 |
|---------|----------------------|------|
| 테스트 자동화 | Playwright **E2E 223개** + Vitest **유닛 51개** 작성·CI 연동 | `e2e/`, `src/**/*.test.ts` |
| 테스트 설계 | 모드·문항유형·네비·설정·영속성·엣지(경계·격리·복원·대용량 import)·표/그림·반응형·접근성으로 시나리오 분해 | [`docs/e2e-test-scenarios.md`](docs/e2e-test-scenarios.md) |
| 회귀 방지 | 결함 수정마다 회귀 테스트 추가, CI 머지 게이트 | 파서 회귀 케이스, 5-job CI |
| 결함 발견·RCA | **PDF 원본 ↔ 앱 렌더 전수 대조**로 결함 식별, 반복 결함 근본원인 분석 | 아래 [Case Studies](#결함-발견--근본원인-분석-case-studies) |
| 결함 관리 | GitHub Issues 등록·추적 + 커밋/이슈 대시보드 | `docs/commit-dashboard.html` |
| 데이터 품질 검증 | 626문항 정답/이미지/스키마 자동 검증 스크립트 | `npm run verify` |
| 크로스플랫폼/반응형 | 모바일(375)·태블릿(768) 뷰포트 E2E | `e2e/react-responsive.spec.ts` |
| 접근성(A11y) | aria-pressed/current·role·키보드·aria-live 검증 | `e2e/react-a11y.spec.ts` |
| 탐색적 테스트 | 전 문항 626 렌더/리소스 스윕(404·예외·깨진 이미지 0) | Playwright 스윕 |

## 주요 기능

- ISTQB / CSTS 자격증 선택 → 세트 선택 → 풀이로 이어지는 진입 흐름
- **연습 · 시험 · 랜덤 · 오답** 4가지 모드
- 연습 모드: 답 선택 후 즉시 정답/해설 확인 / 시험·랜덤·오답 모드: 채점 후 결과 확인
- 오답 모드에서 `오답 다시풀기` 전까지 기존 오답 기록 보호
- 풀이 중 세트/모드 변경 시 확인 알림
- 앱을 껐다 켜도 풀이 상태 복원(localStorage / IndexedDB)
- 풀이 기록 JSON **내보내기 / 가져오기**
- **자격증별 합격 컷스코어** — ISTQB 65%(40문항 기준 26) / CSTS 환산 52.5점, 채점 후 합/불 결과 요약
- **미응답 채점 확인** 모달(실수 제출 방지) · **채점 결과 요약**(점수·정답률·소요시간·오답 연계)
- **그림 확대 라이트박스**(새 탭 이탈 없이 인앱 확대, Esc/배경 닫기·포커스 트랩)
- **학습 통계 대시보드**(응시 이력·평균/최고 정답률)
- PDF에서 추출한 **표·그림·코드 블록·목록**을 이미지/구조화 블록으로 렌더링(마크다운 표 → HTML `<table>`)
- 다크모드(그림 흰 배경 보정) · 반응형(모바일 드로어·하단 액션바·점프핀) · **색각 대비 글리프**
- 단답형·복수정답·진위형 등 다양한 문항 유형 지원
- **화면 내 콘솔**(`?debug`/설정 토글) — DevTools 없이 로그·오류 확인 · 비차단 **토스트** 알림 · 로딩 **스켈레톤**
- **PWA 새 버전 업데이트 배너** — 새 버전(서비스워커) 감지 시 하단 배너로 알리고 1탭으로 갱신 · 진입 시 항상 최초 화면 복귀(bfcache 포함) · 레거시 SW 자가 해제 tombstone

## 데모 자료 (GIF · 스크린샷)

### 기능 동작 GIF

| 기능 | GIF |
|------|-----|
| 연습 풀이(즉시 피드백·문항 이동) | ![연습](docs/gifs/01-practice.gif) |
| 시험 채점(점수·정답 공개) | ![채점](docs/gifs/02-grade.gif) |
| 오답노트(목록·해당 문항 이동) | ![오답노트](docs/gifs/03-wrongnote.gif) |
| 설정(글자 크기 변경) | ![설정](docs/gifs/04-settings.gif) |
| 모드 전환·번호 팔레트·키보드 네비 | ![네비](docs/gifs/05-nav.gif) |
| 단답형 입력·정답 확인 | ![단답형](docs/gifs/06-shortanswer.gif) |

### 정적 스크린샷

| 화면 | 파일 |
|------|------|
| 제품 선택(게이트) | [`01-gate.png`](docs/screenshots/01-gate.png) |
| 풀이 화면(연습) | [`02-practice.png`](docs/screenshots/02-practice.png) |
| 채점 결과(정답 공개) | [`03-graded.png`](docs/screenshots/03-graded.png) |
| 오답노트 | [`04-wrongnote.png`](docs/screenshots/04-wrongnote.png) |
| 설정 모달 | [`05-settings.png`](docs/screenshots/05-settings.png) |
| 그림 문항(상태도) | [`06-figure.png`](docs/screenshots/06-figure.png) |
| 단답형 입력 | [`07-shortanswer.png`](docs/screenshots/07-shortanswer.png) |
| 모바일 뷰 | [`08-mobile.png`](docs/screenshots/08-mobile.png) |

## 테스트 전략

```
        ▲  E2E (Playwright) — 223개: 사용자 플로우·엣지·크로스뷰포트·A11y
       ───
      ─────  통합/렌더 — jsdom 렌더 테스트(파서·RichText)
     ───────  유닛 (Vitest) — 51개: 정답판정·파서·컷스코어·저장·콘솔 로직
    ─────────  데이터 검증 — verify + PDF 전수 대조(정답·이미지·스키마, 626문항)
```

- **계층별 역할 분리**: 로직은 유닛, 화면 흐름은 E2E, 데이터는 정합성 스크립트로 검증.
- **환경 제약 대응**: 로컬 브라우저 다운로드가 막힌 상황에서 **CI를 신뢰 검증 계층**으로 활용하고, jsdom 렌더 테스트로 정적 검사(tsc/lint)가 못 잡는 런타임 크래시까지 검출.

## 테스트 자동화 상세 (E2E 223)

- **카테고리**: 스모크 · 모드 · 네비게이션 · 설정 · 문항유형 · 콘텐츠 · **영속성/백업** · **엣지(경계·격리·복원·모달·반응형)** · **대용량/비정상 import** · **특정 표/그림 문항** · **라이트박스/화면 콘솔** · **접근성**.
- **특징**: headless 실행, 결정적 타게팅(특정 세트·문항 고정), 공용 헬퍼(`e2e/helpers.ts`)로 중복 제거, 실제 qid로 백업을 생성해 import 복원까지 검증.
- **검증 예**: 채점 루프(점수·정답 공개·오답노트), 미응답 채점 확인, 자격증별 컷스코어, 새로고침 후 답안 복원, export→import 라운드트립, 복수정답 cap, 모바일 드로어/하단바, 키보드만으로 보기 선택, 600 junk·이력 150건·5만 자 import 견고성.
- 전체 시나리오(전제·행위·기대): [`docs/e2e-test-scenarios.md`](docs/e2e-test-scenarios.md).

## 결함 발견 & 근본원인 분석 (Case Studies)

> QA의 핵심 — "버그를 어떻게 찾고, 왜 났는지 분석하고, 재발을 어떻게 막았는가".

### CS1. 반복되는 줄바꿈 결함의 근본 원인 (RCA)

- **현상**: 문장이 "~다."에서 끊기고, `(QA)`·보기 표가 깨지는 결함이 수정해도 반복.
- **분석**: ① 데이터가 PDF 추출로 블록 단위 조각화, ② **특정 패턴만 막아** 새 패턴이 계속 노출, ③ `"A)"` 같은 조각이 보기 마커로 **오분류**되며 병합이 깨짐.
- **조치**: 패턴 단발 대응 → **클래스 단위 규칙(파싱 전 병합 + 한글 어미/괄호/항목 가드)** 으로 전환, 각 케이스에 **회귀 테스트** 추가. 이후 동일 클래스 재발 차단.

### CS2. PDF ↔ 앱 렌더 전수 대조로 이미지 결함 발견

- **방법**: Playwright(앱) + PDF 뷰어(pymupdf)로 figure·626문항을 1:1 대조.
- **발견**: 다이어그램 대신 **시험 안내문이 잘못 크롭**된 이미지, **문제 전체를 캡처한 과캡처**, 중복 텍스트 등.
- **조치**: 원본 PDF에서 다이어그램만 재추출, 컨택트시트 전수 육안 검수, 결과를 회귀 스펙으로 고정. 정답·데이터는 불변으로 유지(CI `verify`로 보장).

### CS3. 배포 전환 후 캐시/서비스워커 결함 진단

- 레거시 PWA 서비스워커 잔존으로 신버전이 안 보이는 결함을 진단, **자가 해제 tombstone**으로 해소.

## CI 품질 게이트

- GitHub Actions **5 job**: `lint` · `verify(데이터)` · `unit` · `build` · `e2e`.
- 모든 job 통과해야 머지 → **결함의 main 유입 차단**. 동시성·캐시·최소권한 설정.

## 품질 지표 (Metrics)

- 자동화 테스트: **유닛 51 + E2E 223 = 274** (전 문항 626 렌더 스윕 별도).
- 유닛 커버리지(src): **Stmts ~55% · Branch ~54% · Funcs ~60%** (핵심 로직 파서/정답판정/저장 집중).
- 데이터 무결성: 626문항 정답·이미지·스키마 `verify` 통과, 전수 스윕 결과 **404·예외·깨진 이미지 0**.
- 번들: main JS **205KB(gzip 65KB)**, CSS 17KB(gzip 4KB).

## 아키텍처

데이터 정본(`www/`)을 동기화로 배포 경로에 복사하고, 웹은 React(`dist`)·APK는 바닐라 JS(`www`)로 서빙하는 **이중 런타임** 구조입니다.

```mermaid
flowchart LR
  PDF["원본 PDF (DATA/)"] -->|pymupdf 추출·정제| SRC["정본 데이터 www/ (index.json + 세트별 JSON, 이미지)"]
  SRC -->|sync-assets| PUB["public/ · dist/ · root"]
  SRC -->|cap:sync| WWW["APK 자산 (www/)"]

  subgraph 웹_운영["웹 운영 (Vercel)"]
    REACT["React 19 + Vite → dist/index.html"]
  end
  subgraph APK["Android (Capacitor)"]
    VANILLA["바닐라 JS (www/index.html)"]
  end
  PUB --> REACT
  WWW --> VANILLA

  subgraph 품질["품질 게이트 (GitHub Actions)"]
    CI["lint · verify · unit(51) · build · e2e(223)"]
  end
  REACT -.검증.-> CI
  SRC -.정합성 verify.-> CI
```

- **데이터 정본**: `www/data/index.json`(세트 인덱스) + `www/data/{istqb,csts}/*.json`(세트별 문제). 공통 스키마는 `id` 기반 `stem` / `options` / `explanation` 블록 구조.
- **이중 런타임**: 웹 운영 진입점은 React 앱(`dist/index.html`, Vercel). 바닐라 JS 앱(`www/`)은 로컬 미리보기·레거시 E2E·APK 패키징 용도로 유지.

## 포함된 문제

데이터는 `www/data/index.json`을 통해 세트 단위로 관리됩니다. (`schemaVersion: 1`)

### ISTQB FL v4.0 (5세트 · 186문항)

| 세트 | 문항 수 |
|------|---------|
| 샘플문제 A | 40 |
| 샘플문제 B | 40 |
| 샘플문제 C | 40 |
| 샘플문제 D | 40 |
| 샘플문제 모음(EXTRA) | 26 |

### CSTS (7세트 · 440문항)

| 세트 | 문항 수 |
|------|---------|
| CSTS 2402FL (공개답안) | 70 |
| CSTS 2403FL (공개답안) | 70 |
| CSTS 2404FL (공개답안) | 70 |
| CSTS 2405FL (공개답안) | 70 |
| 2018년도 예제(일반등급) | 20 |
| 2019년도 예제(일반등급) | 70 |
| SW 테스트 전문가 예제(정답포함) | 70 |

**총 12세트 · 626문항**이 포함되어 있습니다.

## 기술 스택

- **프론트엔드**: React 19, TypeScript, Zustand, Vite 7, PWA(`vite-plugin-pwa`)
- **테스트/QA**: Playwright(E2E), Vitest + jsdom(유닛/렌더), 커스텀 데이터 검증 스크립트
- **데이터 파이프라인**: Python + pymupdf(PDF 추출·대조), 컨택트시트 검수
- **CI/CD**: GitHub Actions, Vercel
- **레거시/모바일**: 바닐라 JS, Capacitor(Android APK)

## 로컬 실행

```bash
npm install
npm run dev      # React 앱 개발 서버 (index.vite.html 기준)
```

기타 명령:

```bash
npm test            # Vitest 유닛 테스트 (51개)
npm run test:cov    # 유닛 테스트 + 커버리지
npm run test:e2e    # Playwright React E2E (70개)
npm run verify      # 데이터 정합성 검증 (626문항 정답·이미지·스키마)
npm run build       # tsc 타입 검사 후 dist/ 정적 빌드
```

> 운영 배포(Vercel)는 `buildCommand: npm run build` 후 `outputDirectory: dist`(React 앱)를 서빙합니다.

## 라이선스 / 데이터 저작권 / 데모 정책

- **소스 코드**: MIT 라이선스 — [`LICENSE`](LICENSE).
- **문제(시험) 콘텐츠**: `DATA/`, `www/data/`, `public/data/` 및 figure 이미지는 **제3자 저작권물**입니다.
  - ISTQB® Foundation Level v4.0 샘플문제 — © ISTQB®
  - CSTS / SW 테스트 전문가 기출 — © 한국정보통신기술협회(TTA)
  - 개인 학습 목적 포함이며 **재배포·상업적 이용은 허용되지 않습니다.**

### 데모 / 배포 정책

시험 콘텐츠 저작권상 **전체 콘텐츠를 공개 라이브로 호스팅하지 않습니다.** 포트폴리오 데모는 다음으로 대체합니다(저작권 안전 순):

1. **스크린샷/GIF** — 위 [데모 자료](#데모-자료-gif--스크린샷) (가장 안전, 권장)
2. **로컬/비공개 데모** — `npm run dev`(로컬) 또는 암호 보호 호스팅
3. **모의문항 데모** — 데이터를 자작 샘플 문항으로 교체 시 공개 라이브도 가능

## 회고 & 개선

- **배운 점**: 데이터 정합성 비용, 반복 결함의 **근본원인 분석**과 회귀 테스트의 ROI, 환경 제약 하의 검증 설계.
- **향후**: 컴포넌트 단위 테스트로 커버리지 보강, Lighthouse/접근성 점수 정량화, 데이터 추출 파이프라인 자동화.
