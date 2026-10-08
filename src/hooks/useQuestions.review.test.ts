import { describe, it, expect } from 'vitest';
import { reviewTargetIds, selectReviewQuestions } from './useQuestions';

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

  it('챕터 미니 회차의 오답도 함께 낸다 — 세트 전체 랜덤과 합집합', () => {
    // 미니 시험(랜덤 + 챕터 필터)은 채점 키가 세트 전체 랜덤과 같아, 종전에는 10문항
    // 미니 한 번이 40문항 랜덤의 오답 목록을 통째로 덮었다. 이제 키를 갈라 저장하므로
    // (answerKey.reviewKeyFor) **읽을 때 둘 다 봐야** 오답이 사라지지 않는다.
    const got = reviewTargetIds(
      {
        [`${SET}-random`]: ['r1', 'r2'],
        [`${SET}-random#테스트 기초`]: ['m1', 'r2'],
        [`${SET}-random#정적 테스팅`]: ['m2'],
      },
      SET,
    );
    expect([...got].sort()).toEqual(['m1', 'm2', 'r1', 'r2']);
  });

  it('다른 세트의 챕터 키는 새어 들어오지 않는다', () => {
    // 세트 id가 서로의 접두인 조합(A / AB)에서 접두 비교로 짰다면 여기서 깨진다.
    const got = reviewTargetIds(
      { [`${SET}B-random#테스트 기초`]: ['other'], [`${SET}-exam`]: ['mine'] },
      SET,
    );
    expect([...got]).toEqual(['mine']);
  });
});


/**
 * 오답 모드가 실제로 내놓는 문항 — 출제와 'N문제 다시 풀기'의 N이 같은 함수를 거친다.
 * 둘이 각자 거르면 버튼은 "4문제"인데 눌러 보니 3문제인 어긋남이 생긴다.
 */
describe('selectReviewQuestions — 출제 목록', () => {
  const qs = [
    { id: 'A-001', number: 1 },
    { id: 'A-002', number: 2 },
    { id: 'A-003', number: 3 },
    { number: 4 }, // id 없는 옛 문항 → legacy-4
  ];

  it('대상 id에 속한 문항만 낸다', () => {
    const got = selectReviewQuestions(qs, new Set(['A-001', 'A-003']), new Set());
    expect(got.map((q) => q.number)).toEqual([1, 3]);
  });

  it('이미 다시 풀어 맞힌(복습 완료) 번호는 뺀다', () => {
    const got = selectReviewQuestions(qs, new Set(['A-001', 'A-002', 'A-003']), new Set([2]));
    expect(got.map((q) => q.number)).toEqual([1, 3]);
  });

  it('id가 없는 문항은 legacy-번호로 찾는다', () => {
    const got = selectReviewQuestions(qs, new Set(['legacy-4']), new Set());
    expect(got.map((q) => q.number)).toEqual([4]);
  });

  it('대상이 문항 목록에 없으면(데이터 변경) 조용히 빠진다', () => {
    expect(selectReviewQuestions(qs, new Set(['GONE']), new Set())).toEqual([]);
  });
});
