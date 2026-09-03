import { describe, it, expect } from 'vitest';
import { sanitizeUiState, findGradedRoundMatch, HISTORY_MODES } from './storage';
import type { ExamHistory } from '../store/useQuizStore';
import { answerKeyFor } from './answerKey';

const S = 'SET-A';
const q = (n: number) => ({ id: `Q${n}`, number: n });

describe('sanitizeUiState — 4지선다 출제 순서', () => {
  it('세트 id와 문항 id가 온전하면 통과시킨다', () => {
    const out = sanitizeUiState({ choiceDraw: { setId: S, ids: ['Q3', 'Q1'] } });
    expect(out.choiceDraw).toEqual({ setId: S, ids: ['Q3', 'Q1'] });
  });

  it('세트 id가 없으면 버린다 — 어느 세트 순서인지 알 수 없다', () => {
    // 남겨 두면 다른 세트를 열었을 때 그 순서를 맞춰 보려다 조용히 빈 목록이 된다.
    expect(sanitizeUiState({ choiceDraw: { ids: ['Q1'] } }).choiceDraw).toBeUndefined();
    expect(sanitizeUiState({ choiceDraw: { setId: '', ids: ['Q1'] } }).choiceDraw).toBeUndefined();
  });

  it('문항 id가 비어 있으면 버린다', () => {
    expect(sanitizeUiState({ choiceDraw: { setId: S, ids: [] } }).choiceDraw).toBeUndefined();
    expect(sanitizeUiState({ choiceDraw: { setId: S } }).choiceDraw).toBeUndefined();
  });

  it('문자열이 아닌 항목은 걸러낸다(손상·조작 백업)', () => {
    const out = sanitizeUiState({ choiceDraw: { setId: S, ids: ['Q1', 3, null, 'Q2'] } });
    expect(out.choiceDraw).toEqual({ setId: S, ids: ['Q1', 'Q2'] });
  });

  it("mode 'choice'로 복원할 수 있다", () => {
    // VALID_MODES에서 빠지면 진입할 수 없는 모드로 복원돼 mode 필드가 통째로 사라지고,
    // 메모리에 남아 있던 직전 모드가 그대로 쓰인다(복원 결과가 경로에 좌우된다).
    expect(sanitizeUiState({ mode: 'choice' }).mode).toBe('choice');
  });
});

describe('HISTORY_MODES — 4지선다 회차가 검증을 통과한다', () => {
  it("'choice'가 이력 허용 모드에 있다", () => {
    // 빠지면 sanitizeHistory가 mode를 'exam'으로 보정해, 표본이 다른 회차가 시험 회차로
    // 둔갑한다 — 최고 정답률·평균이 조용히 어긋나는 결함 유형이다.
    expect(HISTORY_MODES).toContain('choice');
  });
});

describe('findGradedRoundMatch — 4지선다 중복 회차 가드', () => {
  const round = (answers: Record<string, string[]>): ExamHistory => ({
    id: 'r1', setId: S, mode: 'choice', answers, correct: 1, total: 2, createdAt: 100,
  });

  it('복원한 답안이 최신 채점 회차와 같으면 그 회차를 돌려준다', () => {
    // graded는 비영속이라 새로고침 뒤 미채점처럼 보인다 — 이 판정이 없으면 같은 답안을
    // 다시 채점해 회차가 중복 적립된다(시험에서 이미 고쳤던 경로다).
    const answers = {
      [answerKeyFor(S, 'choice', q(1))]: ['a'],
      [answerKeyFor(S, 'choice', q(2))]: ['b'],
    };
    expect(findGradedRoundMatch({ r1: round(answers) }, S, 'choice', answers)?.id).toBe('r1');
  });

  it('답이 하나라도 다르면 새 회차로 본다', () => {
    const recorded = { [answerKeyFor(S, 'choice', q(1))]: ['a'] };
    const restored = { [answerKeyFor(S, 'choice', q(1))]: ['c'] };
    expect(findGradedRoundMatch({ r1: round(recorded) }, S, 'choice', restored)).toBeNull();
  });

  it('같은 세트의 시험 회차와 섞이지 않는다 — 모드마다 답안 키가 갈린다', () => {
    const choiceAnswers = { [answerKeyFor(S, 'choice', q(1))]: ['a'] };
    const examRound: ExamHistory = { ...round({}), id: 'e1', mode: 'exam' };
    expect(findGradedRoundMatch({ e1: examRound }, S, 'choice', choiceAnswers)).toBeNull();
  });
});
