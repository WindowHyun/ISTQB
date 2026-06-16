import React, { useEffect, useState } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { exportUserData, importUserData } from '../../utils/storage';
import { formatClock } from '../../utils/time';

const LOGO_SRC =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2064%2064%22%20role%3D%22img%22%20aria-label%3D%22Quiz%20mark%22%3E%0A%20%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23166064%22/%3E%0A%20%20%3Cpath%20d%3D%22M18%2018h28v28H18z%22%20fill%3D%22%23f5f7f2%22/%3E%0A%20%20%3Cpath%20d%3D%22M24%2030l5%205%2011-13%22%20fill%3D%22none%22%20stroke%3D%22%23b55c3c%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%0A%20%20%3Cpath%20d%3D%22M22%2047h25%22%20stroke%3D%22%23f5f7f2%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%0A%3C/svg%3E%0A';

const MODE_LABELS: { mode: 'practice' | 'exam' | 'random' | 'review'; label: string }[] = [
  { mode: 'practice', label: '연습' },
  { mode: 'exam', label: '시험' },
  { mode: 'random', label: '랜덤' },
  { mode: 'review', label: '오답' },
];

export const Sidebar = () => {
  const {
    mode, setId, activeProduct, elapsedSeconds,
    setMode, setSetId, setIndex, resetTimer, clearAnswers, clearHistory,
  } = useQuizStore();
  const {
    appData, total, answered, correctCount, isGraded, canGrade, progressPercent, wrongQuestions,
    handleGrade,
  } = useQuizSession();
  const [wrongNoteOpen, setWrongNoteOpen] = useState(false);

  // 현재 선택된 제품(ISTQB/CSTS)에 속한 세트만 노출.
  const sets = appData
    ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct)
    : [];
  const currentSet = sets.find((s) => s.id === setId);

  // 제품 선택 후 세트가 미선택(또는 다른 제품 세트)이면 첫 세트를 자동 선택해 문항을 로드.
  useEffect(() => {
    if (sets.length && !sets.some((s) => s.id === setId)) {
      setSetId(sets[0].id);
    }
  }, [appData, activeProduct, setId, setSetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSetId(e.target.value);
    setMode('practice');
    setIndex(0);
    resetTimer();
  };

  const handleModeChange = (newMode: typeof mode) => {
    setMode(newMode);
    setIndex(0);
    resetTimer();
  };

  const handleRetryWrong = () => {
    // 오답 다시 풀기: 오답(review) 모드로 전환해 틀린 문항만 다시 본다.
    setMode('review');
    setIndex(0);
    resetTimer();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const success = await importUserData(e.target.files[0]);
    alert(success ? '백업 파일이 성공적으로 복원되었습니다.' : '파일 복원에 실패했습니다.');
  };

  const productSubtitle = activeProduct === 'istqb' ? 'ISTQB FL v4.0' : 'CSTS';
  const showGradeSection = mode === 'exam' || mode === 'random';

  return (
    <>
      <aside className="sidebar" aria-label="시험 설정">
        <div className="brand">
          <img src={LOGO_SRC} alt="" />
          <div>
            <p id="productSubtitle">{productSubtitle}</p>
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
                  onClick={handleGrade}
                >
                  채점하기
                </button>
              )}
            </div>
            <p className="action-hint" aria-live="polite">
              {isGraded ? <span data-testid="score">점수 {correctCount} / {total}</span> : '답안 선택 후 채점하세요.'}
            </p>
          </section>
        )}

        <div className="sidebar-controls">
          <section className="panel">
            <label htmlFor="examSelect">문제 세트</label>
            <select id="examSelect" value={setId} onChange={handleSetChange}>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>{set.title}</option>
              ))}
            </select>
          </section>

          <section className="panel">
            <label>풀이 모드</label>
            <div className="segmented" role="group" aria-label="풀이 모드">
              {MODE_LABELS.map(({ mode: m, label }) => (
                <button
                  key={m}
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
          </section>

          <section className="stats" aria-live="polite">
            <div>
              <span>진행</span>
              <strong id="progressText">{answered} / {total}</strong>
            </div>
            <div>
              <span>시간</span>
              <strong id="timerText">{formatClock(elapsedSeconds)}</strong>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div id="progressFill" className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </section>

          <section className="action-section">
            <h3>오답 관리</h3>
            <div className="actions">
              <button type="button" onClick={handleRetryWrong}>오답 다시 풀기</button>
              <button type="button" className="subtle" onClick={() => setWrongNoteOpen(true)}>
                오답 노트
              </button>
            </div>
          </section>

          <section className="settings-section panel">
            <label>기록</label>
            <div className="actions">
              <button
                type="button"
                className="danger subtle"
                onClick={() => {
                  if (confirm('이 모드의 모든 답안을 지우시겠습니까?')) {
                    clearAnswers(setId, mode);
                    clearHistory(setId, mode);
                  }
                }}
              >
                선택 답안 초기화
              </button>
              <button type="button" className="subtle" onClick={exportUserData}>기록 내보내기</button>
              <label className="file-import subtle">
                <span>기록 가져오기</span>
                <input type="file" accept=".json" aria-label="백업 파일 가져오기" onChange={handleFileImport} />
              </label>
            </div>
          </section>
        </div>
      </aside>

      {wrongNoteOpen && (
        <div className="modal-backdrop" onClick={() => setWrongNoteOpen(false)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="오답 노트"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h3>오답 노트</h3>
              <button type="button" onClick={() => setWrongNoteOpen(false)}>닫기</button>
            </header>
            <div className="modal-body" data-testid="wrong-note">
              {wrongQuestions.length === 0 ? (
                <p>틀린 문항이 없습니다.</p>
              ) : (
                <ul className="wrong-note-list">
                  {wrongQuestions.map(({ q, i }) => (
                    <li key={q.id || i}>
                      <button
                        type="button"
                        className="wrong-note-jump"
                        onClick={() => { setIndex(i); setWrongNoteOpen(false); }}
                      >
                        문제 {q.number}
                      </button>
                      <span className="wrong-note-ans">정답 {q.answer.map((s) => s.toUpperCase()).join(', ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
};
