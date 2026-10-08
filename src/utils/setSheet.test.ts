import { describe, it, expect } from 'vitest';
import {
  groupSets,
  productSets,
  setDisplay,
  setProgressPercent,
  setProgressText,
  solvedCountForSet,
  solvedQuestionIds,
} from './setSheet';

/**
 * 세트 선택 시트의 표시 데이터. 원제목은 PDF 출처 표기라 한 줄에 다 들어오지 않아
 * 규칙으로 짧은 이름을 파생한다 — 규칙에 걸리지 않는 제목은 원제목을 그대로 쓴다.
 */

describe('setDisplay — 짧은 이름 파생', () => {
  it('CSTS 공개답안 FL', () => {
    expect(setDisplay({ certification: 'CSTS', title: '(공개답안) CSTS 2402FL' })).toEqual({
      group: '공개답안 · FL', name: '2402 FL', context: 'CSTS · 공개답안', recognized: true,
    });
  });

  it('CSTS 일반등급 예제', () => {
    expect(setDisplay({ certification: 'CSTS', title: '2018년도 CSTS 자격시험 예제(일반등급)' })).toEqual({
      group: '일반등급 예제', name: '2018 일반등급 예제', context: 'CSTS · 일반등급', recognized: true,
    });
  });

  it('정답 포함 예제문제는 일반등급 예제 묶음에 들어간다', () => {
    expect(setDisplay({
      certification: 'CSTS', title: 'SW 테스트 전문가(CSTS) 자격시험 예제문제_정답포함',
    })).toEqual({
      group: '일반등급 예제', name: '예제문제 (정답 포함)', context: 'CSTS · 일반등급', recognized: true,
    });
  });

  it('ISTQB 샘플문제 A·모음', () => {
    expect(setDisplay({ certification: 'ISTQB', title: 'ISTQB FL v4.0 샘플문제 A' })).toEqual({
      group: 'FL v4.0 샘플문제', name: '샘플문제 A', context: 'ISTQB · FL v4.0', recognized: true,
    });
    expect(setDisplay({ certification: 'ISTQB', title: 'ISTQB FL v4.0 샘플문제 모음' }).name).toBe('샘플문제 모음');
  });

  it('규칙에 걸리지 않으면 원제목을 그대로 쓰고 recognized=false로 표시한다', () => {
    // 틀린 이름을 지어내느니 길더라도 정확한 이름을 보인다. 계약 테스트가 이 값을 본다.
    expect(setDisplay({ certification: 'CSTS', title: '새로 들어온 세트' })).toEqual({
      group: 'CSTS', name: '새로 들어온 세트', context: 'CSTS', recognized: false,
    });
  });
});

describe('groupSets', () => {
  const sets = [
    { id: 'a', certification: 'CSTS', title: '(공개답안) CSTS 2402FL' },
    { id: 'b', certification: 'CSTS', title: '(공개답안) CSTS 2403FL' },
    { id: 'c', certification: 'CSTS', title: '2018년도 CSTS 자격시험 예제(일반등급)' },
    { id: 'd', certification: 'CSTS', title: 'SW 테스트 전문가(CSTS) 자격시험 예제문제_정답포함' },
  ];

  it('종류별로 묶되 묶음과 행의 순서는 입력 순서를 따른다', () => {
    const groups = groupSets(sets);
    expect(groups.map((g) => g.label)).toEqual(['공개답안 · FL', '일반등급 예제']);
    expect(groups[0].rows.map((r) => r.set.id)).toEqual(['a', 'b']);
    expect(groups[1].rows.map((r) => r.set.id)).toEqual(['c', 'd']);
  });

  it('빈 입력은 빈 목록이다', () => {
    expect(groupSets([])).toEqual([]);
  });
});

