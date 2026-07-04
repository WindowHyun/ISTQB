import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { flushPersist } from '../../utils/storage';
import { QuestionCard } from './QuestionCard';
import { QuestionPalette } from './QuestionPalette';

export const QuestionWorkspace = () => {
  // 슬라이스 구독(O1) — elapsedSeconds를 구독하지 않으므로 타이머 틱에 리렌더되지 않는다.
  const {
    index, setId, mode, setIndex, tickTimer, startTimer,
    navCollapsed, setNavCollapsed, setPaletteOpen, setResultOpen,
    resumeNotice, setResumeNotice,
  } = useQuizStore(useShallow((s) => ({
    index: s.index, setId: s.setId, mode: s.mode, setIndex: s.setIndex,
    tickTimer: s.tickTimer, startTimer: s.startTimer,
    navCollapsed: s.navCollapsed, setNavCollapsed: s.setNavCollapsed,
    setPaletteOpen: s.setPaletteOpen, setResultOpen: s.setResultOpen,
    resumeNotice: s.resumeNotice, setResumeNotice: s.setResumeNotice,
  })));
  const {
    appData, currentQuestions, answered, isGraded, canGrade, requestGrade,
  } = useQuizSession();

  useEffect(() => {
    startTimer();
    let interval: ReturnType<typeof setInterval> | undefined;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        tickTimer();
        flushPersist(); // 경과 시간을 이 시점에 저장(#71)
        clearInterval(interval);
      } else {
        startTimer();
        interval = setInterval(tickTimer, 1000);
      }
    };
    interval = setInterval(tickTimer, 1000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      flushPersist();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mode, startTimer, tickTimer]);

  // index가 현재 목록 범위를 벗어나면 보정(세트/모드 전환 잔여 index 방어, #70)
  useEffect(() => {
    const total = currentQuestions.length;
    if (total && (index < 0 || index >= total)) {
      setIndex(Math.min(Math.max(index, 0), total - 1));
    }
  }, [currentQuestions.length, index, setIndex]);

  // 이어풀기 배너는 첫 문항(또는 세트 변경)에 도달하면 자동으로 닫는다(#A).
  useEffect(() => {
    if (resumeNotice && index <= 0) setResumeNotice(false);
  }, [resumeNotice, index, setResumeNotice]);

  // 키보드 좌우 화살표로 문항 이동 (입력 필드 포커스 시 제외)
  useEffect(() => {
    const total = currentQuestions.length;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (event.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setIndex, currentQuestions.length]);

  if (!currentQuestions.length) {
    // 오답 모드에서 비어 있으면 "틀린 문항 없음", 그 외엔 로딩 스켈레톤.
    const isEmptyReview = mode === 'review';
    return (
      <section className="workspace" aria-label="문제 풀이 영역">
        {isEmptyReview ? (
          <article className="question-card">
            <p className="nav-summary">표시할 오답 문항이 없습니다.</p>
          </article>
        ) : (
          <article className="question-card skeleton-card" aria-busy="true" aria-label="문제 불러오는 중" data-testid="skeleton">
            <div className="skeleton skeleton-line lg" />
            <div className="skeleton skeleton-line md" />
            <div className="skeleton skeleton-line md" />
            <div className="skeleton skeleton-option" />
            <div className="skeleton skeleton-option" />
            <div className="skeleton skeleton-option" />
            <div className="skeleton skeleton-option" />
          </article>
        )}
      </section>
    );
  }

  const total = currentQuestions.length;
  const safeIndex = Math.min(Math.max(index, 0), total - 1);
  const currentQuestion = currentQuestions[safeIndex];
  const isMulti = currentQuestion.answer.length > 1;
  const setTitle = appData?.sets.find((s) => s.id === setId)?.title || '';

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(total - 1, i + 1));

  return (
    <section className="workspace" aria-label="문제 풀이 영역">
      <header className="topbar">
        <div>
          <p id="setMeta">{setTitle}</p>
          <h2 id="questionTitle">문제 {currentQuestion.number}{isMulti ? ' · 복수정답' : ''}</h2>
        </div>
        <div className="topbar-actions">
          <button id="prevBtn" type="button" aria-label="이전 문제" disabled={safeIndex === 0} onClick={goPrev}>‹</button>
          <button id="nextBtn" type="button" aria-label="다음 문제" disabled={safeIndex === total - 1} onClick={goNext}>›</button>
        </div>
      </header>

      {resumeNotice && (
        <div className="resume-banner" data-testid="resume-banner" role="status">
          <span className="resume-text">
            이전에 풀던 위치에서 이어집니다 — 현재 <strong>{safeIndex + 1} / {total}</strong>번 문항.
          </span>
          <div className="resume-actions">
            <button
              type="button"
              className="resume-restart"
              data-testid="resume-restart"
              onClick={() => { setIndex(0); setResumeNotice(false); }}
            >
              처음부터
            </button>
            <button
              type="button"
              className="resume-dismiss"
              data-testid="resume-dismiss"
              onClick={() => setResumeNotice(false)}
            >
              계속하기
            </button>
          </div>
        </div>
      )}

      <article className="question-card">
        {/* mode+문항을 key로 묶어 카드를 remount → showFeedback 등 로컬 상태가
            문항 이동·모드 전환 간 누수되지 않게 한다(#79). */}
        <QuestionCard
          key={`${mode}-${currentQuestion.id || currentQuestion.number}`}
          question={currentQuestion}
        />
      </article>

      {/* 데스크톱 인라인 팔레트(접이식). 모바일에선 CSS로 숨기고 하단바/점프핀으로 대체. */}
      <section className="palette-block">
        <div className="palette-head">
          <div className="palette-summary">
            문항 목록 <small>{safeIndex + 1} / {total} · 답함 {answered}</small>
          </div>
          <div className="palette-actions">
            <button
              type="button"
              className="pill"
              aria-expanded={!navCollapsed}
              data-testid="palette-toggle"
              onClick={() => setNavCollapsed(!navCollapsed)}
            >
              {navCollapsed ? '▸ 펼치기' : '▾ 접기'}
            </button>
            <button type="button" className="pill accent" data-testid="palette-jump-btn" onClick={() => setPaletteOpen(true)}>
              ⤢ 문항 이동
            </button>
          </div>
        </div>
        {!navCollapsed && <QuestionPalette withId />}
      </section>

      {/* 모바일 전용: 하단 고정 액션바 + 플로팅 점프핀(CSS로 ≤880px만 노출) */}
      <button type="button" className="jump-pin" data-testid="jump-pin" aria-label="문항 이동" onClick={() => setPaletteOpen(true)}>
        <span className="jp-dot" aria-hidden="true" />{safeIndex + 1} / {total}
      </button>

      {/* B안: 순차 이동(‹ ›)·채점은 하단 액션바, 랜덤 점프는 우하단 핀으로 역할 분리.
          연습/오답 모드(채점 없음)에서는 중앙을 비워 ‹ ›가 넓게 차지한다. */}
      <nav className="mobile-actionbar" aria-label="문항 이동·채점">
        <button type="button" className="ab-nav" aria-label="이전 문제" disabled={safeIndex === 0} onClick={goPrev}>‹</button>
        {canGrade ? (
          <button type="button" className="ab-main" data-testid="grade-button-m" onClick={requestGrade}>채점하기</button>
        ) : isGraded ? (
          <button type="button" className="ab-main subtle" onClick={() => setResultOpen(true)}>결과 요약</button>
        ) : null}
        <button type="button" className="ab-nav" aria-label="다음 문제" disabled={safeIndex === total - 1} onClick={goNext}>›</button>
      </nav>
    </section>
  );
};
