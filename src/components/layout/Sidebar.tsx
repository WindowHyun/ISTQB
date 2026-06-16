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

const FONT_SIZES: { value: 'small' | 'normal' | 'large'; label: string }[] = [
  { value: 'small', label: '작게' },
  { value: 'normal', label: '기본' },
  { value: 'large', label: '크게' },
];

type FontSize = 'small' | 'normal' | 'large';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (localStorage.getItem('istqb-q-font') as FontSize) || 'normal',
  );

  // 글자 크기: body에 data 속성으로 반영(전역 CSS가 문제/선택지 폰트 스케일을 적용).
  useEffect(() => {
    document.body.dataset.qfont = fontSize;
    localStorage.setItem('istqb-q-font', fontSize);
  }, [fontSize]);

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
    // 오답 다시 풀기: 이전 재풀이 답안을 비우고 오답(review) 모드로 전환해
    // 틀린 문항만 새로 푼다. (review는 자체 네임스페이스 + 즉시 피드백)
    clearAnswers(setId, 'review');
    setMode('review');
    setIndex(0);
    resetTimer();
  };

  // 처음 화면(제품 선택)으로 이동 — ISTQB/CSTS 전환 진입점.
  const handleHome = () => {
    setSettingsOpen(false);
    setMode('home');
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const success = await importUserData(e.target.files[0]);
    alert(success ? '백업 파일이 성공적으로 복원되었습니다.' : '파일 복원에 실패했습니다.');
  };

  const handleResetMode = () => {
    if (confirm('현재 모드의 모든 답안을 지우시겠습니까?')) {
      clearAnswers(setId, mode);
      clearHistory(setId, mode);
    }
  };

  const productSubtitle = activeProduct === 'istqb' ? 'ISTQB FL v4.0' : 'CSTS';
  const productBadge = (activeProduct || '').toUpperCase();
  const showGradeSection = mode === 'exam' || mode === 'random';

  return (
    <>
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

          <section className="settings-section">
            <button
              type="button"
              className="settings-open-btn"
              aria-haspopup="dialog"
              onClick={() => setSettingsOpen(true)}
            >
              ⚙ 설정
            </button>
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

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="설정"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h3>설정</h3>
              <button type="button" onClick={() => setSettingsOpen(false)}>닫기</button>
            </header>
            <div className="modal-body settings-body">
              <section className="settings-group">
                <h4>앱 이동</h4>
                <button type="button" className="settings-action" onClick={handleHome}>
                  처음 화면으로 (ISTQB/CSTS 선택)
                </button>
              </section>

              <section className="settings-group">
                <h4>글자 크기</h4>
                <div className="segmented" role="group" aria-label="문제 글자 크기">
                  {FONT_SIZES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={fontSize === value ? 'active' : ''}
                      aria-pressed={fontSize === value}
                      onClick={() => setFontSize(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="settings-group">
                <h4>기록 관리</h4>
                <div className="settings-actions">
                  <button type="button" className="settings-action" onClick={exportUserData}>
                    기록 내보내기
                  </button>
                  <label className="settings-action file-import">
                    <span>기록 가져오기</span>
                    <input type="file" accept=".json" aria-label="백업 파일 가져오기" onChange={handleFileImport} />
                  </label>
                </div>
              </section>

              <section className="settings-group">
                <h4>초기화</h4>
                <button type="button" className="settings-action danger" onClick={handleResetMode}>
                  현재 모드 답안 초기화
                </button>
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
