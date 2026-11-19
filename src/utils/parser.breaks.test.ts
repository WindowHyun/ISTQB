import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mergeTextContinuations, proseLines } from './parser';

/**
 * 렌더러가 넣는 줄바꿈 — 626문항 전수 대조.
 *
 * `splitStructuralMarkers`·`splitKnownSectionHeadings`는 지문 문자열을 줄로 쪼갠다. 규칙이 문맥을
 * 보지 않으면 **문장 한가운데서 줄이 바뀌거나 문장 끝의 숫자가 굵은 목록 번호가 된다.** 실제로
 * 그랬다(데이터는 멀쩡했고 렌더러가 깨뜨렸다):
 *   - "…81, 90, 91, 100. 테스트 케이스는…"  → '100.'이 목록 마커가 돼 줄이 끊김(ISTQB A#21·B#21)
 *   - "당신의 팀은 3점 추정 기법을…"          → "당신의 팀은 / 3점 추정 기법을…"(A#32 외 5곳)
 *   - "그리고 다음과 같은 완화 활동이 있다."   → '그리고'만 고아 줄로 남음(B#34 · D#4)
 *
 * 이 결함은 어떤 게이트에도 걸리지 않았다(PDF 대조는 공백과 줄바꿈을 지우고 비교한다). 그래서
 * 여기서 **렌더러가 넣은 모든 줄바꿈이 어디서 일어나는지를 값으로 고정한다.** 규칙을 추가하거나
 * 넓히면 이 검사가 먼저 답한다 — 줄머리가 구조 표지가 아니고 앞 줄이 문장·항목을 끝낸 것도 아니면
 * 문장 중간 줄바꿈이므로, 규칙을 좁히거나 아래 ALLOWED에 근거와 함께 적는다.
 *
 * 입력은 렌더러와 같은 경로다 — 블록 배열은 조각을 먼저 이어 붙인 뒤(mergeTextContinuations) 문단마다
 * 한 문자열로 `proseLines`에 들어간다.
 */

const dataRoot = path.resolve(process.cwd(), 'www/data');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dataRoot, rel), 'utf8'));
const index = readJson('index.json');

interface Q { number: number; stem?: unknown; explanation?: unknown; options?: { text?: unknown }[] }
type Block = { type?: string; text?: string };

function paragraphTexts(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (!Array.isArray(v)) return [];
  return (mergeTextContinuations(v as never[]) as Block[])
    .filter((b) => (b.type === 'paragraph' || b.type === 'formula') && typeof b.text === 'string')
    .map((b) => b.text as string);
}

