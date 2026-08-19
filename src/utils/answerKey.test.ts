import { describe, it, expect } from 'vitest';
import { answerKeyFor, answerKeyPrefix, gradeKeyFor, questionIdOf, reviewKeyFor, isReviewKeyOf } from './answerKey';

// 이 키들은 localStorage/IndexedDB에 영속화된 데이터의 계약이다. 형식이 바뀌면 기존
// 사용자의 답안·채점 상태가 조용히 유실되므로, 리터럴 기대값으로 못 박는다.
describe('answerKey — 영속 키 계약', () => {
  it('답안 키는 `setId-mode-qid` 형식이다', () => {
    expect(answerKeyFor('ISTQB-FL-V4-A', 'exam', { id: 'ISTQB-FL-V4-A-001', number: 1 }))
      .toBe('ISTQB-FL-V4-A-exam-ISTQB-FL-V4-A-001');
  });

  it('id가 없으면 세트 내 순번으로 폴백한다', () => {
    expect(answerKeyFor('A', 'practice', { number: 7 })).toBe('A-practice-7');
  });

  it('채점 키는 `setId-mode` 형식이다', () => {
    expect(gradeKeyFor('CSTS-FL-2404', 'random')).toBe('CSTS-FL-2404-random');
  });

  // 접두에서 끝의 '-'를 빼면 `A`가 `AB`의 답안까지 지운다. 문항 id가 세트 id로 시작하는
  // 현 데이터(ISTQB-FL-V4-A → ISTQB-FL-V4-A-001)에서 접두 관계는 가상이 아니라 실재한다.
  it('접두는 구분자까지 포함해 유사 접두 세트를 오삭제하지 않는다', () => {
    const prefix = answerKeyPrefix('A', 'exam');
    expect(prefix).toBe('A-exam-');
    expect(answerKeyFor('AB', 'exam', { number: 1 }).startsWith(prefix)).toBe(false);
    expect(answerKeyFor('A', 'exam', { number: 1 }).startsWith(prefix)).toBe(true);
  });

  it('같은 문항이라도 모드가 다르면 답안이 섞이지 않는다', () => {
    const q = { id: 'Q1', number: 1 };
    expect(answerKeyFor('A', 'exam', q)).not.toBe(answerKeyFor('A', 'review', q));
  });

  it('questionIdOf는 id 우선, 없으면 number를 문자열로 돌려준다', () => {
    expect(questionIdOf({ id: 'X', number: 3 })).toBe('X');
    expect(questionIdOf({ number: 3 })).toBe('3');
  });

  // storage.ts의 examStarted 복원이 키에서 '-exam-'을 찾아 setId를 잘라낸다.
  // setId·qid에 '-exam-'이 들어가면 그 파싱이 오판하므로 규약으로 고정한다.
  it("답안 키에서 '-exam-'은 모드 구분자로만 나타난다", () => {
    const key = answerKeyFor('ISTQB-FL-V4-A', 'exam', { id: 'ISTQB-FL-V4-A-001', number: 1 });
    expect(key.indexOf('-exam-')).toBe('ISTQB-FL-V4-A'.length);
    expect(key.slice(0, key.indexOf('-exam-'))).toBe('ISTQB-FL-V4-A');
  });

  // ── 오답 대상 키 — 챕터 미니 회차를 세트 전체 랜덤과 갈라 둔다 ──────────────
  //
  // 미니 시험은 내부 모드가 random이라 채점 키가 세트 전체 랜덤과 같았다. 채점이
  // setReviewIds로 **덮어쓰기** 때문에, 10문항 미니 한 번이 40문항 랜덤의 오답 목록을
  // 통째로 갈아치웠다 — 오답 노트에는 남아 있는데 오답 모드에는 안 나오는 상태.
  it('챕터가 있으면 채점 키에 챕터를 덧붙인다(없으면 종전 키 그대로)', () => {
    expect(reviewKeyFor('A', 'random')).toBe('A-random');
    expect(reviewKeyFor('A', 'random', null)).toBe('A-random');
    expect(reviewKeyFor('A', 'random', '테스트 기초')).toBe('A-random#테스트 기초');
    // 챕터가 다르면 키도 다르다 — 미니 회차끼리도 서로를 덮지 않는다.
    expect(reviewKeyFor('A', 'random', '정적 테스팅')).not.toBe(reviewKeyFor('A', 'random', '테스트 기초'));
  });

  it('base 키와 챕터 키를 같은 (세트, 모드)로 알아본다', () => {
    expect(isReviewKeyOf('A-random', 'A', 'random')).toBe(true);
    expect(isReviewKeyOf('A-random#테스트 기초', 'A', 'random')).toBe(true);
    // 모드가 다르면 아니다.
    expect(isReviewKeyOf('A-exam', 'A', 'random')).toBe(false);
    // 세트 id가 서로의 접두여도 넘어가지 않는다(접두 비교로 짰다면 여기서 깨진다).
    expect(isReviewKeyOf('AB-random', 'A', 'random')).toBe(false);
    expect(isReviewKeyOf('AB-random#c', 'A', 'random')).toBe(false);
  });

  it("챕터 키는 '#'로 base를 되찾을 수 있다(초기화가 base 일치로 지운다)", () => {
    // resetProgressForSets가 key.split('#')[0]로 판정하므로, 세트 id·모드·챕터명에
    // '#'이 없다는 규약이 이 계약의 전제다.
    expect(reviewKeyFor('A', 'random', '테스트 기초').split('#')[0]).toBe('A-random');
  });
});
