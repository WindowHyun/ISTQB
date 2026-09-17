import { describe, it, expect } from 'vitest';
import { isQuestionCorrect, isAnswered, matchesShortAnswer, normalizeText } from './answer';

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

// 수치 답의 단위 표기 — 원본 공개답안이 "50%"·"4개"처럼 단위를 붙여 적어 둔 탓에,
// 값을 맞게 쓰고도 단위를 안 붙였다는 이유로 오답이 나던 구간.
describe('동등분할: 수치 답의 단위 표기', () => {
  it.each([
    ['퍼센트를 생략', '50', ['50%']],
    ['퍼센트를 붙임', '50%', ['50%']],
    ['전각 퍼센트', '50％', ['50%']],
    ['개수 단위를 생략', '4', ['4개']],
    ['개수 단위를 붙임', '4개', ['4개']],
    ['날짜 단위를 생략', '17', ['17일']],
    ['소수 + 퍼센트 생략', '98.2', ['0.982', '98.2%', '982/1000']],
    ['소수 표기 그대로', '0.982', ['0.982', '98.2%', '982/1000']],
    ['분수 표기 그대로', '982/1000', ['0.982', '98.2%', '982/1000']],
  ])('%s: "%s"', (_label, input, answer) => {
    expect(correct(input, answer as string[])).toBe(true);
  });

  it('값이 다르면 단위를 맞춰도 오답이다', () => {
    expect(correct('60', ['50%'])).toBe(false);
    expect(correct('60%', ['50%'])).toBe(false);
    expect(correct('5개', ['4개'])).toBe(false);
  });

  // 단위 흡수를 "숫자면 무조건 같다"로 넓히면 채점이 무의미해진다 — 경계를 못 박는다.
  it('서로 다른 단위를 붙인 입력은 인정하지 않는다', () => {
    expect(correct('50개', ['50%'])).toBe(false);
    expect(correct('4%', ['4개'])).toBe(false);
    expect(correct('17개', ['17일'])).toBe(false);
  });

  it('수치가 아닌 답은 종전대로 완전일치만 인정한다', () => {
    expect(correct('구조', ['구조기반'])).toBe(false);
    expect(correct('50', ['테스트 계획서'])).toBe(false);
    expect(correct('0.982', ['982/1000'])).toBe(false); // 분수는 수치 꼴이 아니다
  });

  it('부호·지수 표기는 수치로 보지 않는다(정답키가 그런 꼴로 들어올 일이 없다)', () => {
    expect(correct('-50', ['50%'])).toBe(false);
    expect(correct('5e1', ['50%'])).toBe(false);
    expect(correct('+50', ['50%'])).toBe(false);
  });

  it('선행 0·소수점 꼬리 차이는 같은 값으로 본다', () => {
    expect(correct('050', ['50%'])).toBe(true);
    expect(correct('50.0', ['50%'])).toBe(true);
  });
});

// matchesShortAnswer의 경계 — 단위 흡수가 "숫자면 같다"로 새지 않는지 직접 고정한다.
// isQuestionCorrect를 통해서만 보면 이 방어들은 뮤테이션에 살아남는다(호출부가 이미 막으므로
// 지워도 결과가 같아 보인다) — shortAnswerCandidates를 export한 것과 같은 이유다.
describe('matchesShortAnswer — 흡수 경계', () => {
  it('빈 후보는 어떤 입력과도 맞지 않는다', () => {
    expect(matchesShortAnswer('', '')).toBe(false);
    expect(matchesShortAnswer('   ', '')).toBe(false);
    expect(matchesShortAnswer('', '50')).toBe(false);
  });

  it('배정밀도로 표현할 수 없이 큰 값은 같다고 보지 않는다', () => {
    // 둘 다 Number()로는 Infinity가 된다 — 유한성 검사가 없으면 서로 다른 값이 같아진다.
    const got = `1${'0'.repeat(400)}`;
    expect(matchesShortAnswer(`5${'0'.repeat(400)}%`, got)).toBe(false);
  });

  it('전각·한글 퍼센트는 %와 같은 단위로 접히되, 다른 단위와 섞이지 않는다', () => {
    expect(correct('50', ['50％'])).toBe(true);
    expect(correct('50%', ['50％'])).toBe(true);
    expect(correct('50개', ['50％'])).toBe(false);
    expect(correct('50개', ['50퍼센트'])).toBe(false);
  });
});
