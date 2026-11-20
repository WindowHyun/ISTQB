import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 워크플로 공급망·권한 계약.
 *
 * 서명 키·서비스계정을 받는 액션이 가변 태그(`@v1`)면 태그가 재지정되는 순간 그 액션이 비밀을 읽는다.
 * `actions/*`·`github/*`(GitHub 공식)는 태그를 허용하고, 그 밖의 서드파티 액션은 커밋 SHA로 고정한다.
 * 그리고 시크릿을 다루는 배포 워크플로는 읽기 전용 토큰으로만 돌고, 임의 브랜치에서 배포하지 못한다.
 */

const dir = path.resolve(process.cwd(), '.github/workflows');
const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');

describe('GitHub 워크플로', () => {
  it('워크플로를 읽었다', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('서드파티 액션은 40자 커밋 SHA로 고정한다', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const m of read(f).matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
        const ref = m[1];
        if (ref.startsWith('./') || /^(actions|github)\//.test(ref)) continue;
        if (!/@[0-9a-f]{40}$/.test(ref)) bad.push(`${f}: ${ref}`);
      }
    }
    expect(bad, `가변 태그로 쓰는 서드파티 액션:\n${bad.join('\n')}`).toEqual([]);
  });

  it('모든 워크플로에 permissions가 있다(저장소 기본 권한에 기대지 않는다)', () => {
    const missing = files.filter((f) => !/^permissions:/m.test(read(f)) && !/^\s{4}permissions:/m.test(read(f)));
    expect(missing).toEqual([]);
  });

  describe('android-firebase.yml — 서명 APK 배포', () => {
    const y = read('android-firebase.yml');

    it('최상위 permissions가 읽기 전용이다', () => {
      expect(y).toMatch(/^permissions:\n\s+contents: read\n/m);
      expect(y).not.toMatch(/(contents|packages|id-token):\s*write/);
    });

    it('main 브랜치와 v* 태그에서만 배포한다', () => {
      expect(y).toMatch(/if:\s*github\.ref == 'refs\/heads\/main' \|\| startsWith\(github\.ref, 'refs\/tags\/v'\)/);
    });

    it('빌드 전에 정적 검증(lint·테스트)을 돈다', () => {
      const verify = y.indexOf('npm run lint');
      const build = y.indexOf('npm run build');
      expect(verify).toBeGreaterThan(-1);
      expect(verify, '검증이 빌드 뒤에 있다').toBeLessThan(build);
      expect(y).toContain('npm test');
    });

    it('복호화한 keystore를 항상 지운다', () => {
      expect(y).toMatch(/if: always\(\)\n\s+run: rm -f android\/app\/release\.jks/);
    });
  });

  it('CodeQL이 웹뿐 아니라 Java(JS 브리지)와 워크플로도 분석한다', () => {
    const ci = read('ci.yml');
    for (const lang of ['javascript-typescript', 'java-kotlin', 'actions']) expect(ci).toContain(lang);
  });

  it('PR만 실행 취소를 켠다(main 푸시는 경로 필터 기준이 어긋난다)', () => {
    expect(read('ci.yml')).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  });
});
