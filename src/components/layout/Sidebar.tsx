import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore, QUICK_ALL } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { reviewTargetIds } from '../../hooks/useQuestions';
import { gradeKeyFor } from '../../utils/answerKey';
import { useSetCounts } from '../../hooks/useSetCounts';
import { TimerClock } from '../common/TimerClock';
import { BRAND_LOGO_SRC } from '../../utils/brandLogo';
import { showToast } from '../../utils/toast';
import { FEEDBACK_SHEET_URL } from '../../utils/links';
import { isGradedMode, MODE_CAPTION } from '../../utils/modeLabel';


// 랜덤은 퀵에 흡수돼 빠졌다 — 세트 안 무작위 출제와 전 세트 무작위 출제를 둘 다 두면
// 사용자에게는 "무엇이 다른가"를 설명할 수 없는 두 버튼이 나란히 있는 것이었다.
const MODE_LABELS: { mode: 'practice' | 'exam' | 'quick' |'review'; label: string }[] = [
  { mode: 'practice', label: '연습' },
  { mode: 'exam', label: '시험' },
  { mode: 'quick', label: '퀵' },
  { mode: 'review', label: '오답' },
];

export const Sidebar = () => {
  // 렌더에 쓰는 값만 슬라이스 구독(O1) — 타이머(elapsedSeconds)·답안(answers) 변경에 리렌더되지 않는다.
  // 이벤트 핸들러에서만 필요한 graded/answers는 호출 시점에 getState()로 읽는다.
  const {
    mode, setId, activeProduct, drawerOpen,
    setMode, setSetId, beginSession, clearAnswers,
    setStatsOpen, setSettingsOpen, setWrongNoteOpen, setResultOpen, setDrawerOpen,
    setQuitExamOpen, commitSetChange, startQuick,
  } = useQuizStore(useShallow((s) => ({
    mode: s.mode, setId: s.setId, activeProduct: s.activeProduct, drawerOpen: s.drawerOpen,
    setMode: s.setMode, setSetId: s.setSetId, beginSession: s.beginSession,
    clearAnswers: s.clearAnswers,
    setStatsOpen: s.setStatsOpen, setSettingsOpen: s.setSettingsOpen,
    setWrongNoteOpen: s.setWrongNoteOpen, setResultOpen: s.setResultOpen,
    setDrawerOpen: s.setDrawerOpen,
    setQuitExamOpen: s.setQuitExamOpen,
    commitSetChange: s.commitSetChange,
    startQuick: s.startQuick,
  })));
  const asideRef = React.useRef<HTMLElement>(null);
  const certLabel = activeProduct === 'csts' ? 'CSTS' : 'ISTQB';

  // 모바일 드로어 포커스 관리(B1) — 열리면 첫 컨트롤로 포커스 이동 + Tab 순환 트랩,
  // 닫히면 연 버튼(☰)으로 포커스 복귀. 데스크톱에서는 drawerOpen이 항상 false라 무영향.
  useEffect(() => {
    if (!drawerOpen) return;
    const aside = asideRef.current;
    if (!aside) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(aside.querySelectorAll<HTMLElement>('button, select, [href], input, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute('disabled'));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [drawerOpen]);
  const {
    appData, total, answered, correctCount, isGraded, canGrade, progressPercent,
    examLocked, // 응시 중 잠금 — useQuizSession이 단일 원천(게이트와 동일 규칙 집합)
    requestGrade, reviewedCount, completeReview,
  } = useQuizSession();

  // 현재 선택된 제품(ISTQB/CSTS)에 속한 세트만 노출.
  const sets = appData
    ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct)
    : [];
  const currentSet = sets.find((s) => s.id === setId);
  const setCounts = useSetCounts(sets);

  // 제품 선택 후 세트가 미선택(또는 다른 제품 세트)이면 첫 세트를 자동 선택해 문항을 로드.
  // 퀵은 예외 — setId가 어느 세트에도 없는 센티넬(QUICK)이라 여기 걸리면 실제 세트 id로
  // 덮어써진다. 그러면 답안 키가 QUICK-quick-*에서 그 세트 기준으로 바뀌어 풀던 진행이
  // 사라지고, 영속화된 setId도 오염돼 새로고침 이어풀기가 깨진다.
  useEffect(() => {
    if (mode === 'quick') return;
    if (sets.length && !sets.some((s) => s.id === setId)) {
      setSetId(sets[0].id);
    }
  }, [appData, activeProduct, setId, setSetId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 모바일 드로어 안에서 컨트롤을 조작하면 드로어를 닫아 문제로 복귀한다.
  const closeDrawer = () => setDrawerOpen(false);

  const handleSetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // 세트를 바꿔도 현재 모드는 유지한다(연습으로 초기화하지 않음, #2).
    commitSetChange(e.target.value);
  };

  const handleModeChange = (newMode: typeof mode) => {
    // 응시 중 잠금 — 세그먼트 버튼에 disabled가 걸려 있어 지금은 여기 도달할 경로가
    // 없지만, 옆의 handleStartQuick·handleRetryWrong과 같은 규칙을 둔다. 그쪽 주석대로
    // "disabled 하나에만 기대면 잠금을 우회할 수 있다" — 버튼이 세그먼트 밖으로 나가거나
    // 프로그램적으로 불리는 순간 조용히 뚫린다. 'exam' 재클릭은 아래에서 따로 다룬다.
    if (examLocked && newMode !== 'exam') return;

    if (newMode === mode) {
      // 같은 모드 재클릭: 응시 중(잠금)에는 무시해 setIndex/타이머 초기화로 잠금이
      // 무력화되지 않게 한다. 단, "채점 완료" 상태의 시험 재클릭은 원클릭 재응시(초기화)로
      // 동작한다 — 모드 왕복 없이 다시 풀 수 있는 진입로(A5).
      const gradedNow = useQuizStore.getState().graded[gradeKeyFor(setId, mode)];
      if (mode === 'exam' && gradedNow) {
        // examStarted도 해제돼 시작 게이트가 다시 뜬다.
        clearAnswers(setId, mode);
        beginSession();
      }
      closeDrawer();
      return;
    }
    if (newMode === 'exam' && useQuizStore.getState().graded[gradeKeyFor(setId, 'exam')]) {
      // 이미 채점한 시험으로 다시 들어오면 새로 풀 수 있게 초기화한다(#1).
      clearAnswers(setId, 'exam');
    }
    setMode(newMode);
    beginSession();
    closeDrawer();
  };

  const handleStartQuick = () => {
    // 이 버튼은 모드 세그먼트 밖이라 disabled 하나에만 기대면 잠금을 우회할 수 있다
    // (핸들러 가드 이중 방어 — 오답 풀기 버튼과 같은 이유).
    if (examLocked) {
      showToast('시험 응시 중에는 퀵을 시작할 수 없습니다. 먼저 채점하세요.', 'info');
      return;
    }
    // 문항 수를 묻지 않으므로 전 세트를 섞어 끝까지 낸다(QUICK_ALL 주석 참고).
    startQuick(QUICK_ALL);
    beginSession();
    closeDrawer();
  };

  const handleRetryWrong = () => {
    // 응시 중 잠금 — 이 버튼은 세그먼트 밖이라 disabled에 걸리지 않지만 setMode+resetTimer를
    // 호출하므로, 여기서 막지 않으면 잠금을 우회해 시험 타이머가 소실된다.
    if (examLocked) {
      showToast('시험 응시 중에는 오답 풀기를 시작할 수 없습니다. 먼저 채점하세요.', 'info');
      return;
    }
    const { reviewIds } = useQuizStore.getState();
    // 현재 세트에 오답이 없으면 빈 오답 모드로 이동하지 않고 안내만 한다(모드 유지).
    // 판정은 useQuestions의 reviewTargetIds가 단일 원천이다 — 종전에는 여기서 키 목록을
    // 따로 조립했고, 그 목록에 아무도 쓰지 않는 `${setId}-quick`이 들어 있었다.
    const hasWrong = reviewTargetIds(reviewIds, setId).size > 0;
    if (!hasWrong) {
      // 퀵을 빼고 안내한다 — 퀵 오답은 세트 버킷에 담기지 않는 사양이라, 넣어 두면
      // "퀵으로 채점했는데 왜 없냐"는 잘못된 기대를 이 문구가 직접 만들어 낸다.
      showToast('현재 문제 세트에는 오답이 없습니다. 시험 모드에서 채점하면 기록됩니다.', 'info');
      return;
    }
    // 오답 다시 풀기: 이전 재풀이 답안을 비우고 오답(review) 모드로 전환해 틀린 문항만 새로 푼다.
    clearAnswers(setId, 'review');
    setMode('review');
    beginSession();
    closeDrawer();
  };

  // 브랜드 부제 — 자격증과 이 제품이 담은 범위(세트·문항 수)를 한 줄로 보여준다.
  // 문항 합계는 모든 세트의 수를 알 때만 붙인다: 일부만 세어진 상태에서 더하면
  // 실제보다 작은 총계가 잠깐 보이는데, 그건 "몇 문항짜리 앱인가"를 잘못 알리는 것이다.
  const productScope = (() => {
    if (!sets.length) return '';
    const counted = sets.filter((s) => typeof setCounts[s.id] === 'number');
    if (counted.length !== sets.length) return `${sets.length}세트`;
    const totalQuestions = counted.reduce((sum, s) => sum + setCounts[s.id], 0);
    return `${sets.length}세트 ${totalQuestions}문항`;
  })();
  const showGradeSection = isGradedMode(mode);
  // 퀵을 푸는 중(채점 전) — 시작 버튼을 감출지 판단한다.
  // 퀵에 있는 동안. 종전에는 '채점 전'이라는 단서가 붙었는데, 퀵에서 채점이 사라지면서
  // 그 단서가 항상 참이 됐다 — 모드만 보면 된다.
  const quickUnderway = mode === 'quick';

  // 오답 모드 '복습 완료' — 맞힌 문항을 재풀이 대상에서 빼 목록이 실제로 줄어들게 한다.
  // 종전에는 오답을 전부 맞혀도 다음에 같은 목록이 그대로 나와 루프가 닫히지 않았다.
  const handleCompleteReview = () => {
    const done = completeReview();
    closeDrawer();
    showToast(
      done > 0
        ? `${done}문항을 복습 완료로 표시했습니다. 오답 목록에서 빠집니다.`
        : '맞힌 문항이 없습니다. 정답을 맞힌 뒤 눌러 주세요.',
      done > 0 ? 'success' : 'info',
    );
  };

  return (
    <aside
      ref={asideRef}
      className="sidebar"
      aria-label="시험 설정"
      // 모바일 드로어로 열렸을 때만 dialog 시맨틱(☰ 버튼의 aria-haspopup="dialog" 선언과 일치).
      role={drawerOpen ? 'dialog' : undefined}
      aria-modal={drawerOpen || undefined}
    >
      <div className="brand">
        <img src={BRAND_LOGO_SRC} alt="" />
        <div className="brand-text">
          <p id="productSubtitle">
            {certLabel}{productScope ? ` · ${productScope}` : ''}
          </p>
          {/* 퀵에서는 세트명을 쓰지 않는다 — 세트 셀렉트를 감춘 것과 같은 이유이고,
              여기가 실제로 세트명이 새어 나오던 자리다. 퀵 모드로 들어와도 setId는 직전에
              고른 세트 그대로여서(모드 세그먼트는 mode만 바꾼다) 전 세트를 섞어 푸는 중에
              "(공개답안) CSTS 2402FL"이 제목으로 떠 있었다 — 지금 푸는 문항의 출처도
              아니어서 순전히 잘못된 정보다. */}
          <h1 id="productTitle">{mode === 'quick' ? '퀵 랜덤' : (currentSet?.title || '문제 풀이')}</h1>
        </div>
        {/* 모바일 드로어 전용 닫기 버튼(CSS로 데스크톱 숨김) — 터치 스크린리더 사용자는
            백드롭(aria-hidden)·Esc 외의 명시적 탈출 UI가 필요하다. */}
        <button
          type="button"
          className="drawer-close"
          aria-label="메뉴 닫기"
          data-testid="drawer-close"
          onClick={closeDrawer}
        >
          ✕
        </button>
      </div>

      {mode === 'review' && total > 0 && (
        <section className="action-section quick-grade-section">
          <div className="actions">
            <button
              type="button"
              className="primary"
              data-testid="complete-review-btn"
              disabled={reviewedCount === 0}
              onClick={handleCompleteReview}
            >
              복습 완료 ({reviewedCount}/{total})
            </button>
          </div>
          <p className="action-hint">맞힌 문항이 오답 목록에서 빠집니다. 다시 틀리면 되돌아와요.</p>
        </section>
      )}

      {showGradeSection && (
        <section className="action-section quick-grade-section">
          <div className="actions">
            {canGrade && (
              <button
                type="button"
                className="primary"
                data-testid="grade-button"
                // 모바일 드로어에서 누르면 드로어를 먼저 닫는다 — 열린 채면 확인 팝업 중에
                // 뒤의 모드/세트 컨트롤이 계속 조작돼 바뀐 기준으로 채점되는 사고가 난다.
                onClick={() => { closeDrawer(); requestGrade(); }}
              >
                채점하기
              </button>
            )}
            {isGraded && (
              <button
                type="button"
                className="subtle"
                data-testid="result-open"
                onClick={() => { closeDrawer(); setResultOpen(true); }}
              >
                결과 요약
              </button>
            )}
          </div>
          <p className="action-hint" aria-live="polite">
            {isGraded ? <span data-testid="score">점수 {correctCount} / {total}</span> : '답안 선택 후 채점하세요.'}
          </p>
        </section>
      )}

      <div className="sidebar-controls" data-exam-locked={examLocked ? 'true' : undefined}>
        {/* 퀵에서는 세트 선택을 통째로 내린다.
            퀵은 세트 개념이 없는 모드다(제품의 전 세트를 섞어 낸다). 종전에는 셀렉트를
            남겨 두고 disabled로만 막았는데, 그러면 "지금 이 세트를 풀고 있다"는 잘못된
            읽기를 화면이 계속 제공한다 — 퀵으로 들어오기 직전에 고른 세트 이름이 그대로
            떠 있기 때문이다. 고를 수도 없고 뜻하는 바도 없는 컨트롤이라 자리를 비운다.
            (열어 두면 안 되는 이유는 그대로다: 바꿔도 출제 목록은 퀵 추첨 그대로여서
            화면상 아무 일도 안 일어나는 것처럼 보이지만, 실제로는 진행이 통째로 사라진다.
            답안 키가 `${setId}-${mode}-${qid}`라 퀵의 센티넬(QUICK-quick-*)로 저장한 답을
            그 세트 기준으로 찾게 돼 도달할 수 없게 된다.) */}
        {mode !== 'quick' && (
        <section className="panel">
          {/* 라벨은 화면에서 감추고 보조기기에는 남긴다 — 셀렉트가 세트 제목을 그대로
              보여 주므로 위에 회색 대문자 라벨을 겹쳐 두면 같은 말을 두 번 하는 셈이다. */}
          <label className="sr-only" htmlFor="examSelect">문제 세트</label>
          <select
            id="examSelect"
            value={setId}
            onChange={handleSetChange}
            disabled={examLocked}
            data-testid="set-select"
          >
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.title}{setCounts[set.id] != null ? ` (${setCounts[set.id]}문항)` : ''}
              </option>
            ))}
          </select>
        </section>
        )}

        <section className="panel">
          {/* 시각 라벨 없음 — 세그먼트 자체가 role=group + aria-label로 이름을 갖고 있고,
              바로 아래 모드 캡션이 지금 고른 모드를 글로 설명한다. */}
          <div className="segmented" role="group" aria-label="풀이 모드">
            {MODE_LABELS.map(({ mode: m, label }) => (
              <button
                key={m}
                // 응시 중에는 다른 모드로의 전환을 막는다(현재 시험 버튼은 활성 유지).
                disabled={examLocked && m !== 'exam'}
                type="button"
                className={mode === m ? 'active' : ''}
                aria-pressed={mode === m}
                data-mode={m}
                onClick={() => handleModeChange(m)}
              >
                {label}
              </button>
            ))}
          </div>
          {MODE_CAPTION[mode] && (
            <p className="mode-caption" data-testid="mode-caption">{MODE_CAPTION[mode]}</p>
          )}
          {examLocked && (
            <>
              <p className="exam-lock-hint" data-testid="exam-lock-hint">🔒 시험 응시 중 — 채점 후 세트·모드를 변경할 수 있습니다.</p>
              {/* 응시 포기 — 잠금의 공식 탈출구. 없으면 '설정→처음 화면으로'가 비공식 우회로가 된다. */}
              <button
                type="button"
                className="quit-exam-btn"
                data-testid="quit-exam-btn"
                onClick={() => { closeDrawer(); setQuitExamOpen(true); }}
              >
                응시 포기…
              </button>
            </>
          )}
        </section>

        {/* 퀵 — 세트를 고르지 않고 제품 전 세트를 섞어 한 문항씩 무한으로 푼다.
            세그먼트(세트 안의 풀이 모드)와 성격이 달라 별도 섹션에 둔다: 세그먼트에 넣으면
            위 세트 선택과 무관한데도 "선택한 세트를 퀵으로 푼다"로 읽힌다.
            위치: 세트 선택과 풀이 모드는 둘 다 "고른 세트를 어떻게 풀 것인가"라 붙어 있어야
            읽히는데, 그 사이에 끼어 있으면 두 컨트롤을 갈라놓는다. 성격이 다른 별도 진입로이므로
            세트 계열 컨트롤 뒤로 뺀다.
            문항 수 선택은 없앴다 — 끝이 정해져 있지 않은 모드에 '10문항'을 고르게 하는 것은
            거짓말이고, 고를 것이 없으면 진입로는 버튼 하나로 충분하다. */}
        {mode === 'quick' && <section className="panel quick-panel">
          <div className="quick-row">
            {/* <span className="quick-label">⚡ 퀵</span> */}
            <button
              type="button"
              className="quick-start-btn"
              data-testid="quick-start-btn"
              disabled={examLocked}
              onClick={handleStartQuick}
            >
              {quickUnderway ? '다시 섞어 시작' : '시작'}
            </button>
          </div>
          <p className="action-hint">
            {quickUnderway
              ? '퀵 진행 중 — 한 문항씩 풀고 바로 정답을 확인해요. 기록은 남지 않습니다.'
              : `${certLabel} 전 세트를 섞어 한 문항씩 냅니다. 풀면 바로 정답·해설이 보이고, 기록은 남지 않습니다.`}
          </p>
        </section>}

        {/* 진행·시간은 값 두 개뿐이라 박스 카드를 두르면 사이드바에 상자가 하나 더 늘어난다.
            구분선 위 한 줄 + 얇은 막대로 같은 정보를 절반 높이에 담는다.
            퀵에서는 통째로 감춘다 — 무한 모드라 진행률의 분모가 없고, 기록을 남기지 않으니
            시간을 잴 이유도 없다. 그 자리의 값(진행·정답·오답·연속)은 문제 화면의 점수판이 맡는다. */}
        {mode !== 'quick' && (
        <section className="stats">
          <div className="stats-line">
            {/* 라이브 영역을 진행률에만 둔다 — 타이머를 포함하면 스크린리더가 매초 시간을 낭독한다. */}
            <span>진행 <strong id="progressText" aria-live="polite">{answered} / {total}</strong></span>
            {/* 시험 응시 중에는 카운트다운이므로 '남은 시간' — 채점 후에는 경과(소요) 시간으로
                돌아가므로 라벨도 함께 되돌린다(TimerClock의 표시 규칙과 일치). */}
            <span>{mode === 'exam' && !isGraded ? '남은 시간' : '시간'} <strong id="timerText"><TimerClock /></strong></span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div id="progressFill" className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </section>
        )}

        <section className="action-section">
          {/* 버튼 두 개가 이미 '오답'을 말하고 있어 머리글은 화면에서 감춘다(보조기기엔 남김). */}
          <h3 className="sr-only">오답 관리</h3>
          <div className="actions">
            {/* 퀵에서는 이 버튼을 내린다. 퀵 오답은 세트 오답 버킷에 담기지 않는 사양이라
                (useQuizSession의 채점 분기 · reviewTargetIds 참고) 여기서 다시 풀 대상이
                구조적으로 존재하지 않는다. 종전에는 버튼이 그대로 있으면서 아무도 쓰지
                않는 `-quick` 키를 뒤졌고, 그래서 방금 10문항을 틀린 사용자에게도 늘
                "퀵에서 틀린 문항이 없습니다"라고 답했다 — 화면(오답 노트)에는 그 오답이
                보이는데 말이다. 눌러도 될 수 없는 버튼을 두는 대신 갈 곳을 알려 준다
                (세트 셀렉트를 퀵 중에 잠근 것과 같은 이유). */}
            {mode !== 'quick' && (
              <button type="button" onClick={handleRetryWrong}>오답 다시 풀기</button>
            )}
            <button type="button" className="subtle" onClick={() => { setWrongNoteOpen(true); closeDrawer(); }}>
              오답 노트
            </button>
          </div>
          {mode === 'quick' && (
            // 퀵에서 틀린 문항이 어디에도 남지 않는다는 것은 화면만 봐서는 알 수 없다.
            // 밝혀 두지 않으면 "방금 틀렸는데 오답 노트에 왜 없냐"가 결함 신고로 돌아온다.
            <p className="action-hint" data-testid="quick-review-hint">
              퀵에서 틀린 문항은 <strong>기록되지 않습니다</strong> — 그 자리에서 해설로 확인하세요.
              오답을 남기려면 <strong>시험</strong> 모드로 채점하면 됩니다.
            </p>
          )}
        </section>

        {/* 세 진입로를 한 줄에 나란히 둔다 — 세로로 쌓으면 사이드바 아래 세 줄을 쓰는데,
            셋 다 풀이 중에 가끔 들르는 보조 경로라 그만한 자리를 받을 이유가 없다.
            화면에는 짧은 말만 두고 전체 이름은 aria-label로 남긴다(이모지도 함께 감춘다). */}
        <section className="settings-section">
          <button
            type="button"
            className="settings-open-btn"
            aria-haspopup="dialog"
            aria-label="학습 통계"
            data-testid="stats-open"
            onClick={() => { setStatsOpen(true); closeDrawer(); }}
          >
            📊 통계
          </button>
          {/* 여기만 aria-label이 없다 — 보이는 말이 이미 전체 이름이라 덧붙일 게 없고,
              label을 달면 접근성 이름에서 "⚙"가 빠져 기존 이름(“⚙ 설정”)이 바뀐다. */}
          <button
            type="button"
            className="settings-open-btn"
            aria-haspopup="dialog"
            onClick={() => { setSettingsOpen(true); closeDrawer(); }}
          >
            ⚙ 설정
          </button>
          {/* 이슈·보완점 제보 — 결함은 풀이 중에 발견되므로 항상 보이는 사이드바에 둔다.
              새 탭으로 열어 풀이 세션(타이머·응시 잠금)을 끊지 않는다. */}
          <a
            className="settings-open-btn feedback-link"
            href={FEEDBACK_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="이슈·보완점 제보"
            data-testid="feedback-link"
            onClick={closeDrawer}
          >
            📝 제보
          </a>
        </section>
      </div>
    </aside>
  );
};
