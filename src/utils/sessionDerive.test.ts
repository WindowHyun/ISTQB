import { describe, it, expect } from 'vitest';
import type { Question } from '../hooks/useQuestions';
import {
  selectGradableQuestions, tallySession, selectCorrectQuestions,
  deriveExamStage, clampIndex, deriveQuickControls, deriveCanGrade, progressPercentOf,
} from './sessionDerive';

/**
 * `useQuizSession`에서 꺼낸 파생 계층.
 *
 * 이 계산들은 훅 안에 있는 동안 **커버리지 0%**였다 — 화면의 잠금·버튼 가용성·회차에 담기는
 * 범위를 정하는데도 유닛이 한 번도 닿지 않았고, 이번 점검에서 실제로 이 근처(F-3·F-4)에서
 * 결함이 나왔다. 꺼낸 목적이 여기 값을 못 박는 것이므로, 경계를 값으로 고정한다.
 */

const q = (n: number, answer: string[] = ['a'], type = 'multiple_choice'): Question => ({
  number: n,
  type,
  answer,
  stem: [],
  options: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }],
} as unknown as Question);

/** 문항 번호를 그대로 키로 쓰는 단순 규칙 — 키 규약 자체는 answerKey.test.ts가 맡는다. */
const keyOf = (x: Question) => `k${x.number}`;

describe('selectGradableQuestions — 회차에 담을 범위', () => {
  const qs = [q(1), q(2), q(3)];

  it('퀵이 아니면 목록 전체가 대상이다(참조까지 그대로)', () => {
    for (const mode of ['exam', 'random', 'practice', 'review']) {
      expect(selectGradableQuestions(mode, qs, {}, keyOf)).toBe(qs);
    }
  });

  // 이것이 이 함수의 존재 이유다 — 퀵에서 전체를 담으면 한 문항만 풀고 채점해도
  // 뽑아 둔 수백 문항이 회차에 들어가고 나머지가 오답으로 기록된다.
  it('퀵은 채점을 마친 문항만 담는다', () => {
    const graded = { k2: true } as Record<string, true>;
    expect(selectGradableQuestions('quick', qs, graded, keyOf).map((x) => x.number)).toEqual([2]);
  });

  it('퀵에서 아직 채점한 것이 없으면 빈 회차다', () => {
    expect(selectGradableQuestions('quick', qs, {}, keyOf)).toEqual([]);
  });

  // '답을 골라 두기만 한 문항'은 담기지 않는다 — 판정 기준은 답안이 아니라 채점 표시다.
  it('답안이 있어도 채점 표시가 없으면 담기지 않는다', () => {
    expect(selectGradableQuestions('quick', qs, {}, keyOf)).toHaveLength(0);
  });
});

describe('tallySession — 답함·정답·오답을 한 번에', () => {
  const qs = [q(1), q(2), q(3)];
  const answers = { k1: ['a'], k2: ['b'] }; // 1번 정답, 2번 오답, 3번 미응답

  it('정답 수와 오답 목록이 갈리지 않는다', () => {
    const t = tallySession('practice', qs, answers, keyOf);
    expect(t.correctCount).toBe(1);
    expect(t.wrongQuestions.map((w) => w.q.number)).toEqual([2, 3]);
  });

  // 오답 목록은 네비게이션이 위치로 쓴다 — 번호가 아니라 목록에서의 index여야 한다.
  it('오답 항목은 목록에서의 위치를 함께 든다', () => {
    const t = tallySession('practice', qs, answers, keyOf);
    expect(t.wrongQuestions.map((w) => w.i)).toEqual([1, 2]);
  });

  it('미응답은 오답으로 세되 답함으로는 세지 않는다', () => {
    const t = tallySession('practice', qs, answers, keyOf);
    expect(t.answered).toBe(2);
    expect(t.correctCount + t.wrongQuestions.length).toBe(qs.length);
  });

  // 퀵의 '답함'은 확정이다 — 복수정답을 하나만 고른 문항은 답한 것이 아니다.
  // 종전에 팔레트만 다른 술어를 써서 "팔레트는 답한 색인데 점수판에는 없는" 결함이 났다.
  it('퀵에서는 복수정답을 다 골라야 답함이다', () => {
    const multi = [q(1, ['a', 'b'])];
    const partial = tallySession('quick', multi, { k1: ['a'] }, keyOf);
    const full = tallySession('quick', multi, { k1: ['a', 'b'] }, keyOf);
    expect(partial.answered).toBe(0);
    expect(full.answered).toBe(1);
  });

  it('빈 목록에서도 터지지 않는다', () => {
    expect(tallySession('exam', [], {}, keyOf))
      .toEqual({ answered: 0, correctCount: 0, wrongQuestions: [] });
  });
});

