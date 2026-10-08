import { describe, it, expect, beforeEach } from 'vitest';
import { useQuizStore } from '../store/useQuizStore';
import { requestSetChange } from './useSetChange';
import { answerKeyFor } from '../utils/answerKey';

/**
 * 세트 변경 요청 — 사이드바 select와 모바일 세트 선택 시트의 **공통 입구**.
 *
 * 가드(랜덤 진행 중 확인)를 입구가 아니라 이 함수에 두었으므로, 두 입구 중 한쪽에서만
 * 진행이 소리 없이 사라지는 일이 없다는 것을 여기서 고정한다.
 */

const q = (setId: string, n: number) => answerKeyFor(setId, 'random', { id: `${setId}-${n}`, number: n });

describe('requestSetChange', () => {
  beforeEach(() => {
    useQuizStore.setState({
      mode: 'practice', setId: 'A', index: 5, answers: {}, graded: {}, pendingSetChange: null, setSheetOpen: true,
    });
  });

  it('연습에서는 바로 세트를 바꾸고 시트를 닫는다', () => {
    requestSetChange('B');
    const st = useQuizStore.getState();
    expect(st.setId).toBe('B');
    expect(st.index).toBe(0);
    expect(st.pendingSetChange).toBeNull();
    expect(st.setSheetOpen).toBe(false);
  });

  it('랜덤 진행 중(답이 있고 채점 전)이면 바꾸지 않고 확인을 요청한다', () => {
    useQuizStore.setState({ mode: 'random', answers: { [q('A', 1)]: ['a'] } });
    requestSetChange('B');
    const st = useQuizStore.getState();
    expect(st.setId).toBe('A'); // 아직 바뀌지 않았다
    expect(st.pendingSetChange).toBe('B'); // 확인 모달이 이 값을 보고 뜬다
    expect(st.answers[q('A', 1)]).toEqual(['a']); // 진행이 보존돼 있다
  });

  it('확인을 물을 때는 세트 선택 시트를 닫는다 — 시트가 확인 모달을 덮지 않게', () => {
    // beforeEach가 시트를 연 채로 시작한다(setSheetOpen: true).
    useQuizStore.setState({ mode: 'random', answers: { [q('A', 1)]: ['a'] } });
    requestSetChange('B');
    expect(useQuizStore.getState().setSheetOpen).toBe(false);
  });

  it('확인을 취소해도(pendingSetChange 해제) 시트는 다시 열리지 않는다', () => {
    useQuizStore.setState({ mode: 'random', answers: { [q('A', 1)]: ['a'] } });
    requestSetChange('B');
    useQuizStore.getState().setPendingSetChange(null);
    const st = useQuizStore.getState();
    expect(st.setSheetOpen).toBe(false);
    expect(st.setId).toBe('A'); // 풀던 세트 그대로
  });

  it('랜덤이라도 답한 것이 없으면 묻지 않는다', () => {
    useQuizStore.setState({ mode: 'random', answers: {} });
    requestSetChange('B');
    expect(useQuizStore.getState().setId).toBe('B');
  });

  it('랜덤이라도 채점이 끝났으면 묻지 않는다(결과를 이미 봤다)', () => {
    useQuizStore.setState({
      mode: 'random', answers: { [q('A', 1)]: ['a'] }, graded: { 'A-random': true },
    });
    requestSetChange('B');
    expect(useQuizStore.getState().setId).toBe('B');
  });

  it('다른 세트의 랜덤 답안은 진행으로 보지 않는다', () => {
    useQuizStore.setState({ mode: 'random', answers: { [q('Z', 1)]: ['a'] } });
    requestSetChange('B');
    expect(useQuizStore.getState().setId).toBe('B');
  });
});
