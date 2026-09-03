import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isSetLevelRound, isPassGaugeRound, buildSetTimelines, buildMiniTestRounds,
} from './attemptStats';
import type { ExamHistory } from '../store/useQuizStore';

/**
 * 4지선다 회차는 **회차 이력(타임라인)에는 남고, 합격 가늠(요약)에서는 빠진다.**
 *
 * 근거는 배점이다 — 아래 '배점 근거' describe가 데이터에서 직접 잰다.
 * 두 방향 모두 결함이 된다.
 *  - 요약에 넣으면: CSTS에서 불합격 점수가 합격 신호로 읽힌다.
 *  - 타임라인에서 빼면: 채점했는데 화면 어디에도 안 보여 "기록된다"는 약속이 깨진다.
 */

const round = (over: Partial<ExamHistory> & { id: string }): ExamHistory => ({
  setId: 'A', mode: 'exam', answers: {}, correct: 30, total: 40, createdAt: 100, ...over,
});
const titleOf = (id: string) => id;

describe('isPassGaugeRound — 합격 가늠에 넣을 회차', () => {
  it('시험은 넣고 4지선다는 뺀다', () => {
    expect(isPassGaugeRound(round({ id: 'e1', mode: 'exam' }))).toBe(true);
    expect(isPassGaugeRound(round({ id: 'c1', mode: 'choice' }))).toBe(false);
  });

  it('4지선다는 타임라인에는 그대로 남는다 — 두 술어가 갈리는 유일한 지점이다', () => {
    const c = round({ id: 'c1', mode: 'choice' });
    expect(isSetLevelRound(c), '타임라인에서까지 빠지면 채점 기록이 화면에서 사라진다').toBe(true);
    expect(isPassGaugeRound(c)).toBe(false);
  });

  it('두 술어가 갈리는 것은 4지선다뿐 — 나머지는 종전과 같다', () => {
    // 여기서 다른 모드가 갈리기 시작하면 요약과 타임라인이 이유 없이 어긋난다.
    const modes: ExamHistory['mode'][] = ['exam', 'practice', 'random', 'review', 'quick'];
    for (const mode of modes) {
      const h = round({ id: mode, mode });
      expect(isPassGaugeRound(h), `${mode}`).toBe(isSetLevelRound(h));
    }
  });

  it('챕터 미니 회차는 4지선다든 아니든 양쪽 모두에서 빠진다', () => {
    const mini = round({ id: 'm1', mode: 'choice', chapter: 'C1' });
    expect(isSetLevelRound(mini)).toBe(false);
    expect(isPassGaugeRound(mini)).toBe(false);
  });
});

describe('요약과 타임라인의 역할 분담', () => {
  const hs = [
    round({ id: 'e1', mode: 'exam', correct: 26, total: 40, createdAt: 100 }),   // 65%
    round({ id: 'c1', mode: 'choice', correct: 36, total: 38, createdAt: 200 }), // 94%
  ];

  it('요약의 최고 정답률이 4지선다 회차로 부풀지 않는다', () => {
    const gauge = hs.filter(isPassGaugeRound).map((h) => Math.floor((h.correct! / h.total!) * 100));
    expect(gauge).toEqual([65]);
  });

  it('타임라인에는 둘 다 실리고 모드가 구분돼 있다', () => {
    const [tl] = buildSetTimelines(hs, titleOf);
    expect(tl.attempts.map((a) => a.id)).toEqual(['e1', 'c1']);
    expect(tl.attempts.map((a) => a.mode)).toEqual(['exam', 'choice']);
  });

  it("4지선다는 '짧은 세션' 목록으로 밀려나지 않는다", () => {
    // 그 섹션은 폐지된 기록을 확인·삭제하는 자리다 — 살아 있는 모드의 회차가 거기 가면
    // "지난 기록"으로 표시돼 방금 친 회차가 옛것처럼 보인다.
    expect(buildMiniTestRounds(hs, titleOf).map((m) => m.id)).toEqual([]);
  });
});

