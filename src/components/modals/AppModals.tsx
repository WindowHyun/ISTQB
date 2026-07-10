import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore, ExamHistory } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { useTheme, ThemePref } from '../../hooks/useTheme';
import { exportUserData, importUserData, removeHistoriesEverywhere } from '../../utils/storage';
import { safeGetItem, safeSetItem } from '../../utils/safeStorage';
import { showToast } from '../../utils/toast';
import { isDebugEnabled, setDebugEnabled } from '../../utils/debugLog';
import { Modal } from '../common/Modal';
import { ConfirmButtons } from '../common/ConfirmButtons';
import { StatsDashboard } from '../stats/StatsDashboard';
import { latestAttemptComparison } from '../../utils/attemptStats';
import { ResultSummary } from '../quiz/ResultSummary';
import { QuestionPalette } from '../quiz/QuestionPalette';
import { Question } from '../../hooks/useQuestions';
import { loadSetQuestions, peekSetQuestions } from '../../utils/questionLoader';
import { RichText } from '../../utils/parser';

// 오답노트 3단계(문항 보기)용 세트 문항 로더 — 본문(useQuestions)과 같은 공용
// 로더(questionLoader)를 사용해 같은 세트를 다시 내려받지 않는다.
// 이미 로드된 세트는 peek로 동기 렌더해 재진입 시 로딩 프레임이 깜빡이지 않는다.
function useWrongNoteQuestions(path: string | null, setId: string | null): Question[] | null {
  const [questions, setQuestions] = useState<Question[] | null>(
    () => (path && peekSetQuestions(path)) || null,
  );
  useEffect(() => {
    if (!setId || !path) { setQuestions(null); return; }
    const cached = peekSetQuestions(path);
    if (cached) { setQuestions(cached); return; }
    let cancelled = false;
    loadSetQuestions(path)
      .then((qs) => { if (!cancelled) setQuestions(qs); })
      .catch(() => { if (!cancelled) setQuestions([]); });
    return () => { cancelled = true; };
  }, [path, setId]);
  return questions;
}

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
    settingsOpen, statsOpen, wrongNoteOpen, resultOpen, paletteOpen, confirmGradeOpen, resumePrompt,
    setSettingsOpen, setStatsOpen, setWrongNoteOpen, setResultOpen, setPaletteOpen, setDrawerOpen, setConfirmGradeOpen,
    setMode, setIndex, resetTimer, clearAnswers, setReviewIds, setChapterFilter, setResumePrompt,
  } = useQuizStore(useShallow((s) => ({
    setId: s.setId, mode: s.mode, activeProduct: s.activeProduct, histories: s.histories,
    resultElapsedSeconds: s.resultOpen ? s.elapsedSeconds : 0,
    settingsOpen: s.settingsOpen, statsOpen: s.statsOpen, wrongNoteOpen: s.wrongNoteOpen,
    resultOpen: s.resultOpen, paletteOpen: s.paletteOpen, confirmGradeOpen: s.confirmGradeOpen,
    resumePrompt: s.resumePrompt,
    setSettingsOpen: s.setSettingsOpen, setStatsOpen: s.setStatsOpen, setWrongNoteOpen: s.setWrongNoteOpen,
    setResultOpen: s.setResultOpen, setPaletteOpen: s.setPaletteOpen, setDrawerOpen: s.setDrawerOpen,
    setConfirmGradeOpen: s.setConfirmGradeOpen, setMode: s.setMode, setIndex: s.setIndex,
    resetTimer: s.resetTimer, clearAnswers: s.clearAnswers, setReviewIds: s.setReviewIds,
    setChapterFilter: s.setChapterFilter, setResumePrompt: s.setResumePrompt,
  })));
  const { appData, total, answered, correctCount, gradeAndShow } = useQuizSession();
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (safeGetItem('istqb-q-font') as FontSize) || 'normal',
  );
  const [debugOn, setDebugOn] = useState(() => isDebugEnabled());
  // 오답 노트 팝업에서 선택한 세트(null이면 세트 목록 화면).
  const [wrongNoteSetId, setWrongNoteSetId] = useState<string | null>(null);
  // 오답 노트 3단계: 선택한 오답 문항 번호(null이면 오답 목록 화면). 팝업 안에서 문제를 다시 본다.
  const [wrongNoteQuestionNo, setWrongNoteQuestionNo] = useState<number | null>(null);

  useEffect(() => {
    document.body.dataset.qfont = fontSize;
    safeSetItem('istqb-q-font', fontSize);
  }, [fontSize]);

  // useMemo: 아래 productHistories 메모의 의존성이라 참조가 렌더마다 바뀌면 안 된다.
  const sets = React.useMemo(
    () => (appData ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct) : []),
    [appData, activeProduct],
  );
  const currentSet = sets.find((s) => s.id === setId);

  // 통계·오답노트·이력 비우기는 현재 제품(ISTQB/CSTS) 이력만 대상으로 한다.
  // IndexedDB 스토어는 두 제품이 공유하므로 필터 없이는 다른 제품 기록이 섞여 보인다.
  // 신규 기록은 certification 필드로 판별하고, 필드가 없는 과거 기록만 setId로 추론한다.
  // useMemo: 결과 모달이 열린 동안 매초(타이머 틱) 리렌더돼도 재계산·참조 변경을 막아
  // StatsDashboard의 useMemo가 실효를 갖게 한다.
  const productHistories = React.useMemo(() => {
    const productSetIds = new Set(sets.map((s) => s.id));
    const out: Record<string, ExamHistory> = {};
    for (const [id, h] of Object.entries(histories)) {
      const owns = h.certification ? h.certification === activeProduct : productSetIds.has(h.setId);
      if (owns) out[id] = h;
    }
    return out;
  }, [histories, sets, activeProduct]);
  // Phase 2 — 결과 모달의 "직전 회차 대비" 비교(현재 세트·모드의 최신 회차 기준).
  const attemptCompare = React.useMemo(
    () => latestAttemptComparison(Object.values(histories), setId, mode),
    [histories, setId, mode],
  );
  const fmtAns = (arr: string[]) =>
    arr.length ? arr.map((s) => s.toUpperCase()).join(', ') : '미응답';
  // 세트별 "전 회차 오답의 합집합" — 최신 회차만 보여주면 같은 세트를 랜덤으로
  // 재채점했을 때 이전 시험 회차의 오답이 노트에서 사라진다(QA 지적 해소).
  // 같은 문항이 여러 회차에서 틀렸으면 가장 최근 회차의 내 답을 대표로 쓴다.
  const wrongNoteBySet: ExamHistory[] = (() => {
    const bySet = new Map<string, ExamHistory[]>();
    for (const h of Object.values(productHistories)) {
      if ((h.wrongItems?.length ?? 0) === 0) continue;
      const list = bySet.get(h.setId) ?? [];
      list.push(h);
      bySet.set(h.setId, list);
    }
    const merged: ExamHistory[] = [];
    for (const [sid, hs] of bySet) {
      hs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); // 최신 우선
      const items = new Map<number, NonNullable<ExamHistory['wrongItems']>[number]>();
      for (const h of hs) {
        for (const it of h.wrongItems ?? []) {
          if (!items.has(it.number)) items.set(it.number, it); // 최신 회차 기록이 대표
        }
      }
      merged.push({
        ...hs[0],
        id: `merged-${sid}`,
        wrongItems: Array.from(items.values()).sort((a, b) => a.number - b.number),
        total: undefined, // 합산 뷰에서 회차별 total 표기는 의미가 없다
      });
    }
    return merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  })();
  const selectedWrong = wrongNoteSetId
    ? wrongNoteBySet.find((h) => h.setId === wrongNoteSetId) ?? null
    : null;
  // 3단계 문항 보기: 선택한 세트의 문항을 로드해 해당 번호의 문제를 찾는다.
  const wrongNoteSetPath = selectedWrong
    ? appData?.sets.find((s) => s.id === selectedWrong.setId)?.path ?? null
    : null;
  const wrongNoteQuestions = useWrongNoteQuestions(wrongNoteSetPath, selectedWrong?.setId ?? null);
  const selectedWrongItem = selectedWrong && wrongNoteQuestionNo != null
    ? (selectedWrong.wrongItems ?? []).find((it) => it.number === wrongNoteQuestionNo) ?? null
    : null;
  const selectedWrongQuestion = selectedWrongItem
    ? wrongNoteQuestions?.find((q) => q.number === selectedWrongItem.number) ?? null
    : null;
  // 3단계 ‹ › 이동: 같은 회차의 오답 목록 안에서 이전/다음 오답 문항으로 넘긴다.
  const wrongItems = selectedWrong?.wrongItems ?? [];
  const wrongItemIndex = selectedWrongItem
    ? wrongItems.findIndex((it) => it.number === selectedWrongItem.number)
    : -1;
  const gotoWrongItem = (delta: number) => {
    const next = wrongItems[wrongItemIndex + delta];
    if (next) setWrongNoteQuestionNo(next.number);
  };

  const handleHome = () => {
    setSettingsOpen(false);
    setDrawerOpen(false);
    setMode('home');
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    // 실패 후 같은 파일을 다시 선택해도 onChange가 발화하도록 값을 리셋한다.
    e.target.value = '';
    const success = await importUserData(file);
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
    // 현재 제품 이력만 지운다 — 전체 clear면 다른 제품(ISTQB↔CSTS) 기록까지 사라진다.
    // 어느 제품 세트에도 속하지 않는 고아 이력(세트 제거/구버전 백업 유래)은 화면에
    // 보이지 않아 다른 삭제 경로가 없으므로 이때 함께 지워 영구 잔존을 막는다.
    const allKnownSetIds = new Set((appData?.sets ?? []).map((s) => s.id));
    const orphanIds = appData
      ? Object.values(histories)
          .filter((h) => !h.certification && !allKnownSetIds.has(h.setId))
          .map((h) => h.id)
      : [];
    removeHistoriesEverywhere([...Object.keys(productHistories), ...orphanIds]);
    // 파괴적 액션의 완료 피드백 — 없으면 "정말 삭제"를 눌러도 됐는지 알 수 없다.
    // (DB 쓰기 실패는 removeHistoriesEverywhere가 별도 오류 토스트로 알린다)
    showToast('현재 자격증의 응시 이력을 모두 삭제했습니다.', 'success');
  };

  // 약점 챕터 집중 연습(Phase 3): 통계에서 챕터를 고르면 현재 세트를 그 챕터로
  // 필터해 연습 모드로 진입한다. setMode가 필터를 초기화하므로 필터는 그 뒤에 건다.
  const handlePracticeChapter = (chapter: string) => {
    setStatsOpen(false);
    setMode('practice');
    setChapterFilter(chapter);
    setIndex(0);
    resetTimer();
  };

  const handleResetMode = () => {
    clearAnswers(setId, mode);
    // 이 세트/모드의 오답(review) 대상도 비운다 — 남기면 삭제된 회차의 오답이
    // 오답 모드에 유령처럼 남는다(오답 노트에는 없는데 오답 풀이엔 나오는 불일치).
    setReviewIds(`${setId}-${mode}`, []);
    const ids = Object.values(histories)
      .filter((h) => h.setId === setId && h.mode === mode)
      .map((h) => h.id);
    removeHistoriesEverywhere(ids);
    // 파괴적 액션의 완료 피드백 — 없으면 "정말 삭제"를 눌러도 됐는지 알 수 없다.
    showToast(`${MODE_LABEL[mode] ?? mode} 모드의 답안과 이력을 초기화했습니다.`, 'success');
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
        <Modal title="오답 노트" onClose={() => { setWrongNoteOpen(false); setWrongNoteSetId(null); setWrongNoteQuestionNo(null); }}>
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
            ) : selectedWrongItem ? (
              // 3단계: 선택한 오답 문항 보기(지문·보기 + 내 답/정답 하이라이트, 읽기 전용)
              <div data-testid="wrong-note-question">
                <div className="wrong-note-question-head">
                  <button
                    type="button"
                    className="wrong-note-back"
                    data-testid="wrong-note-question-back"
                    onClick={() => setWrongNoteQuestionNo(null)}
                  >
                    ← 오답 목록
                  </button>
                  {/* 같은 회차의 이전/다음 오답 문항으로 이동. 끝에서는 비활성. */}
                  <div className="wn-nav" role="group" aria-label="오답 문항 이동">
                    <button
                      type="button"
                      className="wn-nav-btn"
                      data-testid="wrong-note-prev"
                      aria-label="이전 오답 문항"
                      disabled={wrongItemIndex <= 0}
                      onClick={() => gotoWrongItem(-1)}
                    >
                      ‹
                    </button>
                    <span className="wn-nav-pos" data-testid="wrong-note-pos">
                      {wrongItemIndex + 1} / {wrongItems.length}
                    </span>
                    <button
                      type="button"
                      className="wn-nav-btn"
                      data-testid="wrong-note-next"
                      aria-label="다음 오답 문항"
                      disabled={wrongItemIndex >= wrongItems.length - 1}
                      onClick={() => gotoWrongItem(1)}
                    >
                      ›
                    </button>
                  </div>
                </div>
                <h4 className="wrong-note-set">
                  문제 {selectedWrongItem.number}
                  <small>
                    내 답 {fmtAns(selectedWrongItem.myAnswer)} · 정답 {fmtAns(selectedWrongItem.correctAnswer)}
                  </small>
                </h4>
                {!selectedWrongQuestion ? (
                  <p className="wn-loading">{wrongNoteQuestions === null ? '문제 불러오는 중…' : '문항을 찾을 수 없습니다.'}</p>
                ) : (
                  <div className="wrong-note-view">
                    <div className="question-stem">
                      <RichText content={selectedWrongQuestion.stem} />
                    </div>
                    {selectedWrongQuestion.options.length > 0 ? (
                      <div className="options wrong-note-options">
                        {selectedWrongQuestion.options.map((opt) => {
                          const mine = selectedWrongItem.myAnswer.some((a) => a.toLowerCase() === opt.key.toLowerCase());
                          const correct = selectedWrongItem.correctAnswer.some((a) => a.toLowerCase() === opt.key.toLowerCase());
                          let cls = 'option';
                          if (correct) cls += ' correct';
                          else if (mine) cls += ' selected wrong';
                          return (
                            <div key={opt.key} className={cls} data-mine={mine || undefined} data-correct={correct || undefined}>
                              <span className="option-key">{opt.key.toUpperCase()}</span>
                              <span className="option-text"><RichText content={opt.text} /></span>
                              {(mine || correct) && (
                                <span className="wn-tag">{correct ? (mine ? '내 답 · 정답' : '정답') : '내 답'}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // 단답형·진위형 등 보기 없는 문항: 내 답/정답 텍스트로 표시.
                      <dl className="wrong-note-short">
                        <div><dt>내 답</dt><dd>{fmtAns(selectedWrongItem.myAnswer)}</dd></div>
                        <div><dt>정답</dt><dd>{fmtAns(selectedWrongItem.correctAnswer)}</dd></div>
                      </dl>
                    )}
                  </div>
                )}
              </div>
            ) : (
              // 2단계: 선택한 세트의 오답 목록(문항을 누르면 팝업 안에서 해당 문제를 본다)
              <div data-testid="wrong-note-detail">
                <button
                  type="button"
                  className="wrong-note-back"
                  data-testid="wrong-note-back"
                  onClick={() => { setWrongNoteSetId(null); setWrongNoteQuestionNo(null); }}
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
                    <li key={`${it.number}-${idx}`}>
                      <button
                        type="button"
                        className="wrong-note-item wrong-note-item-btn"
                        data-testid="wrong-note-item-btn"
                        onClick={() => setWrongNoteQuestionNo(it.number)}
                      >
                        <span className="wn-num">문제 {it.number}</span>
                        <span className="wn-mine">내 답 {fmtAns(it.myAnswer)}</span>
                        <span className="wn-correct">정답 {fmtAns(it.correctAnswer)}</span>
                        <span className="wns-arrow" aria-hidden="true">›</span>
                      </button>
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
              <div className="settings-actions" data-testid="confirm-reset-mode">
                <ConfirmButtons
                  label="현재 모드 답안 초기화"
                  confirmLabel="정말 삭제 (답안·이력)"
                  confirmTestId="confirm-reset-yes"
                  buttonClassName="settings-action"
                  onConfirm={handleResetMode}
                />
              </div>
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
          histories={productHistories}
          sets={sets}
          onClose={() => setStatsOpen(false)}
          onClear={handleClearHistories}
          onPracticeChapter={handlePracticeChapter}
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

      {resultOpen && (
        <ResultSummary
          setTitle={currentSet?.title || ''}
          certification={activeProduct}
          correct={correctCount}
          total={total}
          elapsedSeconds={resultElapsedSeconds}
          attemptRound={attemptCompare.round}
          previousRate={attemptCompare.previousRate}
          onClose={() => setResultOpen(false)}
          onOpenWrongNote={() => { setResultOpen(false); setWrongNoteOpen(true); }}
        />
      )}
    </>
  );
};
