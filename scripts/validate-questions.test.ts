import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * validate-questions.js — 데이터 게이트가 무엇을 막는가.
 *
 * 이 게이트는 `npm run verify`와 CI의 첫 관문이다. 그런데 정답이 빈 배열이거나, type이 오타이거나, 보기에
 * key가 없거나, 없는 그림을 가리켜도 오류 0건으로 통과했다 — 정답이 없는 문항이 '검증 통과'로 배포될 수 있었다.
 * 임시 데이터 디렉터리에 문항을 하나씩 넣어 스크립트를 실제로 실행한다(종료 코드와 출력으로 단언한다).
 */

const script = resolve(process.cwd(), 'scripts/validate-questions.js');
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const base = () => ({
  id: 'T-001', number: 1, type: 'multiple_choice', chapter: null,
  stem: [{ type: 'paragraph', text: '다음 중 옳은 것은?' }],
  options: [{ key: 'a', text: '가' }, { key: 'b', text: '나' }, { key: 'c', text: '다' }, { key: 'd', text: '라' }],
  answer: ['a'],
});

function run(question: Record<string, unknown>, extraFiles: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'vq-'));
  dirs.push(cwd);
  mkdirSync(join(cwd, 'www/data/istqb'), { recursive: true });
  writeFileSync(join(cwd, 'www/data/istqb/set.json'), JSON.stringify({ meta: { certification: 'istqb' }, questions: [question] }));
  for (const [rel, body] of Object.entries(extraFiles)) {
    mkdirSync(join(cwd, rel, '..'), { recursive: true });
    writeFileSync(join(cwd, rel), body);
  }
  try {
    const out = execFileSync('node', [script], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stdout: string };
    return { code: err.status, out: err.stdout };
  }
}

describe('validate-questions — 정상 문항', () => {
  it('정상 문항은 통과한다(기준선)', () => {
    const r = run(base());
    expect(r.code, r.out).toBe(0);
  });
});

describe('validate-questions — 정답·형식', () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['정답이 빈 배열', { ...base(), answer: [] }, /정답이 비어 있거나/],
    ['정답이 문자열', { ...base(), answer: 'a' }, /정답은 배열이어야/],
    ['정답에 빈 문자열', { ...base(), answer: [''] }, /정답이 비어 있거나/],
    ['type 오타', { ...base(), type: 'multiple_choise' }, /알 수 없는 값/],
    ['보기에 key 없음', { ...base(), options: [{ text: '가' }, { key: 'b', text: '나' }, { key: 'c', text: '다' }, { key: 'd', text: '라' }] }, /보기에 key가 없음/],
    ['정답이 보기에 없음', { ...base(), answer: ['z'] }, /options에 존재하지 않음/],
  ];
  it.each(cases)('%s → 오류로 실패한다', (_name, q, pattern) => {
    const r = run(q);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toMatch(pattern);
  });
});

describe('validate-questions — 그림 경로', () => {
  const img = (src: string) => ({ ...base(), stem: [{ type: 'image', src }] });

  it('없는 그림을 가리키는 image 블록은 오류다(마크다운 본문 형태 포함)', () => {
    expect(run(img('/images/none.png')).code).toBe(1);
    const md = { ...base(), stem: [{ type: 'image', text: '![x](/images/none.png)' }] };
    expect(run(md).out).toMatch(/image 블록의 파일 미존재/);
  });

  it('경로가 없는 image 블록도 오류다', () => {
    const r = run({ ...base(), stem: [{ type: 'image' }] });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/경로 없음/);
  });

  it('없는 figure는 경고가 아니라 오류다', () => {
    const r = run({ ...base(), figure: '/images/none.png' });
    expect(r.code, r.out).toBe(1);
    expect(r.out).toMatch(/figure 파일 미존재/);
  });

  it('있는 그림은 통과한다(src·마크다운 둘 다)', () => {
    const files = { 'www/images/ok.png': 'x' };
    expect(run(img('/images/ok.png'), files).code).toBe(0);
    expect(run({ ...base(), stem: [{ type: 'image', text: '![x](/images/ok.png)' }] }, files).code).toBe(0);
  });
});