describe('selectCorrectQuestions', () => {
  it('정답인 문항만 남긴다', () => {
    const qs = [q(1), q(2)];
    expect(selectCorrectQuestions(qs, { k1: ['a'] }, keyOf).map((x) => x.number)).toEqual([1]);
  });

  // 결과 요약의 분자와 '복습 완료' 대상이 같은 함수를 쓴다 — 갈리면 화면과 기록이 어긋난다.
  it('답안이 없으면 아무것도 남지 않는다', () => {
    expect(selectCorrectQuestions([q(1)], {}, keyOf)).toEqual([]);
  });
});

describe('deriveExamStage — 시험 단계', () => {
  const base = { mode: 'exam', examStarted: false, isGraded: false, answered: 0 };

  it('시작 전·미채점·답안 없음에서만 게이트를 보여준다', () => {
    expect(deriveExamStage(base).showExamGate).toBe(true);
  });

  // 이어풀기 복원은 이미 응시를 개시한 것이다 — 게이트를 다시 띄우면 답안이 있는데도
  // '시작하기'를 눌러야 하고, 그 경로가 진행을 초기화한다.
  it('답안이 남아 있으면(이어풀기) 게이트를 띄우지 않는다', () => {
    expect(deriveExamStage({ ...base, answered: 3 }).showExamGate).toBe(false);
  });

  it('응시 중에는 잠기고, 채점하면 풀린다', () => {
    expect(deriveExamStage({ ...base, examStarted: true }).examLocked).toBe(true);
    expect(deriveExamStage({ ...base, examStarted: true, isGraded: true }).examLocked).toBe(false);
  });

  // 이 조건이 없으면 사이드바 '채점하기'로 응시한 적 없는 시험이 0/N 유령 회차로 남는다.
  it('시험은 개시 전에는 채점 대상이 아니다', () => {
    expect(deriveExamStage(base).examUnderway).toBe(false);
    expect(deriveExamStage({ ...base, examStarted: true }).examUnderway).toBe(true);
    expect(deriveExamStage({ ...base, answered: 1 }).examUnderway).toBe(true);
  });

  it('시험이 아닌 모드는 항상 개시 상태이고 잠기지 않는다', () => {
    for (const mode of ['practice', 'random', 'quick', 'review']) {
      const s = deriveExamStage({ ...base, mode });
      expect(s.examUnderway, mode).toBe(true);
      expect(s.examLocked, mode).toBe(false);
      expect(s.showExamGate, mode).toBe(false);
    }
  });
});

describe('clampIndex — 커서를 목록 안에 가둔다', () => {
  // 목록은 비동기로 바뀌는데 index는 즉시 바뀐다 — 그 사이 구간에서 undefined를 그리면 깨진다.
  it.each([
    [5, 3, 2], [-1, 3, 0], [0, 0, 0], [7, 0, 0], [1, 3, 1],
  ])('index %i / total %i → %i', (index, total, want) => {
    expect(clampIndex(index, total)).toBe(want);
  });
});

