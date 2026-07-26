import { describe, it, expect } from 'vitest';
import { formatAnswerToken, formatAnswerList } from './answerDisplay';

describe('formatAnswerToken', () => {
  it('한 글자 보기 키는 대문자로 보여준다', () => {
    expect(formatAnswerToken('a')).toBe('A');
    expect(formatAnswerToken('e')).toBe('E');
  });
  it('진위형 o/x도 보기 키와 같게 다룬다', () => {
    expect(formatAnswerToken('o')).toBe('O');
    expect(formatAnswerToken('x')).toBe('X');
  });
  it('서답형은 원문 표기를 그대로 둔다 — 대문자화하면 정답 표기가 왜곡된다', () => {
    expect(formatAnswerToken('회귀(Regression) 테스트')).toBe('회귀(Regression) 테스트');
    expect(formatAnswerToken('Equivalence partitioning')).toBe('Equivalence partitioning');
    expect(formatAnswerToken('분할용이성(decomposability)')).toBe('분할용이성(decomposability)');
  });
  it('두 글자부터는 보기 키가 아니다', () => {
    expect(formatAnswerToken('kk')).toBe('kk');
  });
  it('앞뒤 공백은 다듬는다', () => {
    expect(formatAnswerToken('  b ')).toBe('B');
    expect(formatAnswerToken(' 재테스팅 ')).toBe('재테스팅');
  });
  it('빈 값·null도 안전하게 처리한다', () => {
    expect(formatAnswerToken('')).toBe('');
    expect(formatAnswerToken(undefined as unknown as string)).toBe('');
  });
});

describe('formatAnswerList', () => {
  it('여러 정답을 쉼표로 잇는다', () => {
    expect(formatAnswerList(['a', 'c'])).toBe('A, C');
  });
  it('보기 키와 서답형이 섞여도 각각의 규칙을 적용한다', () => {
    expect(formatAnswerList(['재테스팅', 'retesting'])).toBe('재테스팅, retesting');
  });
  it('빈 칸(미입력)은 걸러낸다 — 다답형의 일부만 입력한 경우', () => {
    expect(formatAnswerList(['동등 분할', '', '  '])).toBe('동등 분할');
  });
  it('남는 값이 없으면 emptyLabel', () => {
    expect(formatAnswerList([], '미응답')).toBe('미응답');
    expect(formatAnswerList([''], '미응답')).toBe('미응답');
    expect(formatAnswerList(null, '미응답')).toBe('미응답');
    expect(formatAnswerList(undefined)).toBe('');
  });
});
