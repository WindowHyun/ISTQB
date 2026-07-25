import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { useSetCounts } from '../../hooks/useSetCounts';
import { TimerClock } from '../common/TimerClock';
import { showToast } from '../../utils/toast';
import { FEEDBACK_SHEET_URL } from '../../utils/links';

const LOGO_SRC =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22Quiz%20mark%22%3E%0A%20%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23166064%22/%3E%0A%20%20%3Cpath%20d%3D%22M18%2018h28v28H18z%22%20fill%3D%22%23f5f7f2%22/%3E%0A%20%20%3Cpath%20d%3D%22M24%2030l5%205%2011-13%22%20fill%3D%22none%22%20stroke%3D%22%23b55c3c%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%0A%20%20%3Cpath%20d%3D%22M22%2047h25%22%20stroke%3D%22%23f5f7f2%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%0A%3C/svg%3E%0A';

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
    setResumePrompt, setQuitExamOpen, redrawRandom, setRandomDraw,
  } = useQuizStore(useShallow((s) => ({
    mode: s.mode, setId: s.setId, activeProduct: s.activeProduct, drawerOpen: s.drawerOpen,
    setMode: s.setMode, setSetId: s.setSetId, beginSession: s.beginSession,
    clearAnswers: s.clearAnswers,
    setStatsOpen: s.setStatsOpen, setSettingsOpen: s.setSettingsOpen,
    setWrongNoteOpen: s.setWrongNoteOpen, setResultOpen: s.setResultOpen,
    setDrawerOpen: s.setDrawerOpen,
    setResumePrompt: s.setResumePrompt, setQuitExamOpen: s.setQuitExamOpen,
    redrawRandom: s.redrawRandom, setRandomDraw: s.setRandomDraw,
  })));
  const asideRef = React.useRef<HTMLElement>(null);

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
    requestGrade,
  } = useQuizSession();

  // 현재 선택된 제품(ISTQB/CSTS)에 속한 세트만 노출.
  const sets = appData
    ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct)
    : [];
  const currentSet = sets.find((s) => s.id === setId);
  const setCounts = useSetCounts(sets);

  // 제품 선택 후 세트가 미선택(또는 다른 제품 세트)이면 첫 세트를 자동 선택해 문항을 로드.
  useEffect(() => {
    if (sets.length && !sets.some((s) => s.id === setId)) {
      setSetId(sets[0].id);
    }
  }, [appData, activeProduct, setId, setSetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 모바일 드로어 안에서 컨트롤을 조작하면 드로어를 닫아 문제로 복귀한다.
  const closeDrawer = () => setDrawerOpen(false);

  const handleSetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // 세트를 바꿔도 현재 모드는 유지한다(연습으로 초기화하지 않음, #2).
    const newSetId = e.target.value;
    setSetId(newSetId);
    beginSession();
    closeDrawer();
    if (mode === 'random') {
      // 랜덤은 이어풀기 없음 — 세트를 바꾸면 그 세트의 랜덤 답안을 비우고 새로 시작한다(F4).
      clearAnswers(newSetId, 'random');
    } else if (
      // 바꾼 세트가 시험 모드에 이전 답안을 갖고 있으면 "이어풀기/새로 풀기" 선택 모달을 띄운다.
      mode === 'exam' &&
      Object.keys(useQuizStore.getState().answers).some((k) => k.startsWith(`${newSetId}-exam-`))
    ) {
      setResumePrompt(true);
    }
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

  const handleRetryWrong = () => {
    // 응시 중 잠금 — 이 버튼은 세그먼트 밖이라 disabled에 걸리지 않지만 setMode+resetTimer를
    // 호출하므로, 여기서 막지 않으면 잠금을 우회해 시험 타이머가 소실된다.
    if (examLocked) {
      showToast('시험 응시 중에는 오답 풀기를 시작할 수 없습니다. 먼저 채점하세요.', 'info');
      return;
    }
    // 현재 세트에 오답이 없으면 빈 오답 모드로 이동하지 않고 안내만 한다(모드 유지).
    // 오답 대상은 useQuestions의 review 모드와 동일한 합집합 기준으로 판정한다.
    const { reviewIds } = useQuizStore.getState();
    const hasWrong = [`${setId}-exam`, `${setId}-random`, setId].some(
      (key) => (reviewIds[key] || []).length > 0,
    );
    if (!hasWrong) {
      showToast('현재 문제 세트에는 오답이 없습니다. 시험·랜덤 모드에서 채점하면 기록됩니다.', 'info');
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
  const showGradeSection = mode === 'exam' || mode === 'random';

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
        <img src={LOGO_SRC} alt="" />
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

        <section className="stats">
          <div>
            <span>진행</span>
            {/* 라이브 영역을 진행률에만 둔다 — 타이머를 포함하면 스크린리더가 매초 시간을 낭독한다. */}
            <strong id="progressText" aria-live="polite">{answered} / {total}</strong>
          </div>
          <div>
            {/* 시험 모드는 카운트다운이므로 라벨도 '남은 시간'으로 바꿔 오해를 막는다. */}
            <span>{mode === 'exam' ? '남은 시간' : '시간'}</span>
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
