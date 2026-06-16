# ISTQB CBT 프로젝트 현황 리포트

> 작성일: 2026-06-15 · 저장소: [WindowHyun/ISTQB](https://github.com/WindowHyun/ISTQB) · 대상 브랜치: `fix-codex-phase4-compliance`

---

## 1. 프로젝트 개요

ISTQB / CSTS 자격시험 대비 CBT(Computer Based Test) 웹 애플리케이션입니다. 문제 풀이, 채점, 오답 노트, 랜덤 모의고사, 다크모드 등을 제공하며 PWA / 정적 배포(Vercel)를 지원합니다.

- 주요 코드: `www/script.js`, `www/style.css`, `www/index.html`, `www/data/**`
- 검증 스크립트: `scripts/validate-questions.js`
- 최근 React(Vite + TypeScript) 마이그레이션 진행 중

---

## 2. 개발 진행 요약

| 항목 | 값 |
|------|-----|
| 전체 커밋 수 | 68 |
| 개발 기간 | 2026-05-05 ~ 2026-06-15 (약 6주) |
| 기여자 | YyyyyyCH (62), AI Bot (6) |
| 최다 작업일 | 2026-06-08 (15커밋), 2026-05-31 (14커밋) |

> 커밋 추이·카테고리·기여자 분포는 인터랙티브 대시보드로 시각화했습니다 → [commit-dashboard.html](commit-dashboard.html)

### 주요 마일스톤
- **2026-05-05** 초기 ISTQB 태블릿 APK 앱
- **2026-05-30** CSTS 추출·풀이 플로우 추가, PWA/정적 배포 리팩터링
- **2026-05-31** 타이머 로직·localStorage 영속화, CSTS 렌더링 정비 (집중 작업일)
- **2026-06-08** CSTS 포맷팅/렌더링 대규모 수정, 설정 패널 모달화 (집중 작업일)
- **2026-06-13** 누락 표·다이어그램 복원, harness 가이드 문서화
- **2026-06-14** React(Vite+TS) 마이그레이션 시작, PDF 표/그래프 이미지화 (Phase 5)

---

## 3. QA 재검증 결과 (리포트 vs 실제 코드)

기존 `ISTQB_CBT_QA_Report.docx`의 12개 이슈를 현재 코드와 대조해 재검증했습니다.

### 3.1 유효 — GitHub 이슈로 등록 (9건)

| 원본 ID | 등급 | 내용 | 비고 |
|---------|------|------|------|
| A-1 | Critical | 오답 노트가 비거나 잘못 표시됨 | **원인 정정**: `-exam-` 패턴 문제가 아니라 review 재채점 시 `history.mode`가 `review`로 저장되어 조회 키 불일치 |
| C-1 | Critical | 채점 완료 후 타이머 계속 증가 | `setInterval`에 `clearInterval` 없음 |
| J-1 | High | 한글 보기 마커(가.나.다.라.) 미인식 | `parseStructuredItem` 정규식에 한글 마커 누락 |
| J-2 | High | 연속 두 목록이 하나로 병합 렌더링 | **재작성**: `matching` 타입 아님 → 연속 list flush 누락 |
| F-2 | High | 그림 확대 버튼 위치 밀림 | + `--hover` CSS 변수 미정의 추가 발견 |
| D-2 | High | 랜덤 모드 40문항 하드코딩 | 40개 미만 시 무한 재셔플 위험 |
| G-1 | Medium | 복수 정답 초과 선택 제한 없음 | UX 혼란 |
| F-3 | Medium | 다크모드 색상 누락 + 고아 CSS | `--hover` 변수 미정의 연관 |
| E-1 | Medium | CSTS 관련 dead code | `#cstsPage` DOM 부재 |

### 3.2 신규 발견 — 코드 분석 중 추가 등록 (2건)

| 등급 | 내용 |
|------|------|
| Medium | questionNav 현재 문제 버튼 자동 스크롤 없음 (D-1과 구분되는 별도 이슈) |
| Low | `sanitizeHistories`가 잘못된 `review` mode history를 정화하지 않음 (A-1 연관) |

### 3.3 제외 — 이미 수정됐거나 오탐 (3건)

| 원본 ID | 사유 |
|---------|------|
| D-1 | `scrollQuestionIntoView()` 이미 구현되어 `render()`에서 호출됨 |
| F-1 | 설정 패널 모바일 fixed 다이얼로그 + 외부 클릭 닫힘 모두 구현됨 |
| H-1 | 검증 스크립트가 5지선다를 정상 허용(`length !== 4 && length !== 5`) → false positive 아님 |

---

## 4. 등록된 GitHub 이슈 (11건)

| # | 이슈 | 라벨 |
|---|------|------|
| [#35](https://github.com/WindowHyun/ISTQB/issues/35) | 오답 노트 표시 버그 (review mode 불일치) | bug |
| [#36](https://github.com/WindowHyun/ISTQB/issues/36) | 채점 후 타이머 계속 증가 | bug |
| [#37](https://github.com/WindowHyun/ISTQB/issues/37) | 한글 보기 마커 미인식 | bug |
| [#38](https://github.com/WindowHyun/ISTQB/issues/38) | 연속 번호 목록 병합 렌더링 | bug |
| [#39](https://github.com/WindowHyun/ISTQB/issues/39) | 그림 확대 버튼 + `--hover` 변수 | bug |
| [#40](https://github.com/WindowHyun/ISTQB/issues/40) | 랜덤 모드 40문항 하드코딩 | bug |
| [#41](https://github.com/WindowHyun/ISTQB/issues/41) | 복수 정답 초과 선택 제한 없음 | enhancement |
| [#42](https://github.com/WindowHyun/ISTQB/issues/42) | 다크모드 색상 누락 + 고아 CSS | enhancement |
| [#43](https://github.com/WindowHyun/ISTQB/issues/43) | CSTS dead code 정리 | enhancement |
| [#44](https://github.com/WindowHyun/ISTQB/issues/44) | questionNav 자동 스크롤 (신규) | enhancement |
| [#45](https://github.com/WindowHyun/ISTQB/issues/45) | sanitizeHistories review mode (신규) | bug |

> 이슈 본문 원문: `docs/github_issues/*.md`

---

## 5. 권고 수정 순서

1. **#35, #36** (Critical) — 오답 노트·타이머 우선 처리
2. **#37, #38** (High, 렌더링) — 한글 마커·연속 목록
3. **#39, #40** (High) — 그림 버튼·랜덤 모드
4. **#45** — A-1과 함께 데이터 정합성 보정
5. **#41 ~ #44** (Medium/Low) — UX·정리·신규 개선

---

## 6. 정상 확인 사항

- localStorage 파싱 오류 방어(try/catch) 정상
- 타이머 백그라운드 복귀 폭증 문제 수정 완료
- 문제 인덱스 범위 보호 로직 정상
- 데이터 검증(id 중복, answer 유효성, figure 파일 실존) 오류 0건
