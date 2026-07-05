import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore, ExamHistory } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { useTheme, ThemePref } from '../../hooks/useTheme';
import { exportUserData, importUserData, clearHistoriesFromDB } from '../../utils/storage';
import { safeGetItem, safeSetItem } from '../../utils/safeStorage';
import { showToast } from '../../utils/toast';
import { isDebugEnabled, setDebugEnabled } from '../../utils/debugLog';
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

const MODE_LABEL: Record<string, string> = {
  practice: '연습',
  exam: '시험',
  random: '랜덤',
  review: '오답',
};

// 앱 루트에 렌더되는 모든 오버레이(설정·통계·오답노트·결과·문항이동).
// 드로어(transform)의 자식이 아니어서 position:fixed 오버레이가 정상 동작한다.
export const AppModals = () => {
  // 슬라이스 구독(O1). elapsedSeconds는 결과 모달이 열려 있을 때만 반영해
  // 닫혀 있는 동안 타이머 틱으로 리렌더되지 않게 한다(열려 있으면 기존처럼 초 단위 갱신).
  const {
    setId, mode, activeProduct, histories, resultElapsedSeconds,
    settingsOpen, statsOpen, wrongNoteOpen, resultOpen, paletteOpen, confirmGradeOpen, pendingMode, resumePrompt,
    setSettingsOpen, setStatsOpen, setWrongNoteOpen, setResultOpen, setPaletteOpen, setDrawerOpen, setConfirmGradeOpen,
    setMode, setIndex, resetTimer, clearAnswers, clearHistory, clearHistories, setPendingMode, setResumePrompt,
  } = useQuizStore(useShallow((s) => ({
    setId: s.setId, mode: s.mode, activeProduct: s.activeProduct, histories: s.histories,
    resultElapsedSeconds: s.resultOpen ? s.elapsedSeconds : 0,
    settingsOpen: s.settingsOpen, statsOpen: s.statsOpen, wrongNoteOpen: s.wrongNoteOpen,
    resultOpen: s.resultOpen, paletteOpen: s.paletteOpen, confirmGradeOpen: s.confirmGradeOpen,
    pendingMode: s.pendingMode, resumePrompt: s.resumePrompt,
    setSettingsOpen: s.setSettingsOpen, setStatsOpen: s.setStatsOpen, setWrongNoteOpen: s.setWrongNoteOpen,
    setResultOpen: s.setResultOpen, setPaletteOpen: s.setPaletteOpen, setDrawerOpen: s.setDrawerOpen,
    setConfirmGradeOpen: s.setConfirmGradeOpen, setMode: s.setMode, setIndex: s.setIndex,
    resetTimer: s.resetTimer, clearAnswers: s.clearAnswers, clearHistory: s.clearHistory,
    clearHistories: s.clearHistories, setPendingMode: s.setPendingMode, setResumePrompt: s.setResumePrompt,
  })));
  const { appData, total, answered, correctCount, gradeAndShow } = useQuizSession();
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (safeGetItem('istqb-q-font') as FontSize) || 'normal',
  );
  const [debugOn, setDebugOn] = useState(() => isDebugEnabled());
  // 오답 노트 팝업에서 선택한 세트(null이면 세트 목록 화면).
  const [wrongNoteSetId, setWrongNoteSetId] = useState<string | null>(null);

  useEffect(() => {
    document.body.dataset.qfont = fontSize;
    safeSetItem('istqb-q-font', fontSize);
  }, [fontSize]);

  const sets = appData
    ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct)
    : [];
  const currentSet = sets.find((s) => s.id === setId);

  // 오답 노트(읽기 전용): 1단계 세트 선택 → 2단계 그 세트의 오답 목록(#3·#4).
  // 세트별로 최신 채점 회차(오답이 있는 것)만 추려 보여준다.
  const productSetIds = new Set(sets.map((s) => s.id));
  const fmtAns = (arr: string[]) =>
    arr.length ? arr.map((s) => s.toUpperCase()).join(', ') : '미응답';
  const wrongNoteBySet: ExamHistory[] = (() => {
    const latest = new Map<string, ExamHistory>();
    for (const h of Object.values(histories)) {
      if (!productSetIds.has(h.setId) || (h.wrongItems?.length ?? 0) === 0) continue;
      const prev = latest.get(h.setId);
      if (!prev || (h.createdAt ?? 0) > (prev.createdAt ?? 0)) latest.set(h.setId, h);
    }
    return Array.from(latest.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  })();
  const selectedWrong = wrongNoteSetId
    ? wrongNoteBySet.find((h) => h.setId === wrongNoteSetId) ?? null
    : null;

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

  // 시험 모드 전환 확인: '이동'이면 목표 모드로 전환, '뒤로가기'면 취소(시험 유지).
  const confirmModeChange = () => {
    if (!pendingMode) return;
    const target = pendingMode;
    setPendingMode(null);
    // 직접 클릭 경로(Sidebar.handleModeChange)와 동일하게 초기화한다.
    if (target === 'random') {
      // 랜덤은 이어풀기 없음 — 진입 시 항상 초기화(F4).
      clearAnswers(setId, 'random');
    } else if (target === 'exam' && useQuizStore.getState().graded[`${setId}-exam`]) {
      // 이미 채점한 시험으로 이동하면 새로 풀 수 있게 초기화(#1).
      clearAnswers(setId, 'exam');
    }
    setMode(target);
    setIndex(0);
    resetTimer();
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
      {resumePrompt && (
        <Modal title="이어풀기" onClose={() => setResumePrompt(false)}>
          <div className="modal-body confirm-body" data-testid="resume-prompt-modal">
            <p>
              이전에 풀던 <strong>{MODE_LABEL[mode] ?? mode}</strong> 기록이 남아 있습니다.
              이어서 풀까요, 아니면 처음부터 새로 풀까요?
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                data-testid="resume-fresh"
                onClick={() => {
                  clearAnswers(setId, mode);
                  setIndex(0);
                  resetTimer();
                  setResumePrompt(false);
                }}
              >
                새로 풀기
              </button>
              <button
                type="button"
                className="primary"
                data-testid="resume-keep"
                onClick={() => setResumePrompt(false)}
              >
                이어풀기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {paletteOpen && (
        <Modal title="문항 이동" onClose={() => setPaletteOpen(false)}>
          <div className="modal-body" data-testid="palette-jump">
            <QuestionPalette onJump={() => setPaletteOpen(false)} />
          </div>
        </Modal>
      )}

      {wrongNoteOpen && (
        <Modal title="오답 노트" onClose={() => { setWrongNoteOpen(false); setWrongNoteSetId(null); }}>
          <div className="modal-body" data-testid="wrong-note">
            {wrongNoteBySet.length === 0 ? (
              <p>표시할 오답이 없습니다. (시험·랜덤 모드에서 채점하면 기록됩니다)</p>
            ) : !selectedWrong ? (
              // 1단계: 오답이 있는 세트 선택
              <ul className="wrong-note-sets" data-testid="wrong-note-sets">
                {wrongNoteBySet.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="wrong-note-set-btn"
                      data-testid="wrong-note-set-btn"
                      onClick={() => setWrongNoteSetId(h.setId)}
                    >
                      <span className="wns-title">{h.setTitle || h.setId}</span>
                      <span className="wns-meta">
                        {MODE_LABEL[h.mode] || h.mode} · 오답 {h.wrongItems?.length ?? 0}
                        {h.total != null ? ` / ${h.total}` : ''}
                        {h.createdAt ? ` · ${new Date(h.createdAt).toLocaleDateString('ko-KR')}` : ''}
                      </span>
                      <span className="wns-arrow" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              // 2단계: 선택한 세트의 오답 목록
              <div data-testid="wrong-note-detail">
                <button
                  type="button"
                  className="wrong-note-back"
                  data-testid="wrong-note-back"
                  onClick={() => setWrongNoteSetId(null)}
                >
                  ← 세트 목록
                </button>
                <h4 className="wrong-note-set">
                  {selectedWrong.setTitle || selectedWrong.setId}
                  <small>
                    {MODE_LABEL[selectedWrong.mode] || selectedWrong.mode} · 오답 {selectedWrong.wrongItems?.length ?? 0}
                    {selectedWrong.total != null ? ` / ${selectedWrong.total}` : ''}
                  </small>
                </h4>
                <ul className="wrong-note-list">
                  {(selectedWrong.wrongItems ?? []).map((it, idx) => (
                    <li className="wrong-note-item" key={`${it.number}-${idx}`}>
                      <span className="wn-num">문제 {it.number}</span>
                      <span className="wn-mine">내 답 {fmtAns(it.myAnswer)}</span>
                      <span className="wn-correct">정답 {fmtAns(it.correctAnswer)}</span>
                    </li>
                  ))}
                </ul>
              </div>
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

            <section className="settings-group">
              <h4>개발자</h4>
              <label className="settings-toggle">
                <span>화면 콘솔 표시</span>
                <input
                  type="checkbox"
                  data-testid="debug-toggle"
                  checked={debugOn}
                  onChange={(e) => { setDebugEnabled(e.target.checked); setDebugOn(e.target.checked); }}
                />
              </label>
              <p className="settings-hint">콘솔 로그·오류를 화면 우하단 버튼에서 확인합니다. (주소에 <code>?debug</code>로도 켤 수 있음)</p>
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
        <Modal title="제출 전 검토" onClose={() => setConfirmGradeOpen(false)}>
          <div className="modal-body confirm-body" data-testid="confirm-grade-modal">
            <p>
              아직 답하지 않은 문항이 <strong>{unanswered}개</strong> 있습니다.
              그대로 채점할까요? (미응답은 오답 처리됩니다)
            </p>
            <p className="review-hint">아래에서 미응답(빈 칸) 문항을 눌러 이동해 마저 풀 수 있습니다.</p>
            <div className="review-palette" data-testid="review-palette">
              <QuestionPalette onJump={() => setConfirmGradeOpen(false)} />
            </div>
            <div className="confirm-actions">
              <button type="button" onClick={() => setConfirmGradeOpen(false)}>계속 풀기</button>
              <button type="button" className="primary" data-testid="confirm-grade" onClick={confirmGrade}>
                채점하기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {pendingMode && (
        <Modal title="시험 진행 중" onClose={() => setPendingMode(null)}>
          <div className="modal-body confirm-body" data-testid="mode-change-modal">
            <p>
              시험 모드를 진행 중입니다. <strong>{MODE_LABEL[pendingMode] ?? pendingMode}</strong> 모드로 이동하면
              현재 시험 진행 상태(타이머)가 초기화됩니다. 이동할까요?
            </p>
            <div className="confirm-actions">
              <button type="button" data-testid="mode-change-back" onClick={() => setPendingMode(null)}>
                뒤로가기
              </button>
              <button type="button" className="primary" data-testid="mode-change-go" onClick={confirmModeChange}>
                이동
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
          elapsedSeconds={resultElapsedSeconds}
          onClose={() => setResultOpen(false)}
          onOpenWrongNote={() => { setResultOpen(false); setWrongNoteOpen(true); }}
        />
      )}
    </>
  );
};
