import { describe, it, expect, beforeEach } from 'vitest';
import { useQuizStore } from './useQuizStore';

/**
 * 스토어 액션 계약 — 유닛이 한 번도 지나가지 않던 것들.
 *
 * 뮤테이션 측정에서 useQuizStore.ts의 no-coverage가 38건이었다. 커버리지 78%로 나쁘지
 * 않은데도 그렇게 나온 이유는, 안 닿은 것이 전부 '단순한 setter라 검사할 게 없어 보이는'
 * 액션들이었기 때문이다. 그런데 그 단순함이야말로 뮤테이션이 쉽게 살아남는 자리다 —
 * 값을 반대로 넣거나(`set({ x: !x })`), 인자를 무시하거나(`set({ x: true })`), 세션을
 * 절반만 초기화해도 화면은 대체로 멀쩡해 보이고 E2E도 지나간다.
 *
 * 여기서는 "무엇을 바꾸는가"만이 아니라 **"무엇을 바꾸지 않는가"**까지 고정한다.
 * 오늘 찾은 결함 중 셋이 정확히 그 유형이었다(제품 스코프 누락·영속화 트리거 누락·
 * 세션 초기화 반쪽) — 이웃 필드를 건드리지 않는지를 아무도 확인하지 않고 있었다.
 */

const S = 'ISTQB-FL-V4-A';
const initial = useQuizStore.getState();

beforeEach(() => {
  useQuizStore.setState(initial, true);
});

describe('beginSession — 새 풀이 세션 개시 의례', () => {
  it('위치를 1번으로, 타이머를 0으로 되돌리고 시계를 다시 켠다', () => {
    useQuizStore.setState({ index: 7, elapsedSeconds: 123, lastTick: null });
    const before = Date.now();
    useQuizStore.getState().beginSession();
    const s = useQuizStore.getState();
    expect(s.index).toBe(0);
    expect(s.elapsedSeconds).toBe(0);
    expect(s.lastTick, 'lastTick을 켜지 않으면 타이머가 멈춘 채로 세션이 시작된다')
      .toBeGreaterThanOrEqual(before);
  });

  it('답안·이력·채점 상태는 건드리지 않는다(세션 개시는 초기화가 아니다)', () => {
    useQuizStore.setState({
      answers: { [`${S}-exam-Q1`]: ['a'] },
      graded: { [`${S}-exam`]: true },
      reviewIds: { [`${S}-exam`]: ['Q1'] },
    });
    useQuizStore.getState().beginSession();
    const s = useQuizStore.getState();
    expect(s.answers[`${S}-exam-Q1`]).toEqual(['a']);
    expect(s.graded[`${S}-exam`]).toBe(true);
    expect(s.reviewIds[`${S}-exam`]).toEqual(['Q1']);
  });
});

describe('setExamStarted — 시험 응시 개시 표식', () => {
  it('세트별로 켜고 끈다', () => {
    useQuizStore.getState().setExamStarted(S, true);
    expect(useQuizStore.getState().examStarted[S]).toBe(true);
    useQuizStore.getState().setExamStarted(S, false);
    expect(useQuizStore.getState().examStarted[S]).toBe(false);
  });

  it('다른 세트의 표식을 지우지 않는다', () => {
    useQuizStore.getState().setExamStarted('ISTQB-FL-V4-B', true);
    useQuizStore.getState().setExamStarted(S, true);
    expect(useQuizStore.getState().examStarted['ISTQB-FL-V4-B'], '다른 세트의 응시 상태가 날아갔다').toBe(true);
  });
});

describe('markReviewed / unmarkReviewed — 오답 재풀이 진척', () => {
  it('맞힌 문항을 누적하고 정렬해 둔다(중복은 합친다)', () => {
    useQuizStore.getState().markReviewed(S, [5, 2]);
    useQuizStore.getState().markReviewed(S, [2, 9]);
    expect(useQuizStore.getState().reviewedOk[S]).toEqual([2, 5, 9]);
  });

  it('다시 틀린 문항만 되돌린다', () => {
    useQuizStore.getState().markReviewed(S, [1, 2, 3]);
    useQuizStore.getState().unmarkReviewed(S, [2]);
    expect(useQuizStore.getState().reviewedOk[S]).toEqual([1, 3]);
  });

  it('복습 기록이 없으면 아무 일도 하지 않는다', () => {
    const before = useQuizStore.getState().reviewedOk;
    useQuizStore.getState().unmarkReviewed(S, [1]);
    expect(useQuizStore.getState().reviewedOk, '없는 키를 건드려 새 객체를 만들면 구독이 헛돈다').toBe(before);
  });

  it('되돌릴 대상이 목록에 없으면 참조까지 그대로 둔다', () => {
    useQuizStore.getState().markReviewed(S, [1]);
    const before = useQuizStore.getState().reviewedOk;
    useQuizStore.getState().unmarkReviewed(S, [99]); // 목록에 없는 번호
    expect(useQuizStore.getState().reviewedOk).toBe(before);
  });

  it('빈 배열로 되돌리면 아무 일도 하지 않는다', () => {
    useQuizStore.getState().markReviewed(S, [1]);
    const before = useQuizStore.getState().reviewedOk;
    useQuizStore.getState().unmarkReviewed(S, []);
    expect(useQuizStore.getState().reviewedOk).toBe(before);
  });

  it('세트별로 분리된다', () => {
    useQuizStore.getState().markReviewed(S, [1]);
    useQuizStore.getState().markReviewed('ISTQB-FL-V4-B', [2]);
    expect(useQuizStore.getState().reviewedOk[S]).toEqual([1]);
    expect(useQuizStore.getState().reviewedOk['ISTQB-FL-V4-B']).toEqual([2]);
  });
});

