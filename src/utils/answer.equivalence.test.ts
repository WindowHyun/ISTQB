import { describe, it, expect } from 'vitest';
import { isQuestionCorrect, isAnswered, normalizeText } from './answer';

// 동등분할 — "같은 답으로 취급돼야 하는 입력들"을 한 묶음으로 보고 대표값을 찍는다.
// 기존 테스트는 정답 문자열을 그대로 넣는 경우만 다뤘다. 사람이 실제로 치는 입력은
// 공백·대소문자·전각·문장부호·조사가 제각각이라, 정답을 알고도 오답 처리되면
// 학습 도구로서 신뢰를 잃는다(반대로 너무 관대하면 채점이 무의미해진다).

const SA = 'short_answer';
const correct = (input: string, answer: string[]) => isQuestionCorrect(answer, [input], SA);

describe('동등분할: 정답으로 인정돼야 하는 변형', () => {
  const answer = ['구조기반', 'Structure-based Test'];

  it.each([
    ['정답 그대로', '구조기반'],
    ['앞뒤 공백', '  구조기반  '],
    ['가운데 공백', '구조 기반'],
    ['탭·줄바꿈', '\t구조기반\n'],
    ['영문 대안', 'Structure-based Test'],
    ['영문 소문자', 'structure-based test'],
    ['영문 대문자', 'STRUCTURE-BASED TEST'],
    ['영문 공백 제거', 'Structure-basedTest'],
  ])('%s: "%s"', (_label, input) => {
    expect(correct(input, answer)).toBe(true);
  });

  it('괄호 병기 표기는 본문·괄호 안 어느 쪽으로 써도 인정된다', () => {
    const a = ['로그(Log)'];
    expect(correct('로그(Log)', a)).toBe(true);
    expect(correct('로그', a)).toBe(true);
    expect(correct('Log', a)).toBe(true);
    expect(correct('log', a)).toBe(true);
  });

  it('콤마·슬래시·"또는"으로 묶인 허용답은 각각 인정된다', () => {
    const a = ['재테스팅 / retesting / 재테스트'];
    expect(correct('재테스팅', a)).toBe(true);
    expect(correct('retesting', a)).toBe(true);
    expect(correct('재테스트', a)).toBe(true);
  });
});

describe('동등분할: 오답으로 남아야 하는 입력', () => {
  const answer = ['구조기반'];

  it.each([
    ['빈 문자열', ''],
    ['공백만', '   '],
    ['탭만', '\t\n'],
    ['부분 문자열', '구조'],
    ['상위 문자열', '구조기반테스팅기법'],
    ['다른 답', '명세기반'],
    ['숫자', '123'],
  ])('%s: "%s" → 오답', (_label, input) => {
    expect(correct(input, answer)).toBe(false);
  });

  it('정답 후보가 비어 있는 손상 데이터에서 빈 입력이 정답이 되지 않는다', () => {
    expect(isQuestionCorrect([''], [''], SA)).toBe(false);
    expect(isQuestionCorrect([], [''], SA)).toBe(false);
    expect(isQuestionCorrect(['  '], ['  '], SA)).toBe(false);
  });
});

// 여기부터가 아직 아무도 안 본 구간 — 한국어 입력기가 실제로 만들어내는 변형들.
describe('동등분할: 한국어 입력 환경 변형', () => {
  const answer = ['구조기반'];

  it('전각 공백(U+3000)은 일반 공백처럼 제거된다', () => {
    // 한글 IME에서 흔히 섞여 들어간다. \s는 U+3000을 포함하므로 통과해야 한다.
    expect(correct('구조　기반', answer)).toBe(true);
  });

  it('제로폭 공백이 섞이면 어떻게 되는가', () => {
    // 웹에서 복사·붙여넣기하면 U+200B가 딸려 오는 일이 있다.
    // \s에 포함되지 않으므로 현재는 오답이다 — 기대를 명시해 동작을 고정한다.
    expect(correct('구조​기반', answer)).toBe(false);
  });

  it('영문 정답에 전각 영문자를 쓰면 오답이다(정규화 범위 밖)', () => {
    expect(correct('ＬＯＧ', ['로그(Log)'])).toBe(false);
  });

  it('normalizeText는 모든 공백류를 제거하고 소문자화만 한다', () => {
    expect(normalizeText(' A b\tC\nD　E ')).toBe('abcde');
    expect(normalizeText('')).toBe('');
    expect(normalizeText(undefined as unknown as string)).toBe('');
  });
});

describe('동등분할: 극단 입력에서 깨지지 않는다', () => {
  it('초장문 입력(10만자)에서도 판정이 끝난다', () => {
    const huge = '가'.repeat(100_000);
    expect(correct(huge, ['구조기반'])).toBe(false);
  });

  it('정규식 메타문자를 넣어도 예외가 나지 않는다', () => {
    for (const s of ['(', ')', '[', ']', '\\', '.*', '$^', '((((', '(?:']) {
      expect(() => correct(s, ['구조기반'])).not.toThrow();
    }
  });

  it('정답 문자열 자체에 메타문자가 있어도 처리된다', () => {
    expect(correct('a(b', ['a(b'])).toBe(true);
    expect(correct('C++', ['C++'])).toBe(true);
    expect(correct('c++', ['C++'])).toBe(true);
  });

  it('닫히지 않은 괄호가 있는 정답에서도 예외가 나지 않는다', () => {
    expect(() => correct('로그', ['로그(Log'])).not.toThrow();
  });
});

describe('동등분할: 다답형(answerParts) 부분 입력', () => {
  const parts = [
    { label: '가', answer: ['동등분할'] },
    { label: '나', answer: ['경계값분석'] },
  ];

  it('모든 칸이 맞아야 정답이다', () => {
    expect(isQuestionCorrect([], ['동등분할', '경계값분석'], SA, parts)).toBe(true);
  });

  it.each([
    ['첫 칸만', ['동등분할', '']],
    ['둘째 칸만', ['', '경계값분석']],
    ['칸 순서 바꿈', ['경계값분석', '동등분할']],
    ['둘 다 빈칸', ['', '']],
    ['칸 수 부족', ['동등분할']],
  ])('%s → 오답', (_label, selected) => {
    expect(isQuestionCorrect([], selected, SA, parts)).toBe(false);
  });

  it('부분 입력은 "답함"으로 세지 않는다(진행률 부풀림·미응답 경고 누락 방지)', () => {
    expect(isAnswered(['동등분할', ''], parts)).toBe(false);
    expect(isAnswered(['동등분할', '경계값분석'], parts)).toBe(true);
    expect(isAnswered(['  ', '경계값분석'], parts)).toBe(false); // 공백만 채운 칸
  });
});

describe('동등분할: 선택형 키 비교', () => {
  it('대소문자·순서는 무관하지만 개수는 일치해야 한다', () => {
    expect(isQuestionCorrect(['a', 'c'], ['C', 'A'])).toBe(true);
    expect(isQuestionCorrect(['a', 'c'], ['a'])).toBe(false);
    expect(isQuestionCorrect(['a'], ['a', 'c'])).toBe(false);
  });

  it('같은 키를 중복 제출하면 개수가 맞아도 오답이다', () => {
    expect(isQuestionCorrect(['a', 'c'], ['a', 'a'])).toBe(false);
  });

  it('정답 키가 손상된 문항은 오답 처리한다(빈 선택이 정답이 되지 않는다)', () => {
    expect(isQuestionCorrect([], [])).toBe(false);
    expect(isQuestionCorrect(undefined as unknown as string[], [])).toBe(false);
  });
});
