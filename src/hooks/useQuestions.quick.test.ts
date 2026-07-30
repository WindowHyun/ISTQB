import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildQuickPool, drawQuick, type Question } from './useQuestions';
import { makeCanonicalIdResolver } from '../utils/chapterStats';

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
    const questions = [
      ...Array.from({ length: 8 }, (_, i) => q(`S-${i}`, { type: 'short_answer' })),
      ...Array.from({ length: 8 }, (_, i) => q(`M-${i}`)),
    ];
    const drawn = drawQuick(buildQuickPool([{ setId: 'S1', questions }], identity), 10);
    expect(drawn).toHaveLength(10);
    expect(drawn.filter((c) => c.question.type === 'short_answer').length).toBeLessThanOrEqual(3);
  });

  // 선택형이 모자라면 문항 수를 줄이는 것보다 서답형으로 채우는 편이 낫다.
  it('선택형이 모자라면 상한을 넘겨서라도 문항 수를 채운다', () => {
    const questions = [
      ...Array.from({ length: 9 }, (_, i) => q(`S-${i}`, { type: 'short_answer' })),
      q('M-0'),
    ];
    const drawn = drawQuick(buildQuickPool([{ setId: 'S1', questions }], identity), 10);
    expect(drawn).toHaveLength(10);
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