describe('redrawRandom — 새 문제 뽑기', () => {
  it('세대를 올리고 저장된 추첨을 비운다', () => {
    useQuizStore.setState({
      randomNonce: 3,
      randomDraw: { setId: S, chapter: null, ids: ['Q1', 'Q2'] },
    });
    useQuizStore.getState().redrawRandom();
    const s = useQuizStore.getState();
    // 둘 중 하나만 해서는 안 된다: nonce만 올리면 저장된 추첨이 그대로 복원돼 같은 문항이
    // 다시 나오고, 추첨만 비우면 effect가 다시 돌 신호가 없다.
    expect(s.randomNonce).toBe(4);
    expect(s.randomDraw).toBeNull();
  });

  it('답안은 지우지 않는다(지우는 것은 호출부의 clearAnswers 몫)', () => {
    useQuizStore.setState({ answers: { [`${S}-random-Q1`]: ['a'] } });
    useQuizStore.getState().redrawRandom();
    expect(useQuizStore.getState().answers[`${S}-random-Q1`]).toEqual(['a']);
  });
});

describe('오버레이 토글 — 인자를 그대로 반영한다', () => {
  // 단순해 보이지만 뮤테이션이 가장 잘 살아남는 자리다: 인자를 무시하고 상수를 넣어도
  // 여는 경로만 밟는 검사는 통과한다. 켜고 끄기를 모두 본다.
  const toggles = [
    ['setDrawerOpen', 'drawerOpen'],
    ['setSettingsOpen', 'settingsOpen'],
    ['setStatsOpen', 'statsOpen'],
    ['setWrongNoteOpen', 'wrongNoteOpen'],
    ['setResultOpen', 'resultOpen'],
    ['setPaletteOpen', 'paletteOpen'],
    ['setConfirmGradeOpen', 'confirmGradeOpen'],
    ['setResumeNotice', 'resumeNotice'],
    ['setResumePrompt', 'resumePrompt'],
    ['setQuitExamOpen', 'quitExamOpen'],
    ['setPendingRedraw', 'pendingRedraw'],
    ['setPendingRestart', 'pendingRestart'],
    ['setConfirmExitExam', 'confirmExitExam'],
    ['setNavCollapsed', 'navCollapsed'],
  ] as const;

  it.each(toggles)('%s → %s', (action, field) => {
    const call = (v: boolean) =>
      (useQuizStore.getState()[action] as (v: boolean) => void)(v);
    call(true);
    expect(useQuizStore.getState()[field]).toBe(true);
    call(false);
    expect(useQuizStore.getState()[field], '인자를 무시하고 상수를 넣고 있다').toBe(false);
  });
});

describe('값 설정 액션 — null 포함해 그대로 반영한다', () => {
  it('setChapterFilter는 값과 해제를 모두 반영한다', () => {
    useQuizStore.getState().setChapterFilter('테스트 기초');
    expect(useQuizStore.getState().chapterFilter).toBe('테스트 기초');
    useQuizStore.getState().setChapterFilter(null);
    expect(useQuizStore.getState().chapterFilter).toBeNull();
  });

  it('setPendingSetChange는 보류 세트와 해제를 모두 반영한다', () => {
    useQuizStore.getState().setPendingSetChange(S);
    expect(useQuizStore.getState().pendingSetChange).toBe(S);
    useQuizStore.getState().setPendingSetChange(null);
    expect(useQuizStore.getState().pendingSetChange).toBeNull();
  });

  it('setGradedResume은 점수 정보와 해제를 모두 반영한다', () => {
    useQuizStore.getState().setGradedResume({ correct: 30, total: 40 });
    expect(useQuizStore.getState().gradedResume).toEqual({ correct: 30, total: 40 });
    useQuizStore.getState().setGradedResume(null);
    expect(useQuizStore.getState().gradedResume).toBeNull();
  });

  it('setQuickDraw는 추첨과 해제를 모두 반영한다', () => {
    const draw = { certification: 'istqb', items: [{ id: 'Q1', setId: S }] };
    useQuizStore.getState().setQuickDraw(draw);
    expect(useQuizStore.getState().quickDraw).toEqual(draw);
    useQuizStore.getState().setQuickDraw(null);
    expect(useQuizStore.getState().quickDraw).toBeNull();
  });
});

describe('타이머 액션', () => {
  it('startTimer는 시계 기준점만 잡고 경과는 건드리지 않는다', () => {
    useQuizStore.setState({ elapsedSeconds: 42, lastTick: null });
    useQuizStore.getState().startTimer();
    expect(useQuizStore.getState().lastTick).not.toBeNull();
    expect(useQuizStore.getState().elapsedSeconds, 'startTimer가 경과를 지우면 이어풀기에서 시간이 사라진다').toBe(42);
  });

  it('resetTimer는 경과를 0으로 되돌리고 시계를 다시 켠다', () => {
    useQuizStore.setState({ elapsedSeconds: 42, lastTick: null });
    useQuizStore.getState().resetTimer();
    expect(useQuizStore.getState().elapsedSeconds).toBe(0);
    expect(useQuizStore.getState().lastTick).not.toBeNull();
  });
});
