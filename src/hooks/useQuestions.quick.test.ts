import { afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildQuickPool, shuffleQuestions, type Question } from './useQuestions';
import { makeCanonicalIdResolver } from '../utils/chapterStats';

/**
 * shuffleQuestions는 Math.random을 쓴다. 시드를 고정하지 않으면 순서에 기대는 검사가 흔들린다.
 *
 * 실측: 서답형 8·선택형 8에서 10개를 뽑으면 서답형이 3개 나올 확률 99.65%,
 *       2개 나올 확률 0.35%다(20만 회 측정). 선택형이 8개뿐이라 10개를 채우려면
 *       서답형이 최소 2개 필요한데, 상한(3)에 걸리는 세 번째 서답형을 만나기 전에
 *       picked가 10에 도달하면 2개로 끝나기 때문이다.
 *
 * 285회에 1회꼴이라 `npm test`로는 거의 보이지 않았지만, 뮤테이션 테스트는 뮤턴트마다
 * 스위트를 돌리므로 반드시 걸린다 — 실제로 Stryker 초기 실행이 이걸로 멈췄다.
 * 시드를 고정해 결정적으로 만든다(useQuestions.draw.test.ts와 같은 절차).
 */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => vi.restoreAllMocks());

const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  number: Number(id.replace(/\D/g, '')) || 1,
  type: 'multiple_choice',
  stem: '',
  options: [{ key: 'a', text: '' }, { key: 'b', text: '' }],
  answer: ['a'],
  ...over,
});

describe('buildQuickPool', () => {
  const identity = (id: string) => id;

  it('전 세트의 문항을 모으고 출처 세트를 함께 남긴다', () => {
    const pool = buildQuickPool(
      [
        { setId: 'S1', questions: [q('A-1'), q('A-2')] },
        { setId: 'S2', questions: [q('B-1')] },
      ],
      identity,
    );
    expect(pool.map((c) => [c.id, c.setId])).toEqual([['A-1', 'S1'], ['A-2', 'S1'], ['B-1', 'S2']]);
  });

  // 서답형도 퀵에 그대로 나온다. 무한 모드가 되면서 유형 상한 자체가 없어졌다 —
  // 입력에 시간이 걸리는 것은 여전하므로 한 회차를 점령하지 않게 상한만 둔다.
  it('유형을 가리지 않는다 — 서답형도 풀에 넣는다', () => {
    const pool = buildQuickPool(
      [{ setId: 'S1', questions: [q('A-1'), q('A-2', { type: 'short_answer' }), q('A-3', { type: 'true_false' })] }],
      identity,
    );
    expect(pool.map((c) => c.id)).toEqual(['A-1', 'A-2', 'A-3']);
  });

  it('출제 순서는 풀을 통째로 담는다 — 잘라 내지 않는다', () => {
    // 무한 모드의 계약: 커서 하나로 "같은 문제가 두 번 나오지 않음"을 보장하려면
    // 순서 목록이 풀 전체여야 한다. 앞에서 N개만 잘라 내면 그 보장이 깨진다.
    const pool = buildQuickPool(
      [{ setId: 'S1', questions: [q('a1'), q('a2'), q('a3'), q('a4'), q('a5')] }],
      (id) => id,
    );
    vi.spyOn(Math, 'random').mockImplementation(seeded(7));
    const order = shuffleQuestions(pool);
    expect(order).toHaveLength(pool.length);
    expect(new Set(order.map((c) => c.id))).toEqual(new Set(pool.map((c) => c.id)));
  });

  it('서답형에 상한을 두지 않는다 — 회차가 없으니 비율을 맞출 대상도 없다', () => {
    // 종전에는 한 회차의 30%까지만 서답형을 넣었다. 무한 모드에서 그 상한을 유지하면
    // 앞쪽이 선택형으로만 채워져 서답형은 한참 뒤에야 나오거나 영영 안 나온다.
    const shorts = Array.from({ length: 8 }, (_, i) => q(`s${i}`, { type: 'short_answer' }));
    const pool = buildQuickPool([{ setId: 'S1', questions: shorts }], (id) => id);
    vi.spyOn(Math, 'random').mockImplementation(seeded(3));
    const order = shuffleQuestions(pool);
    expect(order.filter((c) => c.question.type === 'short_answer')).toHaveLength(8);
  });

  it('재수록 그룹은 한 번만 넣는다 — 먼저 만난 세트의 것을 쓴다', () => {
    const canonical = makeCanonicalIdResolver([['A-1', 'B-1', 'C-1']]);
    const pool = buildQuickPool(
      [
        { setId: 'S1', questions: [q('A-1')] },
        { setId: 'S2', questions: [q('B-1'), q('B-2')] },
        { setId: 'S3', questions: [q('C-1')] },
      ],
      canonical,
    );
    expect(pool.map((c) => c.id)).toEqual(['A-1', 'B-2']);
  });

  it('그룹 표가 없으면 id 기준으로만 중복을 막는다(표를 못 읽은 초기 렌더)', () => {
    const pool = buildQuickPool(
      [{ setId: 'S1', questions: [q('A-1')] }, { setId: 'S2', questions: [q('A-1')] }],
      makeCanonicalIdResolver(undefined),
    );
    expect(pool).toHaveLength(1);
  });
});

// 실제 데이터로 확인한다 — 합성 입력만으로는 "제품 전체에서 20문항을 뽑을 수 있는가"나
// "중복 제거 후에도 풀이 충분한가" 같은 실사용 전제가 검증되지 않는다.
describe('buildQuickPool — 실제 문항 데이터', () => {
  const dataRoot = path.resolve(process.cwd(), 'www/data');
  const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dataRoot, rel), 'utf8'));
  const index = readJson('index.json');
  const canonical = makeCanonicalIdResolver(index.duplicateGroups);

  const poolFor = (cert: string) =>
    buildQuickPool(
      index.sets
        .filter((s: { certification: string }) => s.certification === cert)
        .map((s: { id: string; path: string }) => ({
          setId: s.id,
          questions: readJson(s.path.replace(/^\.\//, '')).questions,
        })),
      canonical,
    );

  it.each([['ISTQB'], ['CSTS']])('%s 풀이 한 세션으로 다 못 풀 만큼 크다', (cert) => {
    expect(poolFor(cert).length).toBeGreaterThan(100);
  });

  // ISTQB에는 서답형 문항이 아예 없으므로 "있어야 한다"로 못 박으면 데이터 사실과 어긋난다.
  it.each([['ISTQB'], ['CSTS']])('%s 풀이 유형 때문에 문항을 빼지 않는다', (cert) => {
    const inPool = poolFor(cert).filter((c) => c.question.type === 'short_answer').length;
    const inSource = cert === 'CSTS' ? 1 : 0; // CSTS에는 서답형이 있고 ISTQB에는 없다
    if (inSource === 0) expect(inPool).toBe(0);
    else expect(inPool).toBeGreaterThan(0);
  });

  it.each([['ISTQB'], ['CSTS']])('%s 풀에 같은 문제가 두 번 들어가지 않는다', (cert) => {
    const pool = poolFor(cert);
    const keys = pool.map((c) => canonical(c.id));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('여러 세트에서 고루 뽑힌다 — 한 세트로 쏠리면 전 세트 출제가 아니다', () => {
    const bySet = new Set(poolFor('CSTS').map((c) => c.setId));
    expect(bySet.size).toBeGreaterThan(1);
  });
});
