import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildQuickPool } from '../hooks/useQuestions';
import { makeCanonicalIdResolver } from './chapterStats';

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

  it.each([['ISTQB'], ['CSTS']])('%s — 퀵 풀이 그 자격증 전 세트를 담는다', (cert) => {
    // 퀵은 무한 모드라 "한 회차에 몇 개"라는 상한이 없다. 대신 지켜야 할 계약은
    // "그 자격증의 모든 세트가 출제 대상에 들어간다"이다 — 한 세트라도 빠지면
    // 그 세트 문항은 퀵에서 영영 나오지 않는다.
    const entries = loaded.filter(({ set }) => set.certification === cert);
    const perSet = entries.map(({ set, questions }) => ({ setId: set.id, questions: questions as never[] }));
    const pool = buildQuickPool(perSet, canonical);
    expect(new Set(pool.map((c) => c.setId)).size).toBe(entries.length);
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
