# React E2E 테스트 시나리오 (304개)

> 대상: React 앱(`index.vite.html` → Vercel `dist` 배포본). Playwright로 자동화.
> 실행: CI `react` 프로젝트(`testMatch: /react-.*\.spec\.ts/`) — `npm run test:e2e`.
> CI 실행 메커니즘(빌드·서버 기동·병렬·재시도)은 [`ci/ci.md`](./ci/ci.md) 참고.
> 공용 헬퍼: `e2e/helpers.ts` (`openProduct`, `openSet`, `modeBtn`, `gotoQuestion`, `submitGrade`).
> 표기: G(전제) / W(행위) / T(기대).

---

## 스펙 파일 인덱스 (총 304 — Phase 1~4·전이·랜덤 스모크·흐름 UX 추가분은 하단 표 참고)

| 스펙 파일 | 개수 | 영역 |
|-----------|------|------|
| `react-smoke / react-grade / react-feedback / react-functional` | 10 | 스모크·핵심 흐름 |
| `react-modes` | 5 | 풀이 모드 |
| `react-navigation` | 6 | 네비게이션 |
| `react-settings` | 6 | 설정 |
| `react-qtypes` | 6 | 문항 유형(진위형·단답형·복수정답) |
| `react-content` | 8 | 콘텐츠 렌더링·라이트박스 |
| `react-persistence` | 7 | 영속성/백업 |
| `react-edge` | 7 | 엣지(빈 오답·경계·rapid) |
| `react-responsive` | 7 | 반응형(모바일·태블릿) |
| `react-a11y` | 9 | 접근성(ARIA·키보드) |
| `react-layout` | 4 | 하이브리드 레이아웃(팔레트·드로어) |
| `react-features` | 7 | 다크모드·결과요약·통계·미응답확인·라이트박스 포커스 |
| `react-debug` | 3 | 화면 콘솔(`?debug`) |
| `react-final` | 18 | 최종점검 회귀 |
| `react-edge-nav` | 14 | 엣지: 경계 네비게이션 |
| `react-edge-modes` | 20 | 엣지: 모드 격리·리셋·잠금·시험 전환 가드 |
| `react-edge-grade` | 16 | 엣지: 미응답 확인·컷스코어·복수정답·진위형·단답형 |
| `react-edge-persist` | 16 | 엣지: 복원·가져오기·테마/콘솔 지속·**저장 불가 환경(localStorage 예외)** |
| `react-edge-modal` | 18 | 엣지: 모달 Esc/백드롭·통계·토글·**오답노트 문항 보기** |
| `react-edge-content` | 19 | 엣지: 라이트박스·표·콘솔·토스트·**콘텐츠 표시 수정 회귀(밑줄·들여쓰기·병합)** |
| `react-edge-responsive` | 12 | 엣지: 드로어·점프핀·하단바·320px·768px |
| `react-edge-figtable` | 13 | 엣지: 특정 표/그림 문항 |
| `react-edge-import` | 9 | 엣지: 대용량/비정상 import 견고성 |
| `react-pwa` | 2 | PWA 새 버전 업데이트 배너 |
| `react-study-ux` | 24 | 이어풀기 배너·제출 전 검토·오답노트 재설계(세트 선택)·시험 모드 유지/재응시·이어풀기·새로풀기 선택·결과 nowrap·피드백 aria-live |

> 아래는 초기 핵심 70개의 상세 G·W·T이며, 이후 엣지·확장 196개는 위 인덱스의 각 스펙 파일에 동일한 G·W·T 구조로 구현되어 있습니다.

---

