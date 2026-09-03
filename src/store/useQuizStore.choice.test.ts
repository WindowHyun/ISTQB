import { describe, it, expect, beforeEach } from 'vitest';
import { useQuizStore } from './useQuizStore';
import { answerKeyFor, gradeKeyFor } from '../utils/answerKey';

/**
 * 4지선다의 출제 순서는 "새 회차가 시작될 때만" 새로 섞여야 한다.
 *
 * 두 방향 모두 결함이 된다.
 *  - 안 섞이면: '다시 풀기'를 눌러도 방금 푼 순서가 그대로 나온다.
 *  - 매번 섞이면: 답안은 문항 id로 남는데 순서와 커서만 어긋나, 잠깐 다른 모드에 다녀오거나
 *    새로고침한 것만으로 "풀던 자리가 사라진" 것처럼 보인다(폐지된 랜덤 모드가 겪은 문제).
 *
 * 그래서 재추첨을 clearAnswers 하나에 묶었다 — 새 회차의 모든 진입로(설정 초기화·결과
 * 모달의 다시 풀기·이어풀기 배너의 처음부터·채점 후 모드 재클릭)가 이 액션을 지난다.
 */

const S = 'SET-A';
const q = (n: number) => ({ id: `Q${n}`, number: n });

beforeEach(() => {
  useQuizStore.setState({
    answers: {}, graded: {}, choiceDraw: null, choiceNonce: 0,
    examStarted: {}, examStartedAt: {}, reviewIds: {}, reviewedOk: {},
  });
});

describe('clearAnswers — 4지선다', () => {
  it('답안을 비우면서 출제 순서를 버리고 재추첨 신호를 올린다', () => {
    useQuizStore.setState({
      answers: { [answerKeyFor(S, 'choice', q(1))]: ['a'] },
      choiceDraw: { setId: S, ids: ['Q1', 'Q2'] },
      choiceNonce: 3,
    });
    useQuizStore.getState().clearAnswers(S, 'choice');
    const s = useQuizStore.getState();
    expect(s.answers).toEqual({});
    // 둘 중 하나만 해서는 안 된다: 순서만 비우면 useQuestions가 다시 돌 신호가 없어
    // 화면은 지운 순서를 그대로 들고 있고, nonce만 올리면 저장본이 그대로 복원된다.
    expect(s.choiceDraw).toBeNull();
    expect(s.choiceNonce).toBe(4);
    expect(s.graded[gradeKeyFor(S, 'choice')]).toBe(false);
  });

  it('다른 세트의 순서는 건드리지 않는다', () => {
    useQuizStore.setState({ choiceDraw: { setId: 'SET-B', ids: ['X'] }, choiceNonce: 1 });
    useQuizStore.getState().clearAnswers(S, 'choice');
    const s = useQuizStore.getState();
    expect(s.choiceDraw).toEqual({ setId: 'SET-B', ids: ['X'] });
    expect(s.choiceNonce, '엉뚱한 세트에서 재추첨이 돌았다').toBe(1);
  });

  it('다른 모드의 초기화는 4지선다 순서를 흔들지 않는다', () => {
    // 시험 답안을 지웠다고 4지선다가 새로 섞이면, 두 모드를 오가는 사용자는
    // 자기가 건드리지 않은 쪽이 초기화되는 것을 겪는다(답안 네임스페이스가 갈려 있다).
    useQuizStore.setState({ choiceDraw: { setId: S, ids: ['Q1'] }, choiceNonce: 0 });
    useQuizStore.getState().clearAnswers(S, 'exam');
    const s = useQuizStore.getState();
    expect(s.choiceDraw).toEqual({ setId: S, ids: ['Q1'] });
    expect(s.choiceNonce).toBe(0);
  });
});

describe('resetProgressForSets — 이력 비우기', () => {
  it('지운 세트의 4지선다 답안·채점·오답 대상·출제 순서를 함께 버린다', () => {
    useQuizStore.setState({
      answers: {
        [answerKeyFor(S, 'choice', q(1))]: ['a'],
        [answerKeyFor(S, 'exam', q(1))]: ['b'],
      },
      graded: { [gradeKeyFor(S, 'choice')]: true },
      reviewIds: { [gradeKeyFor(S, 'choice')]: ['Q1'] },
      choiceDraw: { setId: S, ids: ['Q1', 'Q2'] },
      choiceNonce: 0,
    });
    useQuizStore.getState().resetProgressForSets([S]);
    const s = useQuizStore.getState();
    expect(s.answers).toEqual({});
    expect(s.graded[gradeKeyFor(S, 'choice')]).toBeUndefined();
    expect(s.reviewIds[gradeKeyFor(S, 'choice')]).toBeUndefined();
    // 답안만 지우고 순서를 남기면 "초기화했는데 아까 그 순서로 이어서 나온다"가 된다.
    expect(s.choiceDraw).toBeNull();
    expect(s.choiceNonce).toBe(1);
  });

  it('목록에 없는 세트의 순서는 남는다', () => {
    useQuizStore.setState({ choiceDraw: { setId: 'SET-B', ids: ['X'] }, choiceNonce: 5 });
    useQuizStore.getState().resetProgressForSets([S]);
    expect(useQuizStore.getState().choiceDraw).toEqual({ setId: 'SET-B', ids: ['X'] });
    expect(useQuizStore.getState().choiceNonce).toBe(5);
  });
});
