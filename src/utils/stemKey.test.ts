import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// 정규화 규칙은 빌드 스크립트에만 있다(런타임은 생성된 표를 읽기만 하므로 번들에 실리지
// 않는다). createRequire로 CJS 모듈을 직접 들여와 규칙 자체를 검증한다.
const require_ = createRequire(import.meta.url);
const { stemKeyOf, normalize } = require_('../../scripts/lib/stemKey.cjs');

const dataRoot = path.resolve(process.cwd(), 'www/data');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dataRoot, rel), 'utf8'));
const index = readJson('index.json');

const byId: Record<string, { id: string; chapter?: string; type?: string }> = {};
for (const set of index.sets) {
  for (const q of readJson(set.path.replace(/^\.\//, '')).questions) byId[q.id] = q;
}

describe('stemKey — 재수록 판정 규칙', () => {
  it('마크업·공백·문장부호 차이를 흡수한다', () => {
    expect(normalize('<b>테스트</b> 케이스, 설계!')).toBe(normalize('테스트 케이스 설계'));
  });

  it('지문이 너무 짧으면 키를 만들지 않는다 — 우연한 일치로 병합되는 것을 막는다', () => {
    expect(stemKeyOf({ stem: [{ text: '짧음' }], options: [], answer: ['a'] })).toBeNull();
  });

  it('지문·정답·보기 수가 같으면 표기가 달라도 같은 키다', () => {
    const a = { stem: [{ text: '테스팅과 디버깅에 대한 설명으로 올바른 것은?' }], answer: ['b'], options: [{ key: 'a', text: '결함을 발견하는 것이다' }, { key: 'b', text: 'X' }] };
    const b = { stem: [{ text: '테스팅과  디버깅에 대한 설명으로 올바른 것은?!' }], answer: ['b'], options: [{ key: 'a', text: '결함의 발견에 있다' }, { key: 'b', text: 'Y' }] };
    expect(stemKeyOf(a)).toBe(stemKeyOf(b));
  });

  it('지문이 같아도 정답이 다르면 다른 키다', () => {
    const base = { stem: [{ text: '테스트 자동화의 이점으로 옳은 것은 무엇인가?' }], options: [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }, { key: 'c', text: 'C' }, { key: 'd', text: 'D' }] };
    expect(stemKeyOf({ ...base, answer: ['a'] })).not.toBe(stemKeyOf({ ...base, answer: ['d'] }));
  });
});

// 표는 생성물이라 데이터가 바뀌면 낡는다. verify가 --check로 막지만, 단위 레벨에서도
// 표의 내용 자체가 성립하는지(오병합이 없는지) 검사한다.
describe('duplicateGroups — 생성된 표의 정합성', () => {
  const groups: string[][] = index.duplicateGroups;

  it('표가 존재하고 45그룹 94문항이다', () => {
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBe(45);
    expect(groups.reduce((n, g) => n + g.length, 0)).toBe(94);
  });

  it('모든 id가 실재하고, 한 문항이 두 그룹에 속하지 않는다', () => {
    const seen = new Set<string>();
    for (const g of groups) {
      expect(g.length).toBeGreaterThanOrEqual(2);
      for (const id of g) {
        expect(byId[id], `${id}가 문항 데이터에 없다`).toBeDefined();
        expect(seen.has(id), `${id}가 여러 그룹에 중복 등록됨`).toBe(false);
        seen.add(id);
      }
    }
  });

  // 지문만으로 묶으면 이 둘이 합쳐진다 — 보기가 완전히 다르고 정답도 a/d로 갈리는
  // 별개 문제다. 합쳐지면 통계가 문항 하나를 잃으므로 회귀로 고정한다.
  it('지문이 같지만 별개 문제인 ISTQB B-040/C-040을 묶지 않는다', () => {
    const g = groups.find((x) => x.includes('ISTQB-FL-V4-B-040'));
    expect(g?.includes('ISTQB-FL-V4-C-040') ?? false).toBe(false);
  });

  it('표기만 손질된 재수록(2404-001 / 2405-001 / 2019-005)은 한 그룹이다', () => {
    const g = groups.find((x) => x.includes('CSTS-FL-2404-001'));
    expect(g).toEqual(['CSTS-EL-2019-005', 'CSTS-FL-2404-001', 'CSTS-FL-2405-001']);
  });

  it('그룹 안에서 문항 유형이 갈리지 않는다', () => {
    for (const g of groups) {
      expect(new Set(g.map((id) => byId[id].type ?? '')).size, g.join(',')).toBe(1);
    }
  });
});
