import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore, QUICK_SIZES, QUICK_SET_ID } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { useSetCounts } from '../../hooks/useSetCounts';
import { TimerClock } from '../common/TimerClock';
import { BRAND_LOGO_SRC } from '../../utils/brandLogo';
import { showToast } from '../../utils/toast';
import { FEEDBACK_SHEET_URL } from '../../utils/links';
import { isGradedMode } from '../../utils/modeLabel';


const MODE_LABELS: { mode: 'practice' | 'exam' | 'random' | 'review'; label: string }[] = [
  { mode: 'practice', label: '연습' },
  { mode: 'exam', label: '시험' },
  { mode: 'random', label: '랜덤' },
  { mode: 'review', label: '오답' },
];

export const Sidebar = () => {
  // 렌더에 쓰는 값만 슬라이스 구독(O1) — 타이머(elapsedSeconds)·답안(answers) 변경에 리렌더되지 않는다.
  // 이벤트 핸들러에서만 필요한 graded/answers는 호출 시점에 getState()로 읽는다.
  const {
    mode, setId, activeProduct, drawerOpen,
    setMode, setSetId, beginSession, clearAnswers,
    setStatsOpen, setSettingsOpen, setWrongNoteOpen, setResultOpen, setDrawerOpen,
    setQuitExamOpen, redrawRandom, setRandomDraw,
    setPendingSetChange, commitSetChange, setPendingRedraw,
    quickSize, startQuick,
  } = useQuizStore(useShallow((s) => ({
    mode: s.mode, setId: s.setId, activeProduct: s.activeProduct, drawerOpen: s.drawerOpen,
    setMode: s.setMode, setSetId: s.setSetId, beginSession: s.beginSession,
    clearAnswers: s.clearAnswers,
    setStatsOpen: s.setStatsOpen, setSettingsOpen: s.setSettingsOpen,
    setWrongNoteOpen: s.setWrongNoteOpen, setResultOpen: s.setResultOpen,
    setDrawerOpen: s.setDrawerOpen,
    setQuitExamOpen: s.setQuitExamOpen,
    redrawRandom: s.redrawRandom, setRandomDraw: s.setRandomDraw,
    setPendingSetChange: s.setPendingSetChange, commitSetChange: s.commitSetChange,
    setPendingRedraw: s.setPendingRedraw,
    quickSize: s.quickSize, startQuick: s.startQuick,
  })));
  const asideRef = React.useRef<HTMLElement>(null);
  // 문항 수는 '시작'을 누를 때까지 로컬 상태로 둔다 — 고르는 즉시 스토어에 쓰면
  // 진행 중인 세션과 무관한 값 변경이 영속화 구독을 계속 깨운다.
  const [quickSizeLocal, setQuickSizeLocal] = React.useState<number>(quickSize);
  // 스토어 값이 밖에서 바뀌면(퀵 시작으로 확정, 새로고침 복원) 화면도 따라간다.
  React.useEffect(() => { setQuickSizeLocal(quickSize); }, [quickSize]);
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
    const newSetId = e.target.value;
    // 랜덤은 세트별로 추첨을 보관하지 않아(F4) 세트를 바꾸면 지금 푸는 문항이 통째로
    // 사라진다. 진행이 있는데 아직 채점 전이면 소리 없이 버리지 않고 한 번 묻는다.
    // (select는 value={setId} 제어 컴포넌트라 여기서 반환하면 표시가 원래 세트로 되돌아간다)
    if (mode === 'random' && hasRandomProgress()) {
      setPendingSetChange(newSetId);
      return;
    }
    commitSetChange(newSetId);
  };

  // 랜덤 진행 중 판정 — 현재 세트에 답한 문항이 있고 아직 채점하지 않은 상태.
  // 채점 후에는 결과를 이미 봤으므로 세트 변경을 막을 이유가 없다.
  const hasRandomProgress = () => {
    const s = useQuizStore.getState();
    if (s.graded[`${setId}-random`]) return false;
    return Object.keys(s.answers).some((k) => k.startsWith(`${setId}-random-`));
  };

  const handleModeChange = (newMode: typeof mode) => {
    if (newMode === mode) {
      // 같은 모드 재클릭: 응시 중(잠금)에는 무시해 setIndex/타이머 초기화로 잠금이
      // 무력화되지 않게 한다. 단, "채점 완료" 상태의 시험/랜덤 재클릭은 원클릭
      // 재응시(초기화)로 동작한다 — 모드 왕복 없이 다시 풀 수 있는 진입로(A5).
      const gradedNow = useQuizStore.getState().graded[`${setId}-${mode}`];
      if ((mode === 'exam' || mode === 'random') && gradedNow) {
        // exam이면 examStarted도 해제돼 시작 게이트가 다시 뜬다.
        // 랜덤은 같은 추첨을 다시 푼다 — 새 추첨은 '새 문제 뽑기' 버튼(명시 액션)으로.
        clearAnswers(setId, mode);
        beginSession();
      }
      closeDrawer();
      return;
    }
    // 랜덤 모드 진입은 새 추첨으로 시작한다(이어풀기 없음, F4) — 저장된 추첨을 비워
    // useQuestions가 새로 뽑게 한다. (새로고침 복원은 이 경로를 타지 않아 진행이 유지된다.)
    if (newMode === 'random') {
      clearAnswers(setId, 'random');
      setRandomDraw(null);
    } else if (newMode === 'exam' && useQuizStore.getState().graded[`${setId}-exam`]) {
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
      showToast('시험 응시 중에는 퀵 랜덤을 시작할 수 없습니다. 먼저 채점하세요.', 'info');
      return;
    }
    startQuick(quickSizeLocal);
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
    // 퀵은 setId가 센티넬(QUICK)이라 아래 조회가 항상 '오답 없음'이 된다 — 퀵 오답은
    // 문항의 출처 세트별 버킷에 담기기 때문이다. 그대로 두면 방금 10문항을 틀린 사용자가
    // "현재 문제 세트에는 오답이 없습니다"라는 사실과 다른 안내를 받는다.
    // 오답이 가장 많은 출처 세트로 옮겨 거기서부터 푼다(동수면 setId 순 — 결정적).
    if (setId === QUICK_SET_ID) {
      const target = Object.entries(reviewIds)
        .filter(([key, ids]) => key.endsWith('-quick') && ids.length > 0)
        .map(([key, ids]) => ({ sid: key.slice(0, -'-quick'.length), count: ids.length }))
        // 다른 제품의 세트가 섞이지 않게 현재 제품의 세트만 후보로 둔다.
        .filter(({ sid }) => sets.some((s) => s.id === sid))
        .sort((a, b) => b.count - a.count || a.sid.localeCompare(b.sid))[0];
      if (!target) {
        showToast('퀵에서 틀린 문항이 없습니다.', 'info');
        return;
      }
      const title = sets.find((s) => s.id === target.sid)?.title ?? target.sid;
      setSetId(target.sid);
      clearAnswers(target.sid, 'review');
      setMode('review');
      beginSession();
      closeDrawer();
      // 퀵은 여러 세트에서 뽑으므로 한 번에 다 풀 수 없다 — 어디로 갔는지, 나머지는
      // 어디서 보는지 알려 주지 않으면 오답이 사라진 것처럼 보인다.
      showToast(`${title}의 오답부터 풉니다. 다른 세트 오답은 오답 노트에서 볼 수 있어요.`, 'info');
      return;
    }
    // 현재 세트에 오답이 없으면 빈 오답 모드로 이동하지 않고 안내만 한다(모드 유지).
    // 오답 대상은 useQuestions의 review 모드와 동일한 합집합 기준으로 판정한다.
    // useQuestions의 review 합집합과 같은 키 목록이어야 한다 — 여기서 -quick이 빠지면
    // 퀵 오답만 있는 세트에서 "오답이 없습니다"라고 막아 놓고, 정작 오답노트에는 문항이 있다.
    const hasWrong = [`${setId}-exam`, `${setId}-random`, `${setId}-quick`, setId].some(
      (key) => (reviewIds[key] || []).length > 0,
    );
    if (!hasWrong) {
      showToast('현재 문제 세트에는 오답이 없습니다. 시험·랜덤·퀵 모드에서 채점하면 기록됩니다.', 'info');
      return;
    }
    // 오답 다시 풀기: 이전 재풀이 답안을 비우고 오답(review) 모드로 전환해 틀린 문항만 새로 푼다.
    clearAnswers(setId, 'review');
    setMode('review');
    beginSession();
    closeDrawer();
  };

  const productSubtitle = activeProduct === 'istqb' ? 'ISTQB FL v4.0' : 'CSTS';
  const productBadge = (activeProduct || '').toUpperCase();
  const showGradeSection = isGradedMode(mode);
  // 퀵을 푸는 중(채점 전) — 시작 버튼을 감출지 판단한다.
  const quickUnderway = mode === 'quick' && !isGraded;

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
            <span className="product-badge">{productBadge}</span>
            {productSubtitle}
          </p>
          <h1 id="productTitle">{currentSet?.title || '문제 풀이'}</h1>
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
            {mode === 'random' && (
              // 새 추첨은 명시 액션으로 노출 — "같은 추첨 재사용" 규칙(재클릭·다시 풀기)이
              // UI에 드러나지 않아 새 조합을 받을 방법을 학습할 수 없던 문제 해소.
              <button
                type="button"
                className="subtle"
                data-testid="random-redraw"
                onClick={() => {
                  // 세트 변경과 같은 손실(현재 추첨·답안 폐기)이므로 같은 규칙으로 묻는다.
                  // 진행이 없으면 잃을 게 없어 바로 진행한다.
                  if (hasRandomProgress()) { setPendingRedraw(true); return; }
                  clearAnswers(setId, 'random');
                  redrawRandom();
                  beginSession();
                  closeDrawer();
                }}
              >
                🔀 새 문제 뽑기
              </button>
            )}
          </div>
          <p className="action-hint" aria-live="polite">
            {isGraded ? <span data-testid="score">점수 {correctCount} / {total}</span> : '답안 선택 후 채점하세요.'}
          </p>
        </section>
      )}

      <div className="sidebar-controls" data-exam-locked={examLocked ? 'true' : undefined}>
        <section className="panel">
          <label htmlFor="examSelect">문제 세트</label>
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

        <section className="panel">
          <label>풀이 모드</label>
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

        {/* 퀵 랜덤 — 세트를 고르지 않고 제품 전체에서 짧게 푼다. 세그먼트(세트 안의 풀이 모드)와
            성격이 달라 별도 섹션에 둔다: 세그먼트에 넣으면 위 세트 선택과 무관한데도
            "선택한 세트를 퀵으로 푼다"로 읽힌다.
            위치: 세트 선택과 풀이 모드는 둘 다 "고른 세트를 어떻게 풀 것인가"라 붙어 있어야
            읽히는데, 그 사이에 끼어 있으면 두 컨트롤을 갈라놓는다. 성격이 다른 별도 진입로이므로
            세트 계열 컨트롤 뒤로 뺀다. */}
        <section className="panel quick-panel">
          <label htmlFor="quickSize">⚡ 퀵 랜덤</label>
          <div className="quick-row">
            <select
              id="quickSize"
              // 표시 값은 로컬 상태를 따라야 한다. 스토어 값에 묶어 두면 onChange가
              // 로컬만 바꾸므로 다시 그릴 때 원래 값으로 튕겨, 사용자에게는
              // "골라도 안 바뀐다"로 보인다(실제로 그 상태였다).
              value={quickSizeLocal}
              onChange={(e) => setQuickSizeLocal(Number(e.target.value))}
              disabled={examLocked}
              aria-label="퀵 랜덤 문항 수"
            >
              {QUICK_SIZES.map((n) => (
                <option key={n} value={n}>{n}문항</option>
              ))}
            </select>
            {/* 퀵을 푸는 중에는 시작 버튼을 감춘다 — 남겨 두면 그 자리에서 누르는 순간
                진행 중이던 답안이 경고 없이 버려지고 새 추첨으로 갈아탄다.
                채점을 마치면 다시 나타나 다음 회차로 갈 수 있다.
                예외: 진행 중에 문항 수를 바꾼 경우에는 다시 띄운다. 감춘 채로 두면 값을
                골라도 아무 일이 없어 "골라도 안 바뀐다"가 된다 — 바꾼 의도는 새로 시작하려는
                것이므로 그 길을 열어 주되, 라벨로 결과(새 추첨)를 밝힌다. */}
            {(!quickUnderway || quickSizeLocal !== quickSize) && (
              <button
                type="button"
                className="quick-start-btn"
                data-testid="quick-start-btn"
                disabled={examLocked}
                onClick={handleStartQuick}
              >
                {quickUnderway ? '새로 시작' : '시작'}
              </button>
            )}
          </div>
          <p className="action-hint">
            {quickUnderway
              ? (quickSizeLocal !== quickSize
                  ? `퀵 진행 중 — '새로 시작'을 누르면 ${quickSizeLocal}문항으로 다시 뽑습니다(현재 답안은 사라집니다).`
                  : '퀵 진행 중 — 채점하면 다시 시작할 수 있습니다.')
              : `${certLabel} 전 세트에서 뽑습니다(서답형 포함, 최대 30%). 제한시간 없음 · 회차 기록을 남기지 않습니다.`}
          </p>
        </section>

        <section className="stats">
          <div>
            <span>진행</span>
            {/* 라이브 영역을 진행률에만 둔다 — 타이머를 포함하면 스크린리더가 매초 시간을 낭독한다. */}
            <strong id="progressText" aria-live="polite">{answered} / {total}</strong>
          </div>
          <div>
            {/* 시험 응시 중에는 카운트다운이므로 '남은 시간' — 채점 후에는 경과(소요) 시간으로
                돌아가므로 라벨도 함께 되돌린다(TimerClock의 표시 규칙과 일치). */}
            <span>{mode === 'exam' && !isGraded ? '남은 시간' : '시간'}</span>
            <strong id="timerText"><TimerClock /></strong>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div id="progressFill" className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </section>

        <section className="action-section">
          <h3>오답 관리</h3>
          <div className="actions">
            <button type="button" onClick={handleRetryWrong}>오답 다시 풀기</button>
            <button type="button" className="subtle" onClick={() => { setWrongNoteOpen(true); closeDrawer(); }}>
              오답 노트
            </button>
          </div>
        </section>

        <section className="settings-section">
          <button
            type="button"
            className="settings-open-btn"
            aria-haspopup="dialog"
            data-testid="stats-open"
            onClick={() => { setStatsOpen(true); closeDrawer(); }}
          >
            📊 학습 통계
          </button>
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
            data-testid="feedback-link"
            onClick={closeDrawer}
          >
            📝 이슈·보완점 제보
          </a>
        </section>
      </div>
    </aside>
  );
};
