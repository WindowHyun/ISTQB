import React, { useEffect, useState } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { useTheme, ThemePref } from '../../hooks/useTheme';
import { exportUserData, importUserData, clearHistoriesFromDB } from '../../utils/storage';
import { showToast } from '../../utils/toast';
import { Modal } from '../common/Modal';
import { StatsDashboard } from '../stats/StatsDashboard';
import { ResultSummary } from '../quiz/ResultSummary';
import { QuestionPalette } from '../quiz/QuestionPalette';

const FONT_SIZES: { value: 'small' | 'normal' | 'large'; label: string }[] = [
  { value: 'small', label: '작게' },
  { value: 'normal', label: '기본' },
  { value: 'large', label: '크게' },
];

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

type FontSize = 'small' | 'normal' | 'large';

// 앱 루트에 렌더되는 모든 오버레이(설정·통계·오답노트·결과·문항이동).
// 드로어(transform)의 자식이 아니어서 position:fixed 오버레이가 정상 동작한다.
export const AppModals = () => {
  const {
    setId, mode, activeProduct, elapsedSeconds, histories,
    settingsOpen, statsOpen, wrongNoteOpen, resultOpen, paletteOpen, confirmGradeOpen,
    setSettingsOpen, setStatsOpen, setWrongNoteOpen, setResultOpen, setPaletteOpen, setDrawerOpen, setConfirmGradeOpen,
    setMode, setIndex, clearAnswers, clearHistory, clearHistories,
  } = useQuizStore();
  const { appData, total, answered, correctCount, wrongQuestions, gradeAndShow } = useQuizSession();
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (localStorage.getItem('istqb-q-font') as FontSize) || 'normal',
  );

  useEffect(() => {
    document.body.dataset.qfont = fontSize;
    localStorage.setItem('istqb-q-font', fontSize);
  }, [fontSize]);

  const sets = appData
    ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct)
    : [];
  const currentSet = sets.find((s) => s.id === setId);

  const handleHome = () => {
    setSettingsOpen(false);
    setDrawerOpen(false);
    setMode('home');
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const success = await importUserData(e.target.files[0]);
    showToast(
      success ? '백업 파일을 복원했습니다.' : '파일 복원에 실패했습니다.',
      success ? 'success' : 'error',
    );
  };

  const unanswered = total - answered;
  const confirmGrade = () => {
    setConfirmGradeOpen(false);
    gradeAndShow();
  };

  const handleClearHistories = () => {
    clearHistories();
    clearHistoriesFromDB();
  };

  const handleResetMode = () => {
    if (confirm('현재 모드의 모든 답안을 지우시겠습니까?')) {
      clearAnswers(setId, mode);
      clearHistory(setId, mode);
    }
  };

  return (
    <>
      {paletteOpen && (
        <Modal title="문항 이동" onClose={() => setPaletteOpen(false)}>
          <div className="modal-body" data-testid="palette-jump">
            <QuestionPalette onJump={() => setPaletteOpen(false)} />
          </div>
        </Modal>
      )}

      {wrongNoteOpen && (
        <Modal title="오답 노트" onClose={() => setWrongNoteOpen(false)}>
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
        </Modal>
      )}

      {settingsOpen && (
        <Modal title="설정" onClose={() => setSettingsOpen(false)}>
          <div className="modal-body settings-body">
            <section className="settings-group">
              <h4>테마</h4>
              <div className="segmented" role="group" aria-label="테마">
                {THEMES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={themePref === value ? 'active' : ''}
                    aria-pressed={themePref === value}
                    data-theme-option={value}
                    onClick={() => setThemePref(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

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
        </Modal>
      )}

      {statsOpen && (
        <StatsDashboard
          histories={histories}
          sets={sets}
          onClose={() => setStatsOpen(false)}
          onClear={handleClearHistories}
        />
      )}

      {confirmGradeOpen && (
        <Modal title="채점 확인" onClose={() => setConfirmGradeOpen(false)}>
          <div className="modal-body confirm-body" data-testid="confirm-grade-modal">
            <p>
              아직 답하지 않은 문항이 <strong>{unanswered}개</strong> 있습니다.
              그대로 채점할까요? (미응답은 오답 처리됩니다)
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setConfirmGradeOpen(false)}>계속 풀기</button>
              <button type="button" className="primary" data-testid="confirm-grade" onClick={confirmGrade}>
                채점하기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {resultOpen && (
        <ResultSummary
          setTitle={currentSet?.title || ''}
          certification={activeProduct}
          correct={correctCount}
          total={total}
          elapsedSeconds={elapsedSeconds}
          onClose={() => setResultOpen(false)}
          onOpenWrongNote={() => { setResultOpen(false); setWrongNoteOpen(true); }}
        />
      )}
    </>
  );
};
