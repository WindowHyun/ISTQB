import { describe, it, expect } from 'vitest';
import type { Question } from '../hooks/useQuestions';
import {
  selectGradableQuestions, tallySession, selectCorrectQuestions,
  deriveExamStage, clampIndex, deriveQuickControls, deriveCanGrade, progressPercentOf,
  isAtProductGate, listMatchesSession, mergeReviewTargets, scopeQuickRound,
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

/**
 * 게이트 판정 — 두 곳이 이 값을 본다.
 *   ① `App`이 워크스페이스 대신 게이트를 그릴지
 *   ② `UpdatePrompt`가 새 버전을 **묻지 않고 바로 적용**할지
 *
 * ②가 이 검사의 무게다. 참이 잘못 나오면 **풀이 중에 경고 없이 페이지가 리로드된다** —
 * 시험에는 제한시간이 있으므로 그대로 사고다. 거짓이 잘못 나오면 배너가 게이트에서도
 * 떠서, 잃을 것 없는 자리인데 사용자에게 묻게 된다.
 */
describe('isAtProductGate — 게이트인가', () => {
  it('제품을 아직 고르지 않았으면 게이트다', () => {
    expect(isAtProductGate({ mode: 'practice', activeProduct: null })).toBe(true);
    expect(isAtProductGate({ mode: 'exam', activeProduct: null })).toBe(true);
  });

  it("모드가 'home'이면 제품이 남아 있어도 게이트다", () => {
    // resetToGate는 모드를 home으로 되돌리되 제품을 즉시 비우지 않는 경로가 있다.
    expect(isAtProductGate({ mode: 'home', activeProduct: 'istqb' })).toBe(true);
    expect(isAtProductGate({ mode: 'home', activeProduct: null })).toBe(true);
  });

  // 여기가 거짓이어야 자동 리로드가 막힌다 — 풀이 중인 모든 모드를 못 박는다.
  it.each(['practice', 'exam', 'random', 'quick', 'review'])(
    "%s 모드로 풀이 중이면 게이트가 아니다(자동 리로드 금지)",
    (mode) => {
      expect(isAtProductGate({ mode, activeProduct: 'istqb' })).toBe(false);
      expect(isAtProductGate({ mode, activeProduct: 'csts' })).toBe(false);
    },
  );

  // 빈 문자열은 '고르지 않음'과 같게 다룬다 — 손상된 저장값이 그대로 실릴 수 있다.
  it('제품이 빈 문자열이면 게이트로 본다', () => {
    expect(isAtProductGate({ mode: 'practice', activeProduct: '' })).toBe(true);
  });
});

describe('listMatchesSession — 실린 목록이 지금 세션의 것인가', () => {
  const session = { mode: 'exam', setId: 'A', chapterFilter: null as string | null };

  it('모드·세트가 같으면 맞다', () => {
    expect(listMatchesSession({ mode: 'exam', setId: 'A', chapter: null }, session)).toBe(true);
  });

  // 세트를 바꾼 직후 새 목록이 오기 전에 자동 제출이 걸리면, 옛 세트의 문항이 새 세트 키로 기록된다.
  it('세트가 다르면 아니다(옛 목록으로 새 세트를 채점하지 않는다)', () => {
    expect(listMatchesSession({ mode: 'exam', setId: 'B', chapter: null }, session)).toBe(false);
  });

  it('모드가 다르거나 아직 아무것도 싣지 않았으면 아니다', () => {
    expect(listMatchesSession({ mode: 'practice', setId: 'A', chapter: null }, session)).toBe(false);
    expect(listMatchesSession({ mode: null, setId: null, chapter: null }, session)).toBe(false);
  });

  it('랜덤은 챕터까지 같아야 한다(미니 시험과 세트 전체 랜덤은 다른 목록이다)', () => {
    const mini = { mode: 'random', setId: 'A', chapterFilter: '테스트 기초' };
    expect(listMatchesSession({ mode: 'random', setId: 'A', chapter: '테스트 기초' }, mini)).toBe(true);
    expect(listMatchesSession({ mode: 'random', setId: 'A', chapter: null }, mini)).toBe(false);
    expect(listMatchesSession({ mode: 'random', setId: 'A', chapter: '다른 챕터' }, mini)).toBe(false);
    expect(listMatchesSession({ mode: 'random', setId: 'A', chapter: null }, { ...mini, chapterFilter: null })).toBe(true);
  });

  it('랜덤이 아니면 챕터는 보지 않는다(연습의 챕터 필터는 채점과 무관하다)', () => {
    expect(listMatchesSession({ mode: 'exam', setId: 'A', chapter: '무엇이든' }, { ...session, chapterFilter: null })).toBe(true);
  });
});

describe('mergeReviewTargets — 오답 대상은 이번 회차가 다룬 문항만 갈아끼운다', () => {
  it('이전 값이 없으면 이번 오답이 그대로 대상이다', () => {
    expect(mergeReviewTargets(undefined, ['q1', 'q2', 'q3'], ['q2'])).toEqual(['q2']);
  });

  // 이것이 존재 이유다: 두 번째 표본이 첫 표본의 오답을 통째로 지우면 오답 모드에서 문항이 사라진다.
  it('이번 회차가 다루지 않은 문항의 이전 오답은 그대로 둔다', () => {
    expect(mergeReviewTargets(['q1', 'q2'], ['q8', 'q9'], ['q9'])).toEqual(['q1', 'q2', 'q9']);
  });

  it('이번 회차가 다뤄서 맞힌 문항은 대상에서 빠진다', () => {
    expect(mergeReviewTargets(['q1', 'q2'], ['q1', 'q9'], ['q9'])).toEqual(['q2', 'q9']);
  });

  it('이번에도 틀린 문항은 한 번만 남는다', () => {
    expect(mergeReviewTargets(['q1'], ['q1', 'q2'], ['q1'])).toEqual(['q1']);
  });

  it('회차가 세트 전체를 다루면(시험) 종전처럼 이번 결과로 교체된다', () => {
    expect(mergeReviewTargets(['q1', 'q2', 'q3'], ['q1', 'q2', 'q3', 'q4'], ['q4'])).toEqual(['q4']);
  });
});

describe('scopeQuickRound — 퀵 회차에 담을 문항', () => {
  const a = q(1); const b = q(2); const c = q(3);

  it('이 회차가 아직 없거나 만료됐으면 방금 채점한 문항 하나로 시작한다', () => {
    // 며칠 전 채점 표시까지 지금 시각의 회차로 되살리지 않는다.
    expect(scopeQuickRound(undefined, [a, b, c], c, keyOf)).toEqual([c]);
  });

  it('회차가 유효하면 거기 담긴 문항에 방금 것만 더한다', () => {
    const prior = { answers: { k1: ['a'] } };
    expect(scopeQuickRound(prior, [a, b, c], c, keyOf)).toEqual([a, c]);
  });

  it('채점 표시는 남았지만 회차에 없는 문항(옛 날의 것)은 따라오지 않는다', () => {
    const prior = { answers: { k3: ['a'] } };
    expect(scopeQuickRound(prior, [a, b, c], c, keyOf)).toEqual([c]);
  });

  it('방금 채점한 문항이 이미 회차에 있으면 한 번만 담긴다', () => {
    const prior = { answers: { k1: ['a'], k2: ['a'] } };
    expect(scopeQuickRound(prior, [a, b], b, keyOf)).toEqual([a, b]);
  });
});