## 1. 스모크·핵심 흐름 (10) — `react-smoke / react-grade / react-feedback / react-functional`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 1 | ISTQB 선택 시 문항 렌더 | G 게이트 · W ISTQB 클릭 · T stem·보기 렌더, pageerror 0 |
| 2 | 시험 채점 시 점수 표시 | G 시험 모드 · W 보기 선택→채점 · T 점수·오답노트 표시 |
| 3 | 연습 피드백 누수 방지 | G Q1 응답(피드백) · W 다음 문항 이동 · T 새 문항 #feedback 없음 |
| 4 | 게이트→ISTQB 워크스페이스 렌더 | G 첫 진입 · W ISTQB · T 사이드바+문항, pageerror 0 |
| 5 | 연습 즉시 피드백 + 누수 없음 | G 연습 · W 보기 선택 · T 피드백 표시, 다음 문항엔 없음 |
| 6 | 팔레트+키보드 이동 | G 연습 · W 3번 클릭/→ · T current 갱신·제목 변경 |
| 7 | 시험: 채점 전 비공개→채점→공개+오답노트 | G 시험 · W 선택·채점 · T 점수·#feedback·오답노트 모달 |
| 8 | 랜덤: 문항 로드 ≤40 | G 랜덤 · W 진입 · T 1≤문항수≤40 |
| 9 | 설정 모달+글자 크기 | G ISTQB · W 설정→크게 · T data-qfont=large |
| 10 | CSTS 진위형(O/X)·단답형(입력) UI 존재 | G CSTS 전 세트 스캔 · T O/X 보기·단답 입력 발견 |

## 2. 풀이 모드 (5) — `react-modes`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 11 | 연습 복수정답: 모두 선택해야 피드백 | G Q6(정답2) · W 1개→2개 선택 · T 1개=피드백X, 2개=피드백O |
| 12 | 시험: 채점 후 보기 잠금 | G 시험 채점 · T 보기 버튼 disabled |
| 13 | 시험: 채점 후 팔레트 정/오답 색 | G 시험 채점 · T `.correct`+`.missed` ≥1 |
| 14 | 랜덤: 채점 시 점수 표시 | G 랜덤 · W 선택·채점 · T "점수" 표시 |
| 15 | 오답 다시풀기: review 재응답 | G 시험 채점 후 · W 오답 다시풀기 · T 보기 선택 가능(또는 빈 화면) |

## 3. 네비게이션 (6) — `react-navigation`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 16 | 다음 버튼 이동 | W #nextBtn · T 제목 변경 |
| 17 | 이전 버튼 복귀 | W 다음→이전 · T 제목 변경 |
| 18 | 첫 문항에서 이전 비활성 | T #prevBtn disabled |
| 19 | 마지막 문항에서 다음 비활성 | G 마지막 이동 · T #nextBtn disabled |
| 20 | 팔레트 answered 상태 | W 보기 선택 · T answered ≥1 |
| 21 | 키보드 ←/→ 양방향 이동 | W →,← · T 제목 변경 |

## 4. 설정 (6) — `react-settings`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 22 | ⚙ 설정 모달 열기 | W 설정 · T dialog 표시 |
| 23 | 설정 모달 닫기 | W 닫기 · T dialog 사라짐 |
| 24 | 글자 크기 작게 | W 작게 · T data-qfont=small |
| 25 | 글자 크기 크게→기본 복귀 | W 크게→기본 · T large→normal |
| 26 | 처음 화면으로→게이트 | W 처음 화면 · T ISTQB/CSTS 버튼 |
| 27 | 답안 초기화(confirm) | G 응답 후 · W 초기화 수락 · T answered 0 |

## 5. 문항 유형 (6) — `react-qtypes`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 28 | 진위형 O 선택→피드백 | G 2018 Q16 · W O · T O/X 키, 피드백 |
| 29 | 진위형 피드백에 정답 키 표시 | T "정답" 포함 |
| 30 | 단답형 입력→정답 확인→피드백+정답 | G 2018 Q18 · W 입력·확인 · T 피드백+"정답" |
| 31 | 복수정답 안내 배지 | G Q6 · T "2개" 배지 |
| 32 | 채점 후 정답 보기 `.correct` | G 시험 채점 · T `.option.correct` 1개 |
| 33 | 연습 오답 선택 시 `.wrong` | G 연습 선택 · T correct≥1, wrong≥0 |

## 6. 콘텐츠 렌더링 (7) — `react-content`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 34 | figure 이미지 로드 | G ISTQB-A Q23 · T img complete·naturalWidth>0 |
| 35 | 보기 마크다운 표→HTML `<table>` | G 2404 Q33 · T `.data-table`≥1, raw "\|---\|" 없음 |
| 36 | 가/나/다/라 4항목 렌더 | G 2018 Q10 · T 가.·나.·다.·라. 모두 |
| 37 | 세트 전환 시 1번 초기화 | W 5번→세트변경 · T current="1" |
| 38 | 진행률 텍스트/막대 갱신 | W 응답 · T "0 /"→변경, fill width≠0% |
| 39 | 연습 피드백에 해설 표시 | W 선택 · T `.feedback-body` 내용 존재 |
| 40 | 타이머 1초 단위 증가 | W 2.1초 대기 · T timerText 변경 |