/**
 * 배점 근거 — 이 정책의 유일한 이유이므로 데이터에서 직접 잰다.
 *
 * 숫자가 바뀌면(문항 구성 변경 등) 정책의 전제도 바뀐 것이라 여기서 먼저 실패해야 한다.
 * 배점은 scoring.ts의 CSTS 검정방법별 배점과 같다: 4지선다·서답형 1.5점, 진위형 1.0점.
 */
describe('배점 근거 — CSTS에서 4지선다가 덮는 몫', () => {
  const POINTS: Record<string, number> = {
    multiple_choice: 1.5, true_false: 1.0, short_answer: 1.5,
  };
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const index = JSON.parse(fs.readFileSync(path.join(dataDir, 'index.json'), 'utf-8')) as {
    sets: { id: string; certification: string; path: string }[];
  };
  const load = (p: string) => {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, p.replace(/^\.\//, '')), 'utf-8'));
    return (Array.isArray(raw) ? raw : raw.questions ?? []) as {
      type?: string; options?: unknown[];
    }[];
  };
  const csts = index.sets.filter((s) => s.certification.toLowerCase() === 'csts');

  const coverageOf = (p: string) => {
    const qs = load(p);
    const full = qs.reduce((sum, q) => sum + (POINTS[q.type ?? ''] ?? 1.5), 0);
    const covered = qs
      .filter((q) => (q.options?.length ?? 0) === 4)
      .reduce((sum, q) => sum + (POINTS[q.type ?? ''] ?? 1.5), 0);
    return covered / full;
  };

  it.each(csts.map((s) => [s.id, s.path]))(
    '%s — 배점의 20% 이상이 표본에서 통째로 빠진다',
    (_id, p) => {
      // 이것이 정책의 실제 근거다: 4지선다 회차의 %는 시험 회차의 %와 같은 것을 재지 않는다.
      // 빠지는 몫이 이만큼이면 그 회차의 정답률을 합격 가늠에 섞을 수 없다.
      expect(coverageOf(String(p))).toBeLessThan(0.8);
    },
  );

  it('본시험 4세트(2402~2405)에서는 정확히 합격선만큼(75.0%)을 덮는다', () => {
    // 하필 CSTS 합격선이 만점의 75%다. 그래서 4지선다를 **전부** 맞혀도 실제 배점으로는
    // 딱 합격선이고, 90%를 맞히면 67.5점 — 불합격선 아래인데 요약에는 '90%'로 뜬다.
    // 요약이 '합격 기준 75점 이상' 배너 바로 아래에 있다는 점에서 이건 반대 신호다.
    for (const s of csts.filter((x) => /CSTS-FL-24/.test(x.id))) {
      expect(coverageOf(s.path), s.id).toBeCloseTo(0.75, 10);
    }
  });

  it('CSTS-EL-2018만 예외적으로 조금 높다(77.6%) — 그래도 규칙은 같다', () => {
    // 20문항짜리 짧은 세트라 비율이 다르다. 합격선을 아슬하게 넘길 수는 있지만
    // 표본이 다르다는 사실은 그대로여서, 세트마다 요약 규칙을 갈라 놓지는 않는다.
    const s = csts.find((x) => x.id === 'CSTS-EL-2018');
    expect(s, '세트 구성이 바뀌었다 — 이 예외 설명을 다시 확인할 것').toBeTruthy();
    expect(coverageOf(s!.path)).toBeGreaterThan(0.75);
  });

  it('ISTQB는 사정이 다르다 — 4지선다가 배점의 90% 이상을 덮는다', () => {
    // 그래도 같은 규칙을 적용한다: 표본이 다르다는 사실은 같고, 자격증마다 요약 규칙이
    // 갈리면 "왜 여기선 세고 저기선 안 세지"를 설명할 수 없다.
    for (const s of index.sets.filter((x) => x.certification.toLowerCase() === 'istqb')) {
      const qs = load(s.path);
      const full = qs.length; // ISTQB는 전 문항 동일 배점
      const four = qs.filter((q) => (q.options?.length ?? 0) === 4).length;
      expect(four / full, s.id).toBeGreaterThan(0.9);
    }
  });
});