describe('deriveQuickControls — 퀵의 문항 단위 흐름', () => {
  const cur = q(1, ['a', 'b']);
  const base = {
    mode: 'quick', currentQuestion: cur, currentKey: 'k1',
    quickGraded: {} as Record<string, true>, answers: {} as Record<string, string[]>,
    index: 0, total: 3,
  };

  it('답을 다 골라야 채점 버튼이 열린다', () => {
    expect(deriveQuickControls({ ...base, answers: { k1: ['a'] } }).canGradeQuestion).toBe(false);
    expect(deriveQuickControls({ ...base, answers: { k1: ['a', 'b'] } }).canGradeQuestion).toBe(true);
  });

  // 한 번 채점한 문항을 다시 채점하면 같은 문항이 회차에 두 번 들어간다.
  it('이미 채점한 문항은 다시 채점할 수 없다', () => {
    const g = deriveQuickControls({
      ...base, answers: { k1: ['a', 'b'] }, quickGraded: { k1: true },
    });
    expect(g.currentQuickGraded).toBe(true);
    expect(g.canGradeQuestion).toBe(false);
  });

  // 퀵이 아닌 모드에서 이 값이 참이 되면 '세션 채점' 자리에 문항 채점 버튼이 뜬다.
  it('퀵이 아니면 문항 단위 채점이 없다', () => {
    const s = deriveQuickControls({
      ...base, mode: 'exam', answers: { k1: ['a', 'b'] }, quickGraded: { k1: true },
    });
    expect(s.currentQuickGraded).toBe(false);
    expect(s.canGradeQuestion).toBe(false);
  });

  it('문항이 아직 없으면 채점할 수 없다', () => {
    expect(deriveQuickControls({ ...base, currentQuestion: undefined }).canGradeQuestion).toBe(false);
  });

  it('마지막 문항에서는 다음이 없다', () => {
    expect(deriveQuickControls({ ...base, index: 2, total: 3 }).hasNextQuestion).toBe(false);
    expect(deriveQuickControls({ ...base, index: 1, total: 3 }).hasNextQuestion).toBe(true);
    expect(deriveQuickControls({ ...base, index: 0, total: 0 }).hasNextQuestion).toBe(false);
  });
});

describe('deriveCanGrade — 채점 버튼 가용', () => {
  const base = { mode: 'exam', canGradeQuestion: false, isGraded: false, total: 10, examUnderway: true };

  it('채점이 있는 모드에서만 열린다', () => {
    expect(deriveCanGrade({ ...base, mode: 'exam' })).toBe(true);
    expect(deriveCanGrade({ ...base, mode: 'random' })).toBe(true);
    expect(deriveCanGrade({ ...base, mode: 'practice' })).toBe(false);
    expect(deriveCanGrade({ ...base, mode: 'review' })).toBe(false);
  });

  it('이미 채점했으면 닫힌다', () => {
    expect(deriveCanGrade({ ...base, isGraded: true })).toBe(false);
  });

  // 복원 직후(문항 fetch 중)에 제한시간이 만료되면 0/0 유령 회차가 남던 자리다.
  it('문항이 실리지 않았으면 닫힌다', () => {
    expect(deriveCanGrade({ ...base, total: 0 })).toBe(false);
  });

  it('응시를 개시하지 않은 시험은 닫힌다', () => {
    expect(deriveCanGrade({ ...base, examUnderway: false })).toBe(false);
  });

  // 퀵은 '세션 채점'이 없다 — 이 값은 문항 단위 버튼의 가용 여부를 그대로 따른다.
  it('퀵은 문항 단위 판정을 그대로 쓴다', () => {
    expect(deriveCanGrade({ ...base, mode: 'quick', canGradeQuestion: true })).toBe(true);
    expect(deriveCanGrade({ ...base, mode: 'quick', canGradeQuestion: false })).toBe(false);
    // 퀵은 채점 표시가 세션 단위가 아니므로 isGraded·examUnderway에 매이지 않는다.
    expect(deriveCanGrade({
      ...base, mode: 'quick', canGradeQuestion: true, isGraded: true, examUnderway: false,
    })).toBe(true);
  });
});

describe('progressPercentOf', () => {
  it.each([[0, 10, 0], [5, 10, 50], [10, 10, 100], [1, 3, 33], [2, 3, 67]])(
    '%i / %i → %i%%', (a, t, want) => expect(progressPercentOf(a, t)).toBe(want),
  );

  // 문항이 실리기 전에도 사이드바가 이 값을 그린다 — NaN이 되면 화면에 'NaN%'가 뜬다.
  it('문항이 없으면 0이다(0으로 나누지 않는다)', () => {
    expect(progressPercentOf(0, 0)).toBe(0);
  });
});
