import { describe, it, expect } from 'vitest';
import { answerKeyFor, answerKeyPrefix, gradeKeyFor, questionIdOf } from './answerKey';

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
});
