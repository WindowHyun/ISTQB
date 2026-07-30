import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { shuffleQuestions, buildQuickPool, type Question } from './useQuestions';
import { makeCanonicalIdResolver } from '../utils/chapterStats';

/**
 * 퀵 추첨의 무작위성 — 지금까지 "세트별 기여가 0이 아니다"(allsets.contract)까지만 봤다.
 * 그건 편향을 잡지 못한다: 한 세트가 다른 세트의 10배로 뽑혀도 0은 아니기 때문이다.
 *
 * Fisher–Yates는 경계가 한 칸만 어긋나도(`Math.random() * i`, 또는 `i >= 0`) 편향된다.
 * 눈으로는 여전히 섞인 것처럼 보이고, 출제 문항 수도 정확히 맞는다 — 그래서 기존 검사가
 * 전부 통과한 채로 "늘 비슷한 문항만 나오는" 앱이 될 수 있다.
 *
 * 무작위성 테스트는 흔들리기 쉬우므로 시드 고정 PRNG로 Math.random을 대체해 결정적으로 만든다.
 */

// mulberry32 — 짧고 분포가 좋은 시드 PRNG. 시드가 같으면 항상 같은 수열이 나온다.
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

describe('shuffleQuestions — 균일성', () => {
  it('원소를 잃지도 늘리지도 않는다', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(1));
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffleQuestions(input);
    expect(out).toHaveLength(50);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual(Array.from({ length: 50 }, (_, i) => i)); // 원본 불변
  });

  // n=3의 순열 6가지가 고르게 나와야 한다. `* i`로 어긋난 구현은 특정 순열이
  // 아예 안 나오거나 두 배로 나온다 — 개수만 세는 검사로는 절대 못 잡는다.
  it('n=3의 6가지 순열이 고르게 나온다', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(42));
    const N = 60_000;
    const freq = new Map<string, number>();
    for (let i = 0; i < N; i += 1) {
      const key = shuffleQuestions(['a', 'b', 'c']).join('');
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
    expect(freq.size, `나오지 않은 순열이 있다: ${[...freq.keys()].join(',')}`).toBe(6);
    const expected = N / 6;
    for (const [perm, n] of freq) {
      // ±10%면 편향(2배·0배)은 확실히 잡으면서 시드 흔들림에는 걸리지 않는다.
      expect(Math.abs(n - expected) / expected, `${perm} 편중: ${n}`).toBeLessThan(0.1);
    }
  });

  // 마지막 원소가 제자리에 고정되는 편향(루프 경계 실수의 전형)을 직접 본다.
  it('각 원소가 모든 위치에 고르게 간다', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(7));
    const n = 10;
    const N = 20_000;
    const at = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const input = Array.from({ length: n }, (_, i) => i);
    for (let t = 0; t < N; t += 1) {
      shuffleQuestions(input).forEach((v, pos) => { at[v][pos] += 1; });
    }
    const expected = N / n;
    for (let v = 0; v < n; v += 1) {
      for (let pos = 0; pos < n; pos += 1) {
        expect(Math.abs(at[v][pos] - expected) / expected, `원소 ${v}가 위치 ${pos}에 ${at[v][pos]}회`)
          .toBeLessThan(0.15);
      }
    }
  });
});

describe('퀵 추첨 — 세트 분포', () => {
  const dataRoot = path.resolve(process.cwd(), 'www/data');
  const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dataRoot, rel), 'utf8'));
  const index = readJson('index.json');
  const canonical = makeCanonicalIdResolver(index.duplicateGroups);

  const poolFor = (cert: string) => buildQuickPool(
    (index.sets as { id: string; certification: string; path: string }[])
      .filter((s) => s.certification === cert)
      .map((s) => ({ setId: s.id, questions: readJson(s.path.replace(/^\.\//, '')).questions as Question[] })),
    canonical,
  );

  // 실제 추첨은 shuffle 후 앞에서 size개를 자른다 — 그 경로 그대로 재현한다.
  it.each([['ISTQB'], ['CSTS']])('%s — 세트별 출현 비율이 풀 비율에서 크게 벗어나지 않는다', (cert) => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(2026));
    const pool = poolFor(cert);
    const poolBySet = new Map<string, number>();
    for (const c of pool) poolBySet.set(c.setId, (poolBySet.get(c.setId) ?? 0) + 1);

    const ROUNDS = 3_000;
    const SIZE = 20;
    const drawnBySet = new Map<string, number>();
    for (let r = 0; r < ROUNDS; r += 1) {
      for (const c of shuffleQuestions(pool).slice(0, SIZE)) {
        drawnBySet.set(c.setId, (drawnBySet.get(c.setId) ?? 0) + 1);
      }
    }

    const totalDrawn = ROUNDS * SIZE;
    for (const [setId, poolCount] of poolBySet) {
      const expectedShare = poolCount / pool.length;
      const actualShare = (drawnBySet.get(setId) ?? 0) / totalDrawn;
      // 한 세트가 풀 비중의 절반만 나오거나 1.5배로 나오면 체감상 "늘 그 세트"가 된다.
      expect(actualShare / expectedShare, `${setId}: 기대 ${(expectedShare * 100).toFixed(1)}% vs 실제 ${(actualShare * 100).toFixed(1)}%`)
        .toBeGreaterThan(0.9);
      expect(actualShare / expectedShare, `${setId}: 기대 ${(expectedShare * 100).toFixed(1)}% vs 실제 ${(actualShare * 100).toFixed(1)}%`)
        .toBeLessThan(1.1);
    }
  });

  it.each([['ISTQB'], ['CSTS']])('%s — 한 회차 안에 같은 문항이 두 번 나오지 않는다', (cert) => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(99));
    const pool = poolFor(cert);
    for (let r = 0; r < 500; r += 1) {
      const drawn = shuffleQuestions(pool).slice(0, 20);
      expect(new Set(drawn.map((c) => c.id)).size).toBe(drawn.length);
      // 재수록(다른 세트의 같은 문항)도 한 회차에 겹치면 안 된다.
      expect(new Set(drawn.map((c) => canonical(c.id))).size).toBe(drawn.length);
    }
  });
});