describe('productSets — 현재 제품의 세트만', () => {
  const sets = [
    { id: 'i1', certification: 'ISTQB' },
    { id: 'c1', certification: 'CSTS' },
    { id: 'i2', certification: 'ISTQB' },
    { id: 'c2', certification: 'CSTS' },
  ];

  it('index.json의 대소문자와 상관없이(소문자 제품 키와 비교) 같은 제품만 순서대로 고른다', () => {
    expect(productSets(sets, 'istqb').map((s) => s.id)).toEqual(['i1', 'i2']);
    expect(productSets(sets, 'csts').map((s) => s.id)).toEqual(['c1', 'c2']);
  });

  it('데이터가 아직 없거나 제품을 고르기 전이면 빈 목록이다(예외 없이)', () => {
    expect(productSets(null, 'istqb')).toEqual([]);
    expect(productSets(undefined, 'istqb')).toEqual([]);
    expect(productSets(sets, null)).toEqual([]);
    expect(productSets(sets, '')).toEqual([]);
  });

  it('모르는 제품은 아무 세트와도 맞지 않는다', () => {
    expect(productSets(sets, 'other')).toEqual([]);
  });

  it('입력을 바꾸지 않고 항목을 그대로(같은 참조로) 돌려준다', () => {
    const before = [...sets];
    const picked = productSets(sets, 'csts');
    expect(sets).toEqual(before);
    expect(picked[0]).toBe(sets[1]);
  });
});

describe('풀이 진행 — 연습·시험 답안만 문항 id 기준으로 센다', () => {
  const SET = 'CSTS-EL-2018';

  it('연습과 시험에서 같은 문항을 풀어도 한 번만 센다', () => {
    const answers = {
      [`${SET}-practice-${SET}-001`]: ['a'],
      [`${SET}-exam-${SET}-001`]: ['b'],
      [`${SET}-exam-${SET}-002`]: ['c'],
    };
    expect(solvedQuestionIds(answers, SET).size).toBe(2);
    expect(solvedCountForSet(answers, SET)).toBe(2);
  });

  it('오답·랜덤·퀵 답안은 세지 않는다(같은 문항을 다시 풀거나 표본이다)', () => {
    const answers = {
      [`${SET}-review-${SET}-001`]: ['a'],
      [`${SET}-random-${SET}-001`]: ['a'],
      [`QUICK-quick-${SET}-001`]: ['a'],
    };
    expect(solvedCountForSet(answers, SET)).toBe(0);
  });

  it('다른 세트의 답안은 세지 않는다(세트 id가 접두 관계여도)', () => {
    const answers = {
      ['A-practice-A-001']: ['a'],
      ['AB-practice-AB-001']: ['a'],
    };
    expect(solvedCountForSet(answers, 'A')).toBe(1);
  });

  it('빈 답(서답형을 지운 뒤)은 세지 않는다', () => {
    const answers = { [`${SET}-practice-${SET}-001`]: ['  '], [`${SET}-practice-${SET}-002`]: [] };
    expect(solvedCountForSet(answers, SET)).toBe(0);
  });

  it('분자는 분모를 넘지 않는다(문항이 줄어든 데이터에 옛 답안이 남은 경우)', () => {
    const answers = {
      [`${SET}-practice-${SET}-001`]: ['a'],
      [`${SET}-practice-${SET}-002`]: ['a'],
      [`${SET}-practice-${SET}-003`]: ['a'],
    };
    expect(solvedCountForSet(answers, SET, 2)).toBe(2);
  });
});

describe('진행 문구·막대', () => {
  it('풀이 전/후 문구', () => {
    expect(setProgressText(0, 70)).toBe('70문항 · 풀이 전');
    expect(setProgressText(12, 70)).toBe('12 / 70 풀이');
  });

  it('문항 수를 모르면 분모 없이 말한다', () => {
    expect(setProgressText(0, undefined)).toBe('풀이 전');
    expect(setProgressText(5, undefined)).toBe('5문항 풀이');
  });

  it('막대 폭은 0~100으로 자른다', () => {
    expect(setProgressPercent(12, 70)).toBe(17);
    expect(setProgressPercent(0, 70)).toBe(0);
    expect(setProgressPercent(99, 70)).toBe(100);
    expect(setProgressPercent(3, undefined)).toBe(0);
    expect(setProgressPercent(3, 0)).toBe(0);
  });
});
