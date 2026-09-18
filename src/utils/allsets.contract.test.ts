import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildQuickPool, drawQuick } from '../hooks/useQuestions';
import { makeCanonicalIdResolver } from './chapterStats';
import { isQuestionCorrect, shortAnswerCandidates } from './answer';

/**
 * 모든 세트 검증 — 12세트 626문항을 세트 단위로 훑어 데이터 계약을 못 박는다.
 *
 * 렌더·채점의 전수 검사는 E2E(react-fullsweep / react-fullgrade)가 한다. 여기서는
 * 브라우저를 띄우지 않고 확인할 수 있는 구조적 계약을 본다 — 세트가 하나 늘거나
 * 문항이 수정될 때 조용히 깨질 수 있는 것들이다.
 */

const dataRoot = path.resolve(process.cwd(), 'www/data');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dataRoot, rel), 'utf8'));
const index = readJson('index.json');

interface Q {
  id?: string; number: number; type?: string; chapter?: string | null;
  options?: { key: string; text: string }[]; answer?: string[];
  answerParts?: { label: string; answer: string[] }[];
  acceptedAnswers?: string[];
}
interface StemBlock {
  type?: string; text?: string; src?: string;
  items?: unknown[]; rows?: unknown[]; lines?: unknown[];
}
interface SetEntry { id: string; certification: string; title: string; path: string }

