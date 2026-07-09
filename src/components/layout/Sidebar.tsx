import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { useSetCounts } from '../../hooks/useSetCounts';
import { TimerClock } from '../common/TimerClock';
import { showToast } from '../../utils/toast';

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
    mode, setId, activeProduct, examStarted,
    setMode, setSetId, setIndex, resetTimer, clearAnswers,
    setStatsOpen, setSettingsOpen, setWrongNoteOpen, setResultOpen, setDrawerOpen,
    setResumePrompt,
  } = useQuizStore(useShallow((s) => ({
    mode: s.mode, setId: s.setId, activeProduct: s.activeProduct,
    examStarted: s.examStarted[s.setId],
    setMode: s.setMode, setSetId: s.setSetId, setIndex: s.setIndex,
    resetTimer: s.resetTimer, clearAnswers: s.clearAnswers,
    setStatsOpen: s.setStatsOpen, setSettingsOpen: s.setSettingsOpen,
    setWrongNoteOpen: s.setWrongNoteOpen, setResultOpen: s.setResultOpen,
    setDrawerOpen: s.setDrawerOpen,
    setResumePrompt: s.setResumePrompt,
  })));
  const {
    appData, total, answered, correctCount, isGraded, canGrade, progressPercent,
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
    setIndex(0);
    resetTimer();
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
    // 응시 중(시험 시작 후 미채점)에는 모드 버튼 자체가 disabled라 이 경로로 오지 않는다(잠금).
    // 랜덤은 진입마다 재추첨되어 이어풀기가 무의미하므로 들어올 때마다 초기화한다(랜덤은 이어풀기 없음, F4).
    if (newMode === 'random') {
      clearAnswers(setId, 'random');
    } else if (newMode === 'exam' && useQuizStore.getState().graded[`${setId}-exam`]) {
      // 이미 채점한 시험으로 다시 들어오면 새로 풀 수 있게 초기화한다(#1).
      clearAnswers(setId, 'exam');
    }
    setMode(newMode);
    setIndex(0);
    resetTimer();
    closeDrawer();
  };

  const handleRetryWrong = () => {
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
    setIndex(0);
    resetTimer();
    closeDrawer();
  };

  const productSubtitle = activeProduct === 'istqb' ? 'ISTQB FL v4.0' : 'CSTS';
  const productBadge = (activeProduct || '').toUpperCase();
  const showGradeSection = mode === 'exam' || mode === 'random';
  // 응시 중(시험 시작 후 채점 전) 잠금 — 세트·모드 변경을 막아 채점 기준이 흔들리지 않게 한다.
  const examLocked = mode === 'exam' && !!examStarted && !isGraded;

  return (
    <aside className="sidebar" aria-label="시험 설정">
      <div className="brand">
        <img src={LOGO_SRC} alt="" />
        <div className="brand-text">
          <p id="productSubtitle">
            <span className="product-badge">{productBadge}</span>
            {productSubtitle}
          </p>
          <h1 id="productTitle">{currentSet?.title || '문제 풀이'}</h1>
        </div>
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
            <p className="exam-lock-hint" data-testid="exam-lock-hint">🔒 시험 응시 중 — 채점 후 세트·모드를 변경할 수 있습니다.</p>
          )}
        </section>

        <section className="stats" aria-live="polite">
          <div>
            <span>진행</span>
            <strong id="progressText">{answered} / {total}</strong>
          </div>
          <div>
            <span>시간</span>
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
        </section>
      </div>
    </aside>
  );
};
