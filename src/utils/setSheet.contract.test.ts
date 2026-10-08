import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { groupSets, setDisplay } from './setSheet';

/**
 * 세트 표시 이름 ↔ 데이터 계약.
 *
 * 세트 선택 시트의 짧은 이름은 index.json의 원제목에서 규칙으로 파생한다(setSheet.ts).
 * 새 세트가 들어왔는데 규칙이 그 제목을 모르면 시트에는 긴 원제목이 그대로 뜬다 — 동작은 하지만
 * "이름을 정하는 순간"이 조용히 지나간 것이다. 이 검사가 그 순간을 개발자에게 돌려준다.
 */

const index = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'www/data/index.json'), 'utf8')) as {
  sets: { id: string; certification: string; title: string; questionCount: number }[];
};

describe('세트 표시 이름 계약 (www/data/index.json)', () => {
  it('모든 세트의 제목이 이름 규칙에 걸린다', () => {
    const unknown = index.sets.filter((s) => !setDisplay(s).recognized).map((s) => `${s.id}: ${s.title}`);
    expect(unknown, '규칙을 모르는 세트 제목 — src/utils/setSheet.ts의 RULES에 추가하세요').toEqual([]);
  });

  it('같은 제품 안에서 짧은 이름이 겹치지 않는다(시트에서 두 행을 구분할 수 없게 된다)', () => {
    for (const cert of ['ISTQB', 'CSTS']) {
      const names = index.sets.filter((s) => s.certification === cert).map((s) => setDisplay(s).name);
      expect(new Set(names).size, `${cert} 짧은 이름 중복: ${names.join(', ')}`).toBe(names.length);
    }
  });

  it('짧은 이름은 원제목보다 짧다(줄이는 것이 목적이다)', () => {
    for (const s of index.sets) {
      expect(setDisplay(s).name.length, s.id).toBeLessThan(s.title.length);
    }
  });

  it('모든 세트가 하나의 묶음에 들어가고 빠지는 세트가 없다', () => {
    for (const cert of ['ISTQB', 'CSTS']) {
      const sets = index.sets.filter((s) => s.certification === cert);
      const rows = groupSets(sets).flatMap((g) => g.rows.map((r) => r.set.id));
      expect(rows.sort()).toEqual(sets.map((s) => s.id).sort());
    }
  });

  it('각 세트의 문항 수가 숫자로 들어 있다(시트의 "N문항 · 풀이 전"이 의존한다)', () => {
    for (const s of index.sets) expect(typeof s.questionCount, s.id).toBe('number');
  });
});