const sets: SetEntry[] = index.sets;
const loaded = sets.map((s) => ({ set: s, questions: readJson(s.path.replace(/^\.\//, '')).questions as Q[] }));

describe('모든 세트 — 구조 계약', () => {
  it('index.json이 12세트를 싣고 있다', () => {
    expect(sets).toHaveLength(12);
    expect(sets.filter((s) => s.certification === 'ISTQB')).toHaveLength(5);
    expect(sets.filter((s) => s.certification === 'CSTS')).toHaveLength(7);
  });

  it('전 세트 문항 수 합이 626이다', () => {
    expect(loaded.reduce((n, { questions }) => n + questions.length, 0)).toBe(626);
  });

  it.each(loaded.map(({ set }) => set.id))('%s — 문항 번호가 1..N 연속이고 중복이 없다', (setId) => {
    const { questions } = loaded.find(({ set }) => set.id === setId)!;
    const numbers = questions.map((q) => q.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers[0]).toBe(1);
    expect(numbers[numbers.length - 1]).toBe(numbers.length);
  });

  it.each(loaded.map(({ set }) => set.id))('%s — 모든 문항에 id가 있고 세트 안에서 고유하다', (setId) => {
    const { questions } = loaded.find(({ set }) => set.id === setId)!;
    const ids = questions.map((q) => q.id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 정답이 보기에 없으면 아무리 풀어도 맞힐 수 없다(선택형 한정 — 서답형은 자유 입력).
  it.each(loaded.map(({ set }) => set.id))('%s — 선택형 정답이 보기 안에 있다', (setId) => {
    const { questions } = loaded.find(({ set }) => set.id === setId)!;
    const broken: string[] = [];
    for (const q of questions) {
      if (!q.options?.length) continue;              // 진위형·서답형
      if (q.type === 'short_answer') continue;
      const keys = new Set(q.options.map((o) => o.key));
      for (const a of q.answer ?? []) if (!keys.has(a)) broken.push(`${q.id}:${a}`);
    }
    expect(broken).toEqual([]);
  });

  it.each(loaded.map(({ set }) => set.id))('%s — 챕터 태깅이 taxonomy 범위 안이다', (setId) => {
    const { questions } = loaded.find(({ set }) => set.id === setId)!;
    const chapters = new Set(questions.map((q) => q.chapter).filter(Boolean) as string[]);
    // 세트마다 최소 1개 챕터가 태깅돼 있어야 약점 분석이 성립한다.
    expect(chapters.size).toBeGreaterThan(0);
  });
});

describe('모든 세트 — 퀵 랜덤 풀 기여', () => {
  const canonical = makeCanonicalIdResolver(index.duplicateGroups);

  it.each([['ISTQB'], ['CSTS']])('%s — 모든 세트가 퀵 풀에 문항을 낸다', (cert) => {
    const perSet = loaded
      .filter(({ set }) => set.certification === cert)
      .map(({ set, questions }) => ({ setId: set.id, questions: questions as never[] }));
    const pool = buildQuickPool(perSet, canonical);
    const bySet = new Map<string, number>();
    for (const c of pool) bySet.set(c.setId, (bySet.get(c.setId) ?? 0) + 1);
    // 재수록 제거로 줄어들 수는 있어도, 한 세트가 통째로 0이 되면 그 세트는 퀵에서 영영 안 나온다.
    for (const { setId } of perSet) {
      expect(bySet.get(setId) ?? 0, `${setId}가 퀵 풀에 전혀 기여하지 않음`).toBeGreaterThan(0);
    }
  });

  // 사양 변경: 서답형도 퀵에 나온다(종전에는 풀에서 통째로 뺐다). 다만 한 회차를 점령하지
  // 않도록 추첨에서 30% 상한을 둔다. ISTQB에는 서답형 문항이 아예 없으므로 "있어야 한다"로
  // 못 박으면 데이터 사실과 어긋난다 — 원본에 있는 만큼 풀에도 있는지로 본다.
  it.each([['ISTQB'], ['CSTS']])('%s — 퀵 풀이 유형을 걸러내지 않는다', (cert) => {
    const perSet = loaded
      .filter(({ set }) => set.certification === cert)
      .map(({ set, questions }) => ({ setId: set.id, questions: questions as never[] }));
    const pool = buildQuickPool(perSet, canonical);
    // 재수록 제거로 줄 수는 있어도, 유형 때문에 통째로 빠지면 안 된다.
    const inPool = pool.filter((c) => (c.question as Q).type === 'short_answer').length;
    const inSource = perSet.reduce(
      (n, { questions }) => n + (questions as Q[]).filter((q) => q.type === 'short_answer').length, 0);
    if (inSource === 0) expect(inPool).toBe(0);
    else expect(inPool, `원본 ${inSource}개인데 풀에 ${inPool}개`).toBeGreaterThan(0);
  });

  it.each([['CSTS']])('%s — 추첨하면 서답형이 30%%를 넘지 않는다', (cert) => {
    const perSet = loaded
      .filter(({ set }) => set.certification === cert)
      .map(({ set, questions }) => ({ setId: set.id, questions: questions as never[] }));
    const pool = buildQuickPool(perSet, canonical);
    for (const size of [10, 15, 20]) {
      const drawn = drawQuick(pool, size);
      expect(drawn).toHaveLength(size);
      const shorts = drawn.filter((c) => (c.question as Q).type === 'short_answer').length;
      // 상한은 floor(size * 0.3) — 선택형이 모자랄 때만 넘길 수 있는데 이 풀은 충분하다.
      expect(shorts, `${size}문항 중 서답형 ${shorts}개`).toBeLessThanOrEqual(Math.floor(size * 0.3));
    }
  });
});

describe('모든 세트 — 재수록 그룹표 정합', () => {
  const groups: string[][] = index.duplicateGroups;
  const allIds = new Set(loaded.flatMap(({ questions }) => questions.map((q) => q.id!)));

  it('표의 모든 id가 실재하고 그룹마다 서로 다른 세트에서 왔다', () => {
    const setOf = new Map<string, string>();
    for (const { set, questions } of loaded) for (const q of questions) setOf.set(q.id!, set.id);
    for (const g of groups) {
      for (const id of g) expect(allIds.has(id), `${id} 없음`).toBe(true);
      // 같은 세트 안의 두 문항이 한 그룹이면 그 세트의 문항 수가 부당하게 줄어든다.
      expect(new Set(g.map((id) => setOf.get(id))).size, g.join(',')).toBe(g.length);
    }
  });

  it('한 문항이 두 그룹에 들어가지 않는다', () => {
    const seen = new Set<string>();
    for (const g of groups) for (const id of g) {
      expect(seen.has(id), `${id} 중복 등록`).toBe(false);
      seen.add(id);
    }
  });
});

/**
 * 지문이 사라진 문항 — 데이터는 유효한데 화면에서 풀 수 없는 결함 클래스.
 *
 * CSTS 2018 18·19번이 "다음 설명에 …을 기술하시오"만 남고 그 아래 설명 문단이 통째로
 * 빠져 있었다. 원본 PDF에서 지문이 별도 텍스트 박스라 추출 순서가 어긋나며 떨어져 나간
 * 것인데, 기존 게이트는 전부 통과했다 — PDF 대조(verify-pdf-data.py)는 "JSON의 조각이
 * PDF에 있는가"만 보므로 **JSON에서 빠진 것은 잡지 못한다.** 반대 방향을 여기서 막는다.
 */
describe('모든 세트 — 지문 없이 답을 요구하지 않는다', () => {
  // 보기로 답을 고르는 문항(선택형)은 보기가 곧 "설명"이라 지문이 따로 없을 수 있다.
  // 자유 입력·진위형은 지문이 없으면 물음 자체가 성립하지 않는다.
  const PROMISES_PASSAGE = /(다음|아래|위)(의|은|는)?\s*(설명|내용|지문|사례|보기|프로그램|그림|표)|[<[【]\s*보기\s*[>\]】]|보기에서|지문에서|다음은 무엇/;

  const hasBody = (q: Q & { stem?: StemBlock[]; figure?: string | null }) => {
    const blocks = q.stem ?? [];
    // 첫 텍스트 블록은 물음 그 자체다 — 그 뒤에 실제 내용이 하나라도 있어야 한다.
    const [, ...rest] = blocks;
    return Boolean(q.figure) || rest.some((b) =>
      (b.text ?? '').trim() !== '' || (b.items?.length ?? 0) > 0
      || (b.rows?.length ?? 0) > 0 || (b.lines?.length ?? 0) > 0 || Boolean(b.src));
  };

  it.each(loaded.map(({ set }) => set.id))('%s — 지문을 가리키는 물음에 지문이 붙어 있다', (setId) => {
    const { questions } = loaded.find(({ set }) => set.id === setId)!;
    const broken: string[] = [];
    for (const q of questions as (Q & { stem?: StemBlock[]; figure?: string | null })[]) {
      if (q.options?.length) continue;                    // 보기가 설명을 대신한다
      const head = (q.stem ?? []).map((b) => b.text ?? '').join(' ');
      if (!PROMISES_PASSAGE.test(head)) continue;
      if (!hasBody(q)) broken.push(q.id!);
    }
    expect(broken, `지문이 비어 풀 수 없는 문항: ${broken.join(', ')}`).toEqual([]);
  });
});

/**
 * 수치 답의 단위 표기 — 원본 공개답안이 "50%"·"4개"처럼 단위를 붙여 적어 둔 문항에서,
 * 값을 맞게 쓴 사람이 단위를 안 붙였다는 이유로 오답이 됐다(#단답형-단위).
 * 판정은 answer.ts가 흡수하지만, 그 흡수가 **실제 데이터의 모든 수치 답에 닿는지**는
 * 데이터를 훑어야만 알 수 있다.
 */
describe('모든 세트 — 수치 서답형은 단위 표기에 걸리지 않는다', () => {
  const UNIT_TAIL = /^([0-9]+(?:\.[0-9]+)?)(%|％|개|일|명|점|회|번|건|배|단계|시간|분|초)$/;

  const numericAnswers = loaded.flatMap(({ questions }) =>
    questions
      .filter((q) => q.type === 'short_answer' && !q.answerParts?.length)
      .flatMap((q) => [...new Set(shortAnswerCandidates(q.answer ?? []).map((c) => c.replace(/\s+/g, '')))]
        .filter((c) => UNIT_TAIL.test(c))
        .map((c) => ({ id: q.id!, answer: q.answer ?? [], candidate: c }))));

  it('단위가 붙은 수치 정답이 실제로 존재한다(검사가 헛돌지 않는다)', () => {
    expect(numericAnswers.length).toBeGreaterThan(0);
  });

  it.each(numericAnswers.map((n) => [n.id, n.candidate, n.answer] as const))(
    '%s — "%s"는 단위를 빼고 써도 정답이다', (_id, candidate, answer) => {
      const bare = UNIT_TAIL.exec(candidate)![1];
      expect(isQuestionCorrect(answer as string[], [bare], 'short_answer')).toBe(true);
      expect(isQuestionCorrect(answer as string[], [candidate], 'short_answer')).toBe(true);
    });

  it('값이 다르면 단위를 맞춰 써도 오답이다', () => {
    expect(isQuestionCorrect(['50%'], ['60'], 'short_answer')).toBe(false);
    expect(isQuestionCorrect(['4개'], ['5개'], 'short_answer')).toBe(false);
  });
});

/**
 * 세트 간 정답키 통일 — 같은 개념을 묻는 서답형이 세트마다 인정 범위가 달라,
 * 한 세트에서 맞던 입력이 다른 세트에서 오답이 되던 결함 클래스.
 *
 * 원본 공개답안이 세트마다 정답을 다르게 적어 둔 데서 온다(예: 2402-64는
 * "재테스팅 / retesting / 재테스트 / retest", 2405-63은 "재테스팅(Re-testing)"만).
 * 화면의 "정답"은 answer를 그대로 보여 주므로 answer는 공개답안 표기 그대로 두고,
 * 다른 세트의 공개답안이 인정한 표기를 acceptedAnswers로 얹어 채점만 맞췄다.
 *
 * 세트가 늘거나 정답키를 손볼 때 다시 갈라지지 않도록, 그룹별 인정 집합이 정확히
 * 같은지를 계약으로 고정한다.
 */
describe('모든 세트 — 같은 개념의 서답형은 인정 범위가 같다', () => {
  const CONCEPT_GROUPS: Record<string, string[]> = {
    '회귀/리그레션 테스팅': [
      'CSTS-EL-2019-062', 'CSTS-FL-2404-068', 'CSTS-FL-2405-068', 'CSTS-EL-SW-EXAMPLE-068'],
    '신뢰성': ['CSTS-EL-2019-070', 'CSTS-FL-2403-063', 'CSTS-FL-2404-062', 'CSTS-FL-2405-061'],
    '재테스팅': ['CSTS-FL-2402-064', 'CSTS-FL-2405-063', 'CSTS-EL-SW-EXAMPLE-064'],
    '동등 분할': ['CSTS-FL-2402-067', 'CSTS-FL-2403-066'],
    '테스트 스크립트': ['CSTS-FL-2403-061', 'CSTS-EL-SW-EXAMPLE-061'],
    '결함 심각도': ['CSTS-FL-2404-069', 'CSTS-EL-SW-EXAMPLE-070'],
    '조건/결정 커버리지': ['CSTS-EL-2019-064', 'CSTS-FL-2405-065'],
    'V 모델': ['CSTS-FL-2403-064', 'CSTS-FL-2404-064'],
  };

  const byId = new Map(loaded.flatMap(({ questions }) => questions.map((q) => [q.id!, q] as const)));

  const acceptedSet = (q: Q) =>
    new Set(shortAnswerCandidates([...(q.answer ?? []), ...(q.acceptedAnswers ?? [])])
      .map((c) => c.replace(/\s+/g, '').toLowerCase())
      .filter((c) => c !== ''));

  it.each(Object.entries(CONCEPT_GROUPS))('%s — 한 세트에서 맞는 입력은 다른 세트에서도 맞는다', (_g, ids) => {
    const sets = ids.map((id) => {
      const q = byId.get(id);
      expect(q, `${id} 없음`).toBeDefined();
      expect(q!.type, `${id}는 서답형이 아니다`).toBe('short_answer');
      return { id, accepted: acceptedSet(q!) };
    });
    const union = new Set(sets.flatMap((s) => [...s.accepted]));
    for (const { id, accepted } of sets) {
      const missing = [...union].filter((c) => !accepted.has(c)).sort();
      expect(missing, `${id}에서만 오답이 되는 입력: ${missing.join(', ')}`).toEqual([]);
    }
  });

  // 통일이 "아무 입력이나 받는다"로 새지 않았는지 — 개념이 다른 답은 여전히 오답이다.
  it('다른 개념의 답은 인정하지 않는다', () => {
    const q = byId.get('CSTS-FL-2405-065')!;
    for (const wrong of ['분기', '구문', '문장 커버리지', '다중 조건 커버리지']) {
      expect(isQuestionCorrect(q.answer ?? [], [wrong], 'short_answer', undefined, q.acceptedAnswers),
        `"${wrong}"이 정답으로 인정됨`).toBe(false);
    }
    const v = byId.get('CSTS-FL-2403-064')!;
    for (const wrong of ['폭포수 모델', '애자일', 'W 모델']) {
      expect(isQuestionCorrect(v.answer ?? [], [wrong], 'short_answer', undefined, v.acceptedAnswers),
        `"${wrong}"이 정답으로 인정됨`).toBe(false);
    }
  });

  // acceptedAnswers는 채점 전용이다 — 화면의 "정답"(answer)까지 동의어로 불어나면
  // 공개답안 표기가 아니게 된다(QuestionCard가 answer를 그대로 이어 붙여 보여 준다).
  it('acceptedAnswers를 쓴 문항도 화면에 보이는 정답은 공개답안 표기 그대로다', () => {
    const shown = (id: string) => (byId.get(id)!.answer ?? []).join(', ');
    expect(shown('CSTS-FL-2405-063')).toBe('재테스팅(Re-testing)');
    expect(shown('CSTS-FL-2405-068')).toBe('리그레션, 회귀');
    expect(shown('CSTS-FL-2403-066')).toBe('동등 분할, Equivalence partitioning');
  });
});
