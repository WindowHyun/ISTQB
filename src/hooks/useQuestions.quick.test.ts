import { afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildQuickPool, drawQuick, type Question } from './useQuestions';
import { makeCanonicalIdResolver } from '../utils/chapterStats';

/**
 * drawQuick은 shuffleQuestions(= Math.random)를 거친다. 시드를 고정하지 않으면 아래
 * '상한만큼 들어간다' 검사가 추첨 순서에 따라 흔들린다.
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

  // 사양 변경: 서답형도 퀵에 나온다. 거르는 지점이 풀에서 추첨(drawQuick)으로 옮겨 갔다 —
  // 입력에 시간이 걸리는 것은 여전하므로 한 회차를 점령하지 않게 상한만 둔다.
  it('유형을 가리지 않는다 — 서답형도 풀에 넣는다', () => {
    const pool = buildQuickPool(
      [{ setId: 'S1', questions: [q('A-1'), q('A-2', { type: 'short_answer' }), q('A-3', { type: 'true_false' })] }],
      identity,
    );
    expect(pool.map((c) => c.id)).toEqual(['A-1', 'A-2', 'A-3']);
  });

  it('추첨은 서답형을 상한(30%)까지만 넣고 나머지는 선택형으로 채운다', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(7)); // 순서 의존 제거(위 seeded 주석)
    const questions = [
      ...Array.from({ length: 8 }, (_, i) => q(`S-${i}`, { type: 'short_answer' })),
      ...Array.from({ length: 8 }, (_, i) => q(`M-${i}`)),
    ];
    const drawn = drawQuick(buildQuickPool([{ setId: 'S1', questions }], identity), 10);
    expect(drawn).toHaveLength(10);
    // 정확히 3이어야 한다(서답형 8·선택형 8에서 10을 뽑으면 상한 floor(10*0.3)=3에 걸린다).
    // 상한만 보면(<=3) 서답형이 0개일 때도 통과하는데, 그건 '상한이 동작한다'가 아니라
    // 사양 변경 전의 '서답형을 통째로 뺀다'로 되돌아간 상태다 — 이 검사가 잡아야 할
    // 회귀가 바로 그것이라 상한으로는 무력하다.
    expect(drawn.filter((c) => c.question.type === 'short_answer').length,
      '서답형이 상한(3)만큼 들어가지 않았다 — 0이면 유형이 통째로 빠진 것이다').toBe(3);
  });

  // 선택형이 모자라면 문항 수를 줄이는 것보다 서답형으로 채우는 편이 낫다.
  it('선택형이 모자라면 상한을 넘겨서라도 문항 수를 채운다', () => {
    const questions = [
      ...Array.from({ length: 9 }, (_, i) => q(`S-${i}`, { type: 'short_answer' })),
      q('M-0'),
    ];
    const drawn = drawQuick(buildQuickPool([{ setId: 'S1', questions }], identity), 10);
    expect(drawn).toHaveLength(10);
    // 제목이 말하는 '상한을 넘겼다'를 직접 못 박는다 — 길이만 보면 상한(3)을 지키느라
    // 문항 수가 줄어드는 반대 동작과 구분되지 않는다(그때도 이 검사는 통과할 수 있다).
    expect(drawn.filter((c) => c.question.type === 'short_answer').length,
      '선택형이 1개뿐인데 서답형이 상한을 넘겨 채워지지 않았다').toBe(9);
  });

  // 재수록 문항은 세트마다 id가 다르다 — id 비교만으로는 걸러지지 않아,
  // 한 세션에 같은 문제가 두 번 나온다.
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

  it.each([['ISTQB'], ['CSTS']])('%s 풀이 최대 문항 수(20)보다 충분히 크다', (cert) => {
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
