import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore, QUICK_ALL } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { flushPersist } from '../../utils/storage';
import { showToast } from '../../utils/toast';
import {
  examLimitSeconds, examLimitLabel, remainingSeconds,
  crossedWarnThreshold, EXAM_AWAY_NOTICE_SEC,
} from '../../utils/examTime';
import { formatClock } from '../../utils/time';
import { useBackDismiss } from '../../hooks/useBackDismiss';
import { BACK_PRIORITY } from '../../utils/backGuard';
import { answerKeyFor } from '../../utils/answerKey';
import { clampIndex } from '../../utils/sessionDerive';
import { QuestionCard } from './QuestionCard';
import { QuestionPalette } from './QuestionPalette';
import { QuickScoreboard } from './QuickScoreboard';
import { ErrorState } from '../common/ErrorState';

export const QuestionWorkspace = () => {
  // 슬라이스 구독(O1) — elapsedSeconds를 구독하지 않으므로 타이머 틱에 리렌더되지 않는다.
  const {
    index, setId, mode, setMode, setIndex, tickTimer, startTimer, beginSession,
    navCollapsed, setNavCollapsed, setPaletteOpen, setResultOpen,
    resumeNotice, setResumeNotice, chapterFilter, setChapterFilter,
    setExamStarted, setDrawerOpen, activeProduct, setExamStartedAt, examStartedAtForSet,
    setConfirmExitExam, setPendingRestart, startQuick,
  } = useQuizStore(useShallow((s) => ({
    index: s.index, setId: s.setId, mode: s.mode, setMode: s.setMode, setIndex: s.setIndex,
    tickTimer: s.tickTimer, startTimer: s.startTimer, beginSession: s.beginSession,
    navCollapsed: s.navCollapsed, setNavCollapsed: s.setNavCollapsed,
    setPaletteOpen: s.setPaletteOpen, setResultOpen: s.setResultOpen,
    resumeNotice: s.resumeNotice, setResumeNotice: s.setResumeNotice,
    chapterFilter: s.chapterFilter, setChapterFilter: s.setChapterFilter,
    setExamStarted: s.setExamStarted, setExamStartedAt: s.setExamStartedAt,
    setConfirmExitExam: s.setConfirmExitExam,
    setPendingRestart: s.setPendingRestart,
    startQuick: s.startQuick,
    examStartedAtForSet: s.examStartedAt[s.setId],
    setDrawerOpen: s.setDrawerOpen, activeProduct: s.activeProduct,
  })));
  const {
    appData, currentQuestions, listContext, answered, isGraded, canGrade, requestGrade, gradeAndShow,
    showExamGate, examLocked, // 시험 단계 파생은 useQuizSession이 단일 원천(잠금과 동일 규칙 집합)
    loadError, retryLoad,
    // 퀵은 문항 단위로 채점하고 넘어간다 — 채점/다음 두 상태를 한 버튼이 번갈아 맡는다.
    currentQuickGraded, hasNextQuestion, goNextQuestion,
  } = useQuizSession();
  // 시험 제한시간(자격증별). null이면 제한 없음 — 종전처럼 경과 시간만 센다.
  const examLimit = mode === 'exam' ? examLimitSeconds(activeProduct) : null;
  // 경고는 임계값을 '내려가는 순간'에만 1회 울린다 — 매초 재발화나, 재응시로 시간이
  // 초기화됐을 때 다시 울리지 않는 문제를 함께 막는다.
  const prevRemainingRef = useRef<number | null>(null);
  // 자동 제출 중복 방지(채점 액션 자체도 멱등이지만 토스트까지 겹치지 않게).
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    // 채점 후에는 타이머를 정지한다 — 결과가 나온 뒤에도 시간이 계속 오르면
    // 결과 모달·사이드바의 소요 시간이 채점 시점과 어긋난다.
    // 재응시(초기화)로 graded가 풀리면 effect가 재실행돼 다시 시작한다.
    // 시험 시작 게이트를 보는 동안에도 아직 응시 전이므로 타이머를 돌리지 않는다.
    if (isGraded || showExamGate) return;
    startTimer();
    autoSubmittedRef.current = false;
    prevRemainingRef.current = null;
    let interval: ReturnType<typeof setInterval> | undefined;

    // 시험 제한시간 처리 — 매 틱마다 남은 시간을 확인해 경고하고, 0이 되면 자동 제출한다.
    // 경과 시간은 tickTimer가 갱신한 직후의 스토어 값을 읽는다(구독하면 매초 리렌더된다).
    // 시험 경과 시간을 응시 시작 시각(벽시계)으로 확정한다.
    // 경과 누계(elapsedSeconds)는 앱이 떠 있는 동안만 쌓이므로, 앱을 껐다 켜면 그 시간이
    // 빠져 제한시간을 무한히 늘릴 수 있었다. 기준점이 영속화돼 있으니 재실행해도 이어진다.
    // 누계 자체를 덮어써 결과 모달·이력의 '소요 시간'까지 같은 값이 되게 한다.
    const syncExamElapsed = () => {
      if (examLimit == null || !examStartedAtForSet) return;
      const wall = (Date.now() - examStartedAtForSet) / 1000;
      if (wall > useQuizStore.getState().elapsedSeconds) useQuizStore.setState({ elapsedSeconds: wall });
    };

    const checkExamDeadline = () => {
      if (examLimit == null || autoSubmittedRef.current) return;
      // 문항 로드 전에는 판정하지 않는다 — 자동 제출이 빈 목록으로 채점될 수 있고,
      // 남은 시간 경고도 화면에 아무것도 없는 상태에서 울린다.
      if (currentQuestions.length === 0) return;
      syncExamElapsed();
      const remaining = remainingSeconds(examLimit, useQuizStore.getState().elapsedSeconds);
      const prev = prevRemainingRef.current;
      prevRemainingRef.current = remaining;
      if (remaining <= 0) {
        autoSubmittedRef.current = true;
        showToast('제한시간이 종료되어 자동으로 제출했습니다.', 'info', 5000);
        gradeAndShow(); // 미응답은 오답 처리(수동 채점과 동일 규칙)
        return;
      }
      if (prev == null) return; // 첫 틱은 기준선만 잡는다(재응시 직후 오발화 방지)
      const crossed = crossedWarnThreshold(prev, remaining);
      if (crossed != null) {
        showToast(`시험 종료까지 ${formatClock(crossed)} 남았습니다.`, 'info', 4000);
      }
    };

    const tick = () => {
      tickTimer();
      checkExamDeadline();
    };
    // 항상 이전 인터벌을 지우고 새로 건다.
    //
    // 아래 else 분기는 "hidden 이벤트를 먼저 받았다"고 가정했는데, **배경 탭에서
    // 마운트되면 첫 visibilitychange가 hidden=false다.** 그러면 아래 130행에서 건
    // 인터벌이 살아 있는 채로 하나가 더 생기고, cleanup은 마지막 것만 지워 앞의 것이
    // 언마운트 뒤에도 남는다(그 인터벌은 죽은 클로저로 checkExamDeadline을 계속 부른다).
    // 시간이 부풀지는 않는다 — tickTimer가 lastTick 기준 벽시계 델타를 더하므로
    // 인터벌이 둘이어도 합계는 같다. 즉 생명주기 누수이지 계산 오류는 아니다.
    const restartTicking = () => {
      clearInterval(interval);
      interval = setInterval(tick, 1000);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        tickTimer();
        flushPersist(); // 경과 시간을 이 시점에 저장(#71)
        clearInterval(interval);
      } else {
        // 시험 모드는 자리를 비운 시간도 제한시간에 포함한다 — 그러지 않으면 앱을
        // 잠깐 전환하는 것만으로 시계가 멈춰 60분/90분 제한을 무한히 늘릴 수 있다.
        // (연습·랜덤·오답은 소요 시간이 학습 참고치라 종전대로 보는 동안만 센다.)
        // tickTimer는 lastTick과의 실제 경과(벽시계)를 더하므로, startTimer로
        // lastTick을 초기화하기 '전에' 불러야 비운 시간이 반영된다.
        if (examLimit != null) {
          const before = useQuizStore.getState().elapsedSeconds;
          tickTimer();
          const away = useQuizStore.getState().elapsedSeconds - before;
          if (away >= EXAM_AWAY_NOTICE_SEC) {
            showToast(
              `자리를 비운 ${formatClock(Math.round(away))}도 시험 시간에 포함됐습니다.`,
              'info',
              4000,
            );
          }
        }
        startTimer();
        checkExamDeadline(); // 비운 사이에 제한시간이 끝났으면 즉시 제출한다
        restartTicking();
      }
    };
    // 복원 직후 즉시 1회 — 앱이 꺼져 있던 사이 제한시간이 끝났다면 바로 제출한다.
    checkExamDeadline();
    restartTicking();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      flushPersist();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // gradeAndShow는 렌더마다 새로 생성되지만 의존성에 넣으면 매 렌더 타이머가 재시작된다 —
    // 항상 최신 스토어 상태를 읽어 동작하므로 effect 재실행 없이 안전하다.
    // currentQuestions.length: 0 → N으로 바뀌는 시점에 effect가 다시 돌아야
    // 로드 전에 건너뛴 만료 판정이 즉시 이어진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isGraded, showExamGate, startTimer, tickTimer, examLimit, examStartedAtForSet, currentQuestions.length]);

  // 응시 중에는 뒤로가기를 한 번 막고 확인을 받는다.
  // 제한시간이 벽시계로 흐르므로(A3) 나가 있는 동안에도 시간이 줄어든다 — 실수로
  // 뒤로가기 한 번에 시험 시간을 잃는 일이 없게 한다. 오버레이가 열려 있으면
  // 그쪽이 먼저 닫히도록 우선순위를 가장 낮게 둔다.
  useBackDismiss(examLocked, () => setConfirmExitExam(true), BACK_PRIORITY.exam);

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
      // 오버레이(모달/드로어)가 열려 있으면 화살표가 뒤 문항을 바꾸지 않도록 무시한다.
      // Modal은 Esc/Tab만 가로채고 화살표는 통과시키며, 모달 포커스는 버튼이라 위 입력 가드에도 안 걸린다.
      const s = useQuizStore.getState();
      if (
        s.settingsOpen || s.statsOpen || s.wrongNoteOpen || s.resultOpen || s.paletteOpen ||
        s.confirmGradeOpen || s.resumePrompt || s.drawerOpen ||
        s.quitExamOpen || s.gradedResume !== null
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (event.key === 'ArrowRight') {
        // 퀵에서 앞으로 가는 길은 '채점 후'뿐이다 — 버튼(‹ ›의 ›)을 없앤 것과 같은 규칙을
        // 키보드에도 건다. 아니면 화살표 하나로 채점하지 않은 문항을 미리 넘겨볼 수 있다.
        if (s.mode === 'quick') {
          const q = currentQuestions[clampIndex(s.index, total)];
          if (!q || !s.quickGraded[answerKeyFor(s.setId, 'quick', q)]) return;
        }
        setIndex((i) => Math.min(total - 1, i + 1));
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // currentQuestions는 배열 참조가 매 렌더 바뀔 수 있어 의존성에 넣으면 리스너가 계속
    // 재등록된다. 핸들러는 길이(total)만 미리 읽고 나머지는 이벤트 시점의 스토어에서
    // 읽으므로(퀵의 채점 여부 판정 포함) 목록 길이만 의존성으로 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIndex, currentQuestions.length]);

  /**
   * 지금 실린 출제 목록이 **어느 맥락에서 만들어졌는지**를 DOM에 적는다.
   *
   * 모드·세트·챕터는 클릭 즉시 바뀌는데 목록은 비동기로 온다. 그 사이 화면은 새 맥락의
   * 머리에 옛 목록을 달고 떠 있다 — 퀵 점수판 아래에 방금까지 풀던 연습 세트 40문항이
   * 그대로 있는 식이다. 그래서 "지문이 보인다"도 "점수판이 보인다"도 출제가 끝났다는
   * 뜻이 아닌데, 그 구간을 밖에서 구분할 단서가 화면에 하나도 없었다.
   *
   * 아래 세 갈래(스켈레톤·시험 게이트·본문)에 모두 단다 — 목록이 비어 있는 동안에도
   * "누가 비웠는지"가 같은 자리에서 읽혀야 한다. E2E 진입 헬퍼가 이 값을 기다린다
   * (e2e/helpers.ts의 waitForList).
   */
  const listAttrs = {
    'data-list-mode': listContext.mode ?? undefined,
    'data-list-set': listContext.setId ?? undefined,
    'data-list-chapter': listContext.chapter ?? undefined,
  };

  if (!currentQuestions.length) {
    // 로드 실패가 최우선(오답 모드보다 먼저) — 아니면 오답 모드의 fetch 실패가
    // "틀린 문항 없음"으로 오표시돼 재시도 경로가 사라진다. 그다음 오답 없음, 그 외 스켈레톤.
    const isEmptyReview = mode === 'review';
    return (
      <section className="workspace" aria-label="문제 풀이 영역" {...listAttrs}>
        {loadError ? (
          <article className="question-card" data-testid="load-error">
            <ErrorState message={loadError} />
            <button type="button" className="primary" data-testid="load-retry" onClick={retryLoad}>
              다시 시도
            </button>
          </article>
        ) : chapterFilter ? (
          // 챕터 필터 결과가 0개(현재 세트에 해당 챕터 문항 없음) — 스켈레톤으로 오인되지 않게 안내.
          <article className="question-card" data-testid="chapter-filter-empty">
            <p className="nav-summary">이 세트에는 ‘{chapterFilter}’ 챕터 문항이 없습니다.</p>
            <button type="button" className="primary" onClick={() => setChapterFilter(null)}>
              전체 문항 보기
            </button>
          </article>
        ) : isEmptyReview ? (
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
  const setTitle = appData?.sets.find((s) => s.id === setId)?.title || '';

  // 시험 시작 게이트 — "시작하기"를 누르기 전에는 문항을 노출하지 않는다.
  // 시작하면 타이머가 0부터 시작하고, 채점 전까지 세트·모드가 잠긴다(사이드바에서 처리).
  if (showExamGate) {
    const startExam = () => {
      setExamStarted(setId, true);
      beginSession(); // 위치 1번 + 타이머 0(세션 개시 의례 단일 액션)
      // 제한시간의 기준점을 벽시계로 못박는다 — 경과 누계만 쓰면 앱을 껐다 켠 시간이
      // 빠져 제한시간을 무한히 늘릴 수 있다(영속화되므로 재실행해도 이어진다).
      setExamStartedAt(setId, Date.now());
      setDrawerOpen(false);
    };
    return (
      <section className="workspace" aria-label="문제 풀이 영역" {...listAttrs}>
        <article className="question-card exam-gate" data-testid="exam-start-gate">
          <h2 className="exam-gate-title">시험 모드</h2>
          <p className="exam-gate-set">
            {setTitle} · 총 {total}문항
            {examLimitLabel(activeProduct) ? ` · 제한시간 ${examLimitLabel(activeProduct)}` : ''}
          </p>
          <p className="exam-gate-desc">
            시험을 시작하면 응시가 끝나(채점)기 전까지 <strong>문제 세트와 풀이 모드를 변경할 수 없습니다.</strong>
            {examLimitLabel(activeProduct)
              ? ' 제한시간이 지나면 자동으로 제출됩니다. '
              : ' '}
            준비되면 시작하세요.
          </p>
          <button type="button" className="primary exam-gate-start" data-testid="exam-start-btn" onClick={startExam}>
            시험 시작
          </button>
        </article>
      </section>
    );
  }

  const safeIndex = Math.min(Math.max(index, 0), total - 1);
  const currentQuestion = currentQuestions[safeIndex];
  // 보기 없는 단답형도 동의어 정답을 배열로 가질 수 있다 — 보기가 있을 때만 복수정답 표기(QuestionCard와 동일 기준).
  const isMulti = currentQuestion.options.length > 0 && currentQuestion.answer.length > 1;

  /**
   * 퀵의 주 액션 — 한 자리에서 **채점 → 다음 문제**를 번갈아 맡는다.
   *
   * 퀵은 한 문항씩 채점하고 넘어가는 모드다. 버튼을 둘로 나눠 나란히 두면 채점 전에도
   * '다음'이 눌려 정답을 못 본 채 지나가고, 그 문항은 집계에도 들어가지 않는다 —
   * 한 자리에서 상태에 따라 바뀌는 편이 흐름을 강제한다.
   *
   * 마지막 문항까지 채점하면 '다시 섞어 시작'이 된다. 끝을 정해 놓지 않은 모드라 마감
   * 절차가 없어서, 여기서 막히면 회차를 새로 뽑을 길이 드로어 안에만 남는다.
   *
   * 데스크톱은 문항 아래, 모바일은 하단 고정 바에 같은 것을 둔다(엄지 동선).
   */
  const renderQuickMain = (className: string, suffix = '') => {
    if (mode !== 'quick') return null;
    if (!currentQuickGraded) {
      return (
        <button
          type="button"
          className={className}
          data-testid={`quick-grade-btn${suffix}`}
          disabled={!canGrade}
          onClick={requestGrade}
        >
          채점하기
        </button>
      );
    }
    if (hasNextQuestion) {
      return (
        <button type="button" className={className} data-testid={`quick-next-btn${suffix}`} onClick={goNextQuestion}>
          다음 문제 ›
        </button>
      );
    }
    return (
      <button
        type="button"
        className={className}
        data-testid={`quick-reshuffle-btn${suffix}`}
        onClick={() => startQuick(QUICK_ALL)}
      >
        다시 섞어 시작
      </button>
    );
  };

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(total - 1, i + 1));

  return (
    <section className="workspace" aria-label="문제 풀이 영역" {...listAttrs}>
      <header className="topbar">
        <div className="topbar-title">
          {/* 퀵에서는 세트명을 쓰지 않는다 — 전 세트를 섞어 내는 모드라 '현재 세트'가 없고,
              setId도 어느 세트도 아닌 센티넬(QUICK)이라 여기서 조회하면 늘 빈 값이다.
              빈 <p>를 남기면 제목 위에 원인 모를 여백만 생기므로 요소째 뺀다. */}
          {mode !== 'quick' && <p id="setMeta">{setTitle}</p>}
          <div className="question-title-row">
            <h2 id="questionTitle">문제 {currentQuestion.number}{isMulti ? ' · 복수정답' : ''}</h2>
            {currentQuestion.chapter && (
              <span className="question-chapter-badge">{currentQuestion.chapter}</span>
            )}
          </div>
        </div>
        {/* 퀵 현황은 헤더의 오른쪽 빈자리에 들어간다(CSS의 margin-left:auto가 밀어 붙인다).
            래퍼로 감싸지 않는 이유: .topbar은 space-between이라 감싸면 한 덩이가 더 생겨
            좁은 폭에서 점수판만 아래 줄로 흘리는 처리를 그 래퍼에 또 걸어야 한다. */}
        {mode === 'quick' && (
          <QuickScoreboard questions={currentQuestions} />
        )}
        <div className="topbar-actions">
          <button id="prevBtn" type="button" aria-label="이전 문제" disabled={safeIndex === 0} onClick={goPrev}>‹</button>
          {/* 퀵에는 앞으로 가는 화살표를 두지 않는다.
              전 세트를 섞어 한 문항씩 내는 모드에서 '다음'을 미리 눌러 볼 수 있으면,
              채점하지 않은 문항을 그냥 지나칠 수 있고 그 문항은 집계에도 남지 않는다.
              앞으로 가는 길은 채점 뒤에 나타나는 '다음 문제' 하나뿐이다(뒤로는 열어 둔다 —
              이미 채점해 정답을 본 문항을 다시 보는 것은 학습에 해가 없다). */}
          {mode !== 'quick' && (
            <button id="nextBtn" type="button" aria-label="다음 문제" disabled={safeIndex === total - 1} onClick={goNext}>›</button>
          )}
        </div>
      </header>

      {chapterFilter && (
        <div className="chapter-filter-banner" data-testid="chapter-filter-banner" role="status">
          {mode === 'random' ? (
            // 챕터 미니 시험(랜덤+필터) — 연습과 달리 채점되어 챕터 통계에 반영된다.
            <span className="cf-text">
              <strong>{chapterFilter}</strong> 미니 시험 — {total}문항
              <small className="cf-hint">채점하면 챕터 통계에 반영돼요 — 약점 보완 후 재측정에 쓰세요.</small>
            </span>
          ) : (
            <span className="cf-text">
              <strong>{chapterFilter}</strong> 챕터만 연습 중 — {total}문항
              {/* 연습은 이력에 집계되지 않는다(무기록) — 정답률 갱신 경로를 안내해 기대 어긋남 방지. */}
              <small className="cf-hint">연습은 통계에 기록되지 않아요 — 미니 시험·시험 채점으로 정답률을 갱신하세요.</small>
            </span>
          )}
          {/* 챕터 제한 해제.
              연습에서는 말 그대로 필터만 푼다(같은 모드로 세트 전체를 순서대로 본다).

              미니 시험에서는 **연습으로 나간다.** 종전에는 여기서도 필터만 풀었는데, 모드가
              'random'으로 남아 같은 버튼이 세트 전체 40문항 무작위 회차를 새로 시작했다 —
              모드 세그먼트에서 '랜덤'을 없앤 결정을 이 버튼 하나가 우회하고 있었던 셈이다.
              게다가 이름이 그 결과를 예고하지 않아(필터 해제로 읽힌다) 풀던 미니 시험이
              말없이 버려지고, 세그먼트는 어느 모드도 가리키지 않는 상태가 됐다.
              '전체 보기'가 뜻하는 것은 "이 챕터 말고 세트 전체를 보겠다"이므로 연습이 맞다. */}
          <button
            type="button"
            className="cf-clear"
            data-testid="chapter-filter-clear"
            onClick={() => {
              if (mode === 'random') {
                setMode('practice'); // setMode가 챕터 필터도 함께 해제한다
                beginSession();
                return;
              }
              setChapterFilter(null);
            }}
          >
            {mode === 'random' ? '연습으로 전체 보기' : '전체 보기'}
          </button>
        </div>
      )}

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
              // 확인을 받고 지운다 — 답안 소실은 되돌릴 수 없다(세트 변경·새 문제 뽑기와 동일 규칙).
              onClick={() => setPendingRestart(true)}
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
        {/* 세트+mode+문항을 key로 묶어 카드를 remount → showFeedback 등 로컬 상태가
            문항 이동·모드 전환 간 누수되지 않게 한다(#79).
            setId를 넣는 이유: id가 없는 데이터가 들어오면 폴백이 문항 '번호'인데 번호는
            세트마다 겹친다. 같은 모드로 세트만 바꾸면 key가 같아져 remount가 일어나지
            않고, 연습 모드에서 이전 문항의 정답·해설이 그대로 노출된다.
            (현재 12세트 626문항은 전부 세트 접두 id를 가져 중복이 0건이지만, key가
            데이터 품질에 기대고 있을 이유가 없다.) */}
        <QuestionCard
          key={`${setId}-${mode}-${currentQuestion.id || currentQuestion.number}`}
          question={currentQuestion}
        />
      </article>

      {/* 데스크톱 인라인 팔레트(접이식). 모바일에선 CSS로 숨기고 하단바/점프핀으로 대체.

          퀵에서는 통째로 뺀다 — 이 모드의 이동 수단은 ‹ › 뿐이다.
          번호로 건너뛰는 조작이 퀵에서는 뜻을 갖지 않는다: 칸에 찍히는 값은 순번이 아니라
          **원본 세트의 문항 번호**인데, 퀵은 전 세트를 섞어 내므로 세트가 다르면 같은 번호가
          여러 번 나온다. "32번으로 간다"가 어디로 가는 것인지 화면 어디에도 없다.
          게다가 퀵의 추첨 규모는 늘 전부(QUICK_ALL)라 이 격자는 수백 칸이 된다.
          진행 현황은 헤더의 QuickScoreboard가 맡는다(진행·정답·오답·연속). */}
      {mode !== 'quick' && (
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
      )}

      {/* 퀵의 주 액션(데스크톱). 모바일에서는 CSS로 감추고 아래 하단바가 같은 것을 낸다 —
          팔레트 블록과 같은 규칙이라 한 화면에 버튼이 둘로 보이지 않는다. */}
      {mode === 'quick' && (
        <section className="quick-actionbar">
          {renderQuickMain('quick-main')}
        </section>
      )}

      {/* 모바일 전용: 하단 고정 액션바(CSS로 ≤880px만 노출).
          순차 이동(‹ ›)·채점·문항 점프를 한 줄에 모은다 — 점프 버튼을 본문 위에 떠 있는
          플로팅 핀으로 두면 해설을 읽는 동안 텍스트를 가려서(스크롤해도 따라옴) 학습을 방해한다. */}
      <nav className="mobile-actionbar" aria-label="문항 이동·채점">
        <button type="button" className="ab-nav" aria-label="이전 문제" disabled={safeIndex === 0} onClick={goPrev}>‹</button>
        {mode === 'quick' ? (
          // 퀵은 세션 채점이 없다 — 이 자리는 '이 문항 채점 → 다음 문제'가 쓴다.
          renderQuickMain('ab-main', '-m')
        ) : canGrade ? (
          <button type="button" className="ab-main" data-testid="grade-button-m" onClick={requestGrade}>채점하기</button>
        ) : isGraded ? (
          <button type="button" className="ab-main subtle" onClick={() => setResultOpen(true)}>결과 요약</button>
        ) : null}
        {/* 데스크톱과 같은 이유로 퀵에서는 뺀다. 핀이 겸하던 'n / 총계' 표시도 함께
            사라지지만, 퀵은 원래 분모를 보여주지 않는 모드다(진행 현황은 헤더의
            QuickScoreboard가 맡는다). 빠진 자리는 ‹ 채점하기 › 가 1:2:1로 채운다. */}
        {mode !== 'quick' && (
          <button type="button" className="jump-pin" data-testid="jump-pin" aria-label="문항 이동" onClick={() => setPaletteOpen(true)}>
            <span className="jp-dot" aria-hidden="true" />{safeIndex + 1} / {total}
          </button>
        )}
        {/* 데스크톱 헤더와 같은 이유로 퀵에서는 뺀다 — 앞으로는 '채점 → 다음 문제'로만 간다. */}
        {mode !== 'quick' && (
          <button type="button" className="ab-nav" aria-label="다음 문제" disabled={safeIndex === total - 1} onClick={goNext}>›</button>
        )}
      </nav>
    </section>
  );
};
