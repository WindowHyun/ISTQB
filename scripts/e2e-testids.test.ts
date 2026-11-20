import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * E2E가 찾는 `data-testid`가 앱에 실제로 있는가.
 *
 * 없는 id를 찾는 검사는 조용히 헛돈다. 실제로 `react-quick.spec.ts`가 존재하지 않는 `drawer-toggle`을
 * 두 번 썼고(실제 id는 `drawer-open`), 거기 딸린 `if (await drawer.isVisible()) …` 분기는 한 번도
 * 실행되지 않았으며 뒤따르는 `toHaveCount(0)`는 대상이 애초에 없어서 공허하게 통과했다 — 테스트가
 * "버튼이 없다"를 확인하는지 "id를 잘못 썼다"를 확인하는지 구분할 수 없었다.
 *
 * 부정 단언(`toHaveCount(0)`·`not.toBeVisible`)이 의도한 id는 `ABSENT_BY_DESIGN`에 사유와 함께 적는다.
 */

const root = process.cwd();
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
};
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

/** 앱 소스(테스트 제외)에서 id 문자열과, 템플릿으로 만드는 id의 접두를 모은다. */
function appIds() {
  const exact = new Set<string>();
  const prefixes = new Set<string>();
  for (const f of walk('src').filter((x) => !/\.test\.tsx?$/.test(x))) {
    const src = read(f);
    // data-testid="x" · testid="x" · testId="x" · confirmTestId="x" · testId: 'x'
    for (const m of src.matchAll(/[Tt]est-?[Ii]d\w*\s*[=:]\s*\{?\s*["']([\w-]+)["']/g)) exact.add(m[1]);
    // data-testid={`prefix-${…}`} — 접두까지만 안다.
    for (const m of src.matchAll(/[Tt]est-?[Ii]d\w*\s*=\s*\{`([\w-]*)\$\{/g)) if (m[1]) prefixes.add(m[1]);
    // setAttribute('data-testid', 'x') — DOM을 직접 만드는 곳(토스트·라이트박스).
    for (const m of src.matchAll(/setAttribute\(\s*['"]data-testid['"]\s*,\s*['"]([\w-]+)['"]/g)) exact.add(m[1]);
    // 문자열 id가 삼항·변수로 들어가는 곳: ? "a" : "b"
    for (const m of src.matchAll(/[Tt]est-?[Ii]d\w*\s*=\s*\{[^}]*?["']([\w-]+)["'][^}]*?["']([\w-]+)["']/g)) {
      exact.add(m[1]); exact.add(m[2]);
    }
  }
  return { exact, prefixes };
}

/** e2e가 문자열 리터럴로 찾는 id. 변수·템플릿으로 만드는 id는 읽지 않는다. */
function e2eIds() {
  const used = new Map<string, string>(); // id → 처음 쓴 파일
  for (const f of walk('e2e')) {
    const src = read(f);
    for (const m of src.matchAll(/getByTestId\(\s*["']([\w-]+)["']\s*\)/g)) if (!used.has(m[1])) used.set(m[1], f);
    for (const m of src.matchAll(/\[data-testid[~^$*|]?=["']?([\w-]+)["']?\]/g)) if (!used.has(m[1])) used.set(m[1], f);
  }
  return used;
}

/** 일부러 앱에 없는 id를 찾는 검사 — `"id": "사유"`. 새 항목은 부정 단언이 의도한 것인지 확인하고 넣는다. */
const ABSENT_BY_DESIGN: Record<string, string> = {
  'debug-toggle': '설정에는 화면 콘솔을 켜는 토글이 없다(개발자용 — ?debug로만 켠다) — react-modals가 toHaveCount(0)로 고정한다',
};

describe('E2E의 data-testid ↔ 앱', () => {
  const { exact, prefixes } = appIds();
  const used = e2eIds();

  it('양쪽에서 id를 충분히 읽었다(읽기가 깨지면 검사가 헛돈다)', () => {
    expect(exact.size).toBeGreaterThan(100);
    expect(used.size).toBeGreaterThan(100);
  });

  it('E2E가 찾는 id는 모두 앱에 있다', () => {
    const missing = [...used]
      .filter(([id]) => !exact.has(id) && ![...prefixes].some((p) => id.startsWith(p)) && !(id in ABSENT_BY_DESIGN))
      .map(([id, f]) => `${id}  (${f})`);
    expect(missing, `앱에 없는 data-testid를 찾는 E2E가 있다 — id를 잘못 썼거나 앱에서 사라졌다:\n${missing.join('\n')}`).toEqual([]);
  });

  it('부정 단언용 예외 목록에 낡은 항목이 없다', () => {
    const stale = Object.keys(ABSENT_BY_DESIGN).filter((id) => exact.has(id));
    expect(stale, '앱에 다시 생긴 id는 예외에서 뺀다').toEqual([]);
  });
});
