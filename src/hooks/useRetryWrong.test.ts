import { describe, it, expect, beforeEach } from 'vitest';
import { useQuizStore } from '../store/useQuizStore';
import { startRetryWrong } from './useRetryWrong';
import { answerKeyFor } from '../utils/answerKey';

/**
 * 오답 다시 풀기 시작 — 사이드바 버튼과 문항 목록 시트가 **같은 길**을 쓴다.
 *
 * 가드(응시 잠금·오답 없음)가 입구가 아니라 이 함수에 있으므로, 어느 입구로 들어와도
 * 시험 타이머를 잃거나 빈 오답 모드로 들어가지 않는다는 것을 여기서 고정한다.
 */

const SET = 'ISTQB-FL-V4-A';
const reviewAnswerKey = answerKeyFor(SET, 'review', { id: `${SET}-001`, number: 1 });

describe('startRetryWrong', () => {
  beforeEach(() => {
    useQuizStore.setState({
      mode: 'exam', setId: SET, index: 7, elapsedSeconds: 99,
      reviewIds: { [`${SET}-exam`]: [`${SET}-001`, `${SET}-002`] },
      answers: { [reviewAnswerKey]: ['a'] },
    });
  });

  it('오답 대상이 있으면 이전 재풀이 답안을 비우고 오답 모드로 처음부터 시작한다', () => {
    expect(startRetryWrong(false)).toBe(true);
    const st = useQuizStore.getState();
    expect(st.mode).toBe('review');
    expect(st.index).toBe(0);
    expect(st.elapsedSeconds).toBe(0);
    expect(st.answers[reviewAnswerKey], '지난 재풀이 답안이 남아 있다').toBeUndefined();
  });

  it('시험 응시 중에는 시작하지 않는다(잠금 우회로 시험 타이머가 사라진다)', () => {
    expect(startRetryWrong(true)).toBe(false);
    const st = useQuizStore.getState();
    expect(st.mode).toBe('exam');
    expect(st.elapsedSeconds).toBe(99);
    expect(st.answers[reviewAnswerKey]).toEqual(['a']);
  });

  it('이 세트에 오답이 없으면 빈 오답 모드로 들어가지 않고 모드를 유지한다', () => {
    useQuizStore.setState({ reviewIds: {} });
    expect(startRetryWrong(false)).toBe(false);
    expect(useQuizStore.getState().mode).toBe('exam');
  });

  it('다른 세트의 오답만 있으면 이 세트에서는 시작하지 않는다', () => {
    useQuizStore.setState({ reviewIds: { ['OTHER-exam']: ['OTHER-001'] } });
    expect(startRetryWrong(false)).toBe(false);
  });

  it('퀵 오답 키는 대상이 아니다(퀵 오답은 세트 버킷에 담기지 않는 사양)', () => {
    useQuizStore.setState({ reviewIds: { [`${SET}-quick`]: [`${SET}-001`] } });
    expect(startRetryWrong(false)).toBe(false);
  });
});