## 7. 영속성/백업 (7) — `react-persistence`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 41 | 응답 후 새로고침→재선택 시 답안 복원 | W 응답·새로고침·재선택 · T answered=1 |
| 42 | 여러 응답 후 새로고침→진행 수 복원 | W 2문항 응답·새로고침 · T answered≥2 |
| 43 | 세트 변경 후 새로고침→세트 유지 | G C세트 · W 새로고침·재선택 · T examSelect=C |
| 44 | 기록 내보내기 JSON 다운로드 | W 내보내기 · T `*.json` 다운로드 |
| 45 | 내보내기→초기화→가져오기 라운드트립 | W export·clear·import · T answered 복원 |
| 46 | 잘못된 파일 가져오기→실패 알림 | W 깨진 JSON 업로드 · T "실패" 알림 |
| 47 | 시험 모드 답안도 새로고침 후 복원 | G 시험 응답 · W 새로고침·재선택 · T answered≥1 |

## 8. 엣지 케이스 (7) — `react-edge`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 48 | 채점 전 오답 다시풀기→빈 화면, 크래시 없음 | W 오답 다시풀기 · T workspace 표시, pageerror 0 |
| 49 | 마지막 문항에서도 채점 동작 | G 마지막·시험 · W 선택·채점 · T 점수 |
| 50 | 풀이 중 제품(ISTQB→CSTS) 전환 | W 설정→처음→CSTS · T examSelect=^CSTS |
| 51 | 모드 전환 시 1번 초기화 | G 5번 · W 시험 전환 · T current="1" |
| 52 | 다음 버튼 연속 클릭→마지막 정지(크래시 없음) | W ≤60회 클릭 · T disabled, pageerror 0 |
| 53 | 복수정답 선택 토글(해제) | G Q6 · W 같은 보기 2회 · T selected 해제 |
| 54 | 복수정답 개수 초과 선택 불가 | G Q6(정답2) · W 전 보기 클릭 · T selected≤2 |

## 9. 반응형 (7) — `react-responsive`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 55 | 모바일(375): 로드·문항 렌더 | T stem·보기 표시 |
| 56 | 모바일: 사이드바+워크스페이스 표시 | T 둘 다 visible |
| 57 | 모바일: 팔레트 이동 | W 3번 클릭 · T current="3" |
| 58 | 모바일: 채점 흐름 | W 선택·채점 · T 점수 |
| 59 | 모바일: 제품 게이트 표시 | T ISTQB/CSTS 버튼 |
| 60 | 모바일: 설정 모달 열기/닫기 | W 설정·닫기 · T dialog 토글 |
| 61 | 태블릿(768): 문항·보기 렌더 | G CSTS-2402 · T stem·보기 표시 |

## 10. 접근성 (9) — `react-a11y`

| # | 시나리오 | G · W · T |
|---|----------|-----------|
| 62 | 모드 버튼 aria-pressed | T practice=true, exam=false |
| 63 | 풀이 모드 role=group+라벨 | T group "풀이 모드" |
| 64 | 현재 팔레트 aria-current | T aria-current=true 버튼="1" |
| 65 | 보기 버튼 aria-pressed | W 선택 · T false→true |
| 66 | 이전/다음 aria-label | T "이전 문제"/"다음 문제" |
| 67 | 백업 파일 입력 aria-label | T /백업/ |
| 68 | 설정 모달 role=dialog+aria-modal | T dialog, aria-modal=true |
| 69 | 키보드(focus+Enter)로 보기 선택 | W focus·Enter · T selected |
| 70 | 진행/타이머 통계 aria-live | T `.stats` aria-live=polite |

---

## 메모
- 결정적 타게팅: 복수정답=ISTQB-A Q6, 진위형=CSTS-2018 Q16, 단답형=CSTS-2018 Q18,
  figure=ISTQB-A Q23, 보기 표=CSTS-2404 Q33, 가나다라=CSTS-2018 Q10.
