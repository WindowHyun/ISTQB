import { describe, it, expect } from 'vitest';
import { reviewTargetIds } from './useQuestions';

/**
 * 오답 모드가 무엇을 다시 내는가 — 특히 퀵을 섞지 않는다는 사양.
 *
 * 종전에는 이 계산이 effect 안에 묻혀 있었고 `${setId}-quick` 키까지 읽었는데,
 * 그 키를 쓰는 코드는 어디에도 없었다(채점은 mode !== 'quick'에서만 담는다).
 * 읽기는 늘 빈 배열을 받았고 주석만 "퀵도 담긴다"고 설명해, 코드가 존재하지 않는
 * 계약을 서술하는 상태였다. 실측으로도 퀵 10문항을 전부 틀린 뒤 오답 모드에
 * 문항이 0개였다.
 *
 * 사양은 "퀵은 세트 오답 버킷에 넣지 않는다"이다. 그 사양을 여기서 고정한다 —
 * 읽는 쪽에 퀵 키가 다시 들어오면 이 검사가 깨진다.
 */

const SET = 'ISTQB-FL-V4-A';

describe('reviewTargetIds — 오답 모드 대상 산정', () => {
  it('시험 오답과 랜덤 오답을 합집합으로 낸다(한쪽이 다른 쪽을 덮지 않는다)', () => {
    const got = reviewTargetIds(
      { [`${SET}-exam`]: ['q1', 'q2'], [`${SET}-random`]: ['q2', 'q9'] },
      SET,
    );
    expect([...got].sort()).toEqual(['q1', 'q2', 'q9']);
  });

  it('구버전의 모드 없는 단독 키도 함께 읽는다(과거 데이터 보존)', () => {
    const got = reviewTargetIds({ [SET]: ['old-1'] }, SET);
    expect([...got]).toEqual(['old-1']);
  });

  it('퀵 오답은 세트 오답 모드로 오지 않는다', () => {
    // 이 키는 현재 아무도 쓰지 않는다. 그럼에도 값을 넣어 두는 이유는, 누군가
    // 쓰기를 되살렸을 때 읽는 쪽이 조용히 받아들이지 않는다는 것까지 고정하기 위해서다.
    const got = reviewTargetIds(
      { [`${SET}-quick`]: ['quick-wrong-1', 'quick-wrong-2'] },
      SET,
    );
    expect(
      [...got],
      '퀵 오답이 세트 오답 모드에 섞였다 — 세트를 풀지도 않았는데 그 세트의 오답으로 보인다',
    ).toEqual([]);
  });

  it('다른 세트의 오답은 끌어오지 않는다', () => {
    const got = reviewTargetIds(
      { 'ISTQB-FL-V4-B-exam': ['other-1'], [`${SET}-exam`]: ['mine-1'] },
      SET,
    );
    expect([...got]).toEqual(['mine-1']);
  });

  it('오답이 없으면 빈 집합이다(없는 키 접근으로 터지지 않는다)', () => {
    expect([...reviewTargetIds({}, SET)]).toEqual([]);
  });
});
