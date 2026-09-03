import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildChoicePool, reviewTargetIds, CHOICE_OPTION_COUNT, type Question } from './useQuestions';
import { gradeKeyFor } from '../utils/answerKey';

/**
 * 4지선다 모드의 출제 대상 계약.
 *
 * 이 모드가 약속하는 것은 하나다 — "보기 4개 중 하나를 고르는 문항만 나온다".
 * 그 약속이 깨지는 경로가 둘 있어서 여기서 고정한다.
 *  1) 진위형·서답형이 섞여 들어오는 것(보기가 아예 없는 문항)
 *  2) 5지선다·복수정답이 섞여 들어오는 것 — ISTQB의 복수정답 9문항이 보기 5개다.
 *     이름이 '4지선다'인데 정답을 두 개 골라야 하는 문항이 끼면 규칙이 화면 안에서 갈린다.
 */

const q = (over: Partial<Question> & { number: number }): Question => ({
  id: `Q${over.number}`,
  type: 'multiple_choice',
  stem: '',
  options: [],
  answer: ['a'],
  ...over,
});
const opts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: 'abcde'[i], text: '' }));

describe('buildChoicePool', () => {
  it('보기가 정확히 4개인 문항만 남긴다', () => {
    const pool = buildChoicePool([
      q({ number: 1, options: opts(4) }),
      q({ number: 2, options: [], type: 'true_false' }),
      q({ number: 3, options: [], type: 'short_answer' }),
      q({ number: 4, options: opts(5), answer: ['a', 'e'] }),
      q({ number: 5, options: opts(4) }),
      q({ number: 6, options: opts(3) }),
    ]);
    expect(pool.map((x) => x.number)).toEqual([1, 5]);
  });

  it('원본 순서를 흔들지 않는다 — 섞는 것은 호출부의 몫이다', () => {
    // 여기서 함께 섞으면 순수 함수가 난수에 의존해, 이 계약을 시드 없이는 못 고정한다.
    const input = [3, 1, 2].map((n) => q({ number: n, options: opts(4) }));
    expect(buildChoicePool(input).map((x) => x.number)).toEqual([3, 1, 2]);
  });

  it('options 필드가 없는 손상 데이터에도 터지지 않는다', () => {
    const broken = { number: 9, id: 'Q9', stem: '', answer: ['a'] } as unknown as Question;
    expect(buildChoicePool([broken])).toEqual([]);
  });

  it('빈 목록은 빈 목록이다(문항 로드 전 렌더)', () => {
    expect(buildChoicePool([])).toEqual([]);
  });
});

describe('reviewTargetIds — 4지선다 오답도 오답 모드로 간다', () => {
  // 채점이 있는데 여기서 빠지면 그 오답이 오답 노트에는 보이는데 오답 모드에는 안 나온다.
  // 이 저장소가 여러 번 고친 불일치라, 모드를 늘릴 때마다 이 자리를 함께 본다.
  it('시험·4지선다·레거시 랜덤·구버전 단독 키를 모두 합친다', () => {
    const setId = 'S1';
    const ids = reviewTargetIds(
      {
        [gradeKeyFor(setId, 'exam')]: ['E1'],
        [gradeKeyFor(setId, 'choice')]: ['C1'],
        [gradeKeyFor(setId, 'random')]: ['R1'],
        [setId]: ['L1'],
        [gradeKeyFor('S2', 'choice')]: ['OTHER'], // 다른 세트는 섞이지 않는다
      },
      setId,
    );
    expect([...ids].sort()).toEqual(['C1', 'E1', 'L1', 'R1']);
  });

  it('퀵은 들어오지 않는다 — 채점이 없어 오답 버킷을 만들지 않는 모드다', () => {
    const ids = reviewTargetIds({ [gradeKeyFor('S1', 'quick')]: ['QK'] }, 'S1');
    expect(ids.size).toBe(0);
  });
});

/**
 * 데이터 계약 — 12세트 전부에서 이 모드가 성립하는가.
 *
 * 한 세트라도 보기 4개짜리가 0개면 그 세트에서는 빈 화면이 된다(전용 안내를 두긴 했지만,
 * 그건 데이터가 바뀐 뒤의 그레이스풀 처리이지 정상 상태가 아니다).
 */
describe('전 세트 — 4지선다 풀 기여', () => {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const index = JSON.parse(fs.readFileSync(path.join(dataDir, 'index.json'), 'utf-8')) as {
    sets: { id: string; path: string }[];
  };

  it.each(index.sets.map((s) => [s.id, s.path]))('%s — 출제할 문항이 있다', (_id, p) => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(dataDir, String(p).replace(/^\.\//, '')), 'utf-8'),
    );
    const questions: Question[] = Array.isArray(raw) ? raw : raw.questions ?? [];
    const pool = buildChoicePool(questions);
    expect(pool.length).toBeGreaterThan(0);
    // 이름이 약속한 것과 실제가 같은지 — 풀 안의 모든 문항이 보기 4개다.
    expect(pool.every((x) => x.options.length === CHOICE_OPTION_COUNT)).toBe(true);
  });
});