- 진입 시 항상 제품 선택 게이트가 뜨므로(설계상) 새로고침 복원은 "재선택 후 복원"으로 검증.
- 저장 불가 환경(엣지-영속성): `addInitScript`로 `localStorage.setItem`이 예외를 던지도록 모사해 제품 선택·문항 진입·테마/글자 크기 설정이 크래시 없이 동작하는지 검증(`safeStorage` 래퍼 회귀).
- 로컬 검증: 설치된 chromium headless 기준 **304/304 통과**(+비기능 12). CI는 자체 브라우저로 동일 실행.

---

## Phase 1~4 · 상태 전이 시나리오 (추가분)

| # | 시나리오 | 스펙 |
|---|---|---|
| P1-1 | 시험 모드 진입 시 시작 게이트 노출, 시작 전 문항·채점 버튼 없음 | react-edge-modes |
| P1-2 | 응시 중(시작 후 미채점) 세트 select·타 모드 버튼 disabled + 잠금 힌트 | react-edge-modes |
| P1-3 | 응시 중 '오답 다시 풀기'·통계 챕터 '연습' 진입 차단(잠금 우회 방지) | react-edge-modes · react-transition |
| P1-4 | 응시 중 새로고침 → 이어풀기 → 잠금 유지(리로드 우회 방지) | react-edge-modes |
| P1-5 | 채점하면 잠금 해제, 재응시는 게이트부터(초기화) | react-edge-modes |
| P1-6 | 채점 후 '다시 풀기'(결과 모달)·활성 탭 재클릭 = 원클릭 재응시 | react-edge-modes |
| P2-1 | 첫 응시 "첫 응시" 안내, 재응시 "모드 N회차 · 직전 대비 ▲/▼%p" | react-phase2 |
| P2-2 | 학습 통계 세트별 회차 타임라인 누적(회차 칩·같은 모드 성장폭) | react-phase2 |
| P2-3 | 델타 방향 검증 — 데이터(JSON) 오라클로 점수를 올리고/내려 ▲·▼가 실변화와 일치 | react-phase2 |
| P3-1 | 채점 → 챕터별 정답률(약점순) → '연습'으로 챕터 집중 연습 진입 | react-weakness |
| P3-2 | 오답노트 전 회차 합산 — 최신 회차 정답도 과거 오답이면 유지 | react-weakness |
| P4-1 | 백업 가져오기 스키마 버전 검증·원자성(유닛: storage.import.test) | 유닛 |
| ST-* | 상태 전이 전수(S0 게이트/S1 연습/S2E 시험 3단계/S3 랜덤/S4 오답 × 전이 39건) | react-transition |
| RS-1 | 시드 랜덤 스모크 — 매 실행 다른 세트·답 조합, 원본 JSON 기준 기대 점수와 UI 점수 일치(`SMOKE_SEED` 재현) | react-random-smoke |
| S2-1 | 응시 포기: 응시 중 '응시 포기'→확인→답안 삭제·게이트 복귀·회차 기록 없음 | react-flow-ux |
| S2-2 | 응시 중 '처음 화면으로'는 확인 모달 경유(무단 우회 차단) | react-flow-ux |
| S4-1 | 채점 후 새로고침 → '채점 완료된 회차' 가드(지난 결과 보기/새 회차 시작) — 중복 회차 차단 | react-flow-ux · react-study-ux · react-transition |
| S3-1 | 챕터 미니 시험: 10문항 추첨·'미니' 회차 라벨·세트 타임라인 미포함 | react-flow-ux |
| S5-1 | 랜덤 '새 문제 뽑기' — 답안 초기화+재추첨 | react-flow-ux |
| S1-1 | 랜덤 새로고침 재추첨 정책 토스트 안내 | react-flow-ux |
| S6-1 | 오답 '극복' 배지(최근 시험 2회 연속 정답) + 범례 | react-flow-ux |
| G-1 | 사용설명서: 게이트 하단 버튼 → 모드·통계·백업 설명, Esc 닫기 | react-guide |
| G-2 | 사용설명서: 설정 진입점 — 설정 모달 닫고 가이드 표시(겹침 방지) | react-guide |