const corpus: { at: string; text: string }[] = [];
for (const set of index.sets as { id: string; path: string }[]) {
  const questions = readJson(set.path.replace(/^\.\//, '')).questions as Q[];
  for (const q of questions) {
    for (const t of [...paragraphTexts(q.stem), ...paragraphTexts(q.explanation)]) {
      corpus.push({ at: `${set.id}#${q.number}`, text: t });
    }
  }
}

/** 줄머리가 구조 표지인가 — 보기·번호·글머리표·로마 숫자와 "키: 값" 기록 항목. */
const STRUCTURAL_HEAD =
  /^(?:\d+\.|[A-Ea-e][.)]|[가-차]\.|•|(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.|따라서:|Given:|When:|Then:|And:|AC\d+:|(?:결함 ID|제목|애플리케이션|결함|재현 절차|심각도|우선순위|환경|설명|첨부파일|인수 조건):)/i;
/** 앞 줄이 문장·항목을 끝냈는가 — 마침표류로 끝났거나 글머리표·보기 항목 줄이다. */
const ENDED = (prev: string) =>
  /[.?!:)\]”"」』…。]$/.test(prev) || /^\s*•/.test(prev) || /^(?:[a-e]\)|(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.)/i.test(prev);

/**
 * 구조 표지도 아니고 앞 줄이 끝나지도 않았는데 줄이 바뀌어도 되는 지점 — `"세트#번호"`.
 * 새 항목은 **데이터가 아니라 렌더러가 문장을 끊은 것인지** 먼저 확인하고 넣는다(끊은 것이면
 * 규칙을 좁히는 것이 맞다).
 */
const ALLOWED = new Set<string>([]);

describe('렌더러가 넣는 줄바꿈 — 전수', () => {
  it('626문항의 지문·해설 문단을 대상으로 검사한다(표본이 비면 검사가 헛돈다)', () => {
    expect(corpus.length).toBeGreaterThan(1400);
  });

  it('문장 한가운데서 줄이 바뀌지 않는다', () => {
    const bad: string[] = [];
    for (const { at, text } of corpus) {
      if (ALLOWED.has(at)) continue;
      const lines = proseLines(text);
      for (let i = 1; i < lines.length; i++) {
        const prev = lines[i - 1];
        const cur = lines[i];
        if (text.includes(`${prev}\n${cur}`)) continue; // 데이터가 이미 줄을 나눈 자리
        if (STRUCTURAL_HEAD.test(cur) || ENDED(prev)) continue;
        bad.push(`${at}: …${prev.slice(-24)} ⏎ ${cur.slice(0, 24)}…`);
      }
    }
    expect(bad, `렌더러가 문장 중간에서 줄을 바꿨다:\n${bad.join('\n')}`).toEqual([]);
  });

  // 문장 끝의 숫자("…91, 100.")를 번호 마커로 읽어 그 뒤를 굵은 목록으로 만들지 않는다.
  it('쉼표로 나열한 수 끝의 마침표는 목록 번호가 아니다', () => {
    const bad: string[] = [];
    for (const { at, text } of corpus) {
      const lines = proseLines(text);
      for (let i = 1; i < lines.length; i++) {
        if (/^\d+\.\s/.test(lines[i]) && /,$/.test(lines[i - 1])) bad.push(`${at}: …${lines[i - 1].slice(-20)} ⏎ ${lines[i].slice(0, 20)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  // 머리말만 고아 줄로 남지 않는다 — 한 단어짜리 줄은 목록 마커·"따라서:" 말고는 없어야 한다.
  it('머리말 앞의 접속사가 고아 줄로 남지 않는다', () => {
    const orphans: string[] = [];
    for (const { at, text } of corpus) {
      for (const line of proseLines(text)) if (/^(?:그리고|또한|그러나|따라서)$/.test(line)) orphans.push(`${at}: ${line}`);
    }
    expect(orphans).toEqual([]);
  });
});

describe('줄바꿈 규칙 — 경계 값', () => {
  it('짧은 머리말이 긴 머리말 안을 가르지 않는다(실데이터 B#34·D#4)', () => {
    expect(proseLines('그리고 다음과 같은 완화 활동이 있다.')).toEqual(['그리고 다음과 같은 완화 활동이 있다.']);
    expect(proseLines('그리고 다음과 같은 테스트 활동이 있다:')).toEqual(['그리고 다음과 같은 테스트 활동이 있다:']);
    // 짧은 머리말 단독은 여전히 줄머리가 된다.
    expect(proseLines('요약이다. 다음과 같은 완화 활동이 있다.')).toEqual(['요약이다.', '다음과 같은 완화 활동이 있다.']);
  });

  it('새 문장을 여는 어구는 문장·항목이 끝난 뒤에만 줄을 바꾼다', () => {
    // 같은 문장 안 — 끊지 않는다.
    expect(proseLines('당신의 팀은 3점 추정 기법을 사용해 추정하고 있다.')).toHaveLength(1);
    expect(proseLines('아래 그래프는 결함 수를 보여 준다.')).toHaveLength(1);
    expect(proseLines('주어진 결과를 바탕으로 다음 테스트 케이스를 결정한다.')).toHaveLength(1);
    expect(proseLines('추정된다면, 다음 중 영향도로 적절한 것은?')).toHaveLength(1);
    // 문장이 끝난 뒤 — 줄을 바꾼다.
    expect(proseLines('스토리를 분석한다. 다음 테스트 케이스 중 관련 없는 것은?')).toEqual(['스토리를 분석한다.', '다음 테스트 케이스 중 관련 없는 것은?']);
    // 글머리표 항목에 문장이 이어 붙은 경우 — 줄을 바꾼다.
    expect(proseLines('• D ≥ 65 경로 할인 적용 테스트 스위트에 이미 두(2)개가 있다.')).toEqual([
      '• D ≥ 65 경로 할인 적용',
      '테스트 스위트에 이미 두(2)개가 있다.',
    ]);
  });

  it('번호 마커는 쉼표 뒤에 오지 않지만 문장 뒤·줄머리에서는 그대로 선다', () => {
    expect(proseLines('값은 0, 50, 51, 100. 테스트 케이스는 여섯 개다.')).toHaveLength(1);
    expect(proseLines('다음을 고려한다. 1. 로그인 2. 결제')).toEqual(['다음을 고려한다.', '1. 로그인', '2. 결제']);
    expect(proseLines('1. 로그인')).toEqual(['1. 로그인']);
  });
});
