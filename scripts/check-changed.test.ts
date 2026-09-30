import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { plan } = require_('./check-changed.js') as {
  plan: (areas: Record<string, boolean>, opts?: { skipSlow?: boolean }) => [string, string[], { cwd?: string }?][];
};
const { classify } = require_('./changed-areas.js') as {
  classify: (files: string[]) => Record<string, boolean>;
};

const cmds = (files: string[], opts?: { skipSlow?: boolean }) =>
  plan(classify(files), opts).map(([c, a]) => `${c} ${a.join(' ')}`);

describe('check:changed — 영역 → 검증 명령', () => {
  it('문서만 바뀌면 아무것도 실행하지 않는다', () => {
    expect(cmds(['AGENTS.md', 'docs/harness/testing.md'])).toEqual([]);
  });

  it('데이터 변경은 verify·PDF 대조와 전수 스윕(explore)까지 돌린다', () => {
    const c = cmds(['www/data/istqb/sample-a.json']);
    expect(c).toContain('npm run verify');
    expect(c).toContain('python3 scripts/verify-pdf-data.py');
    expect(c.find((x) => x.startsWith('npx playwright'))).toContain('--project=explore');
  });

  it('--skip-slow는 탐색 E2E(explore)도 뺀다', () => {
    const pw = cmds(['www/data/istqb/sample-a.json'], { skipSlow: true }).find((x) => x.startsWith('npx playwright'));
    expect(pw).toContain('--project=react');
    expect(pw).not.toContain('--project=explore');
  });

  it('저장 계층 변경은 저장 계층 뮤테이션을 돌리고, --skip-slow면 뺀다', () => {
    expect(cmds(['src/utils/storage.ts'])).toContain('npm run test:mutation:storage');
    expect(cmds(['src/utils/storage.ts'], { skipSlow: true })).not.toContain('npm run test:mutation:storage');
  });

  it('Playwright는 한 번의 호출로 묶는다(스위트를 따로 띄우면 dist/를 덮어쓴다)', () => {
    const pw = cmds(['src/components/quiz/QuestionCard.tsx', 'src/hooks/useQuizSession.ts'])
      .filter((x) => x.includes('playwright'));
    expect(pw).toHaveLength(1);
    expect(pw[0]).toContain('--project=react');
    expect(pw[0]).toContain('--project=apk');
    expect(pw[0]).toContain('--project=nonfunctional');
  });

  it('유닛 테스트만 바뀌면 정적 게이트와 유닛만 돌린다', () => {
    expect(cmds(['src/utils/scoring.test.ts'])).toEqual([
      'npm run lint', 'npm run typecheck', 'npm run typecheck:test', 'npm test',
    ]);
  });

  it('안드로이드 변경은 빌드→cap:sync와 APK 스위트', () => {
    const c = cmds(['android/app/src/main/java/com/local/istqbfl/MainActivity.java']);
    expect(c.indexOf('npm run build')).toBeLessThan(c.indexOf('npm run cap:sync'));
    expect(c.find((x) => x.startsWith('npx playwright'))).toContain('--project=apk');
  });

  it('네이티브 변경은 cap:sync 뒤에 android/에서 Gradle 컴파일까지 실행한다', () => {
    const steps = plan(classify(['android/app/src/main/java/com/local/istqbfl/MainActivity.java']));
    const i = steps.findIndex(([c, a]) => c === './gradlew' && a[0] === 'assembleDebug');
    expect(i, '네이티브 변경인데 Gradle을 돌리지 않는다').toBeGreaterThan(-1);
    expect(steps[i][2]?.cwd).toBe('android');
    expect(i).toBeGreaterThan(steps.findIndex(([c, a]) => c === 'npm' && a[1] === 'cap:sync'));
  });

  it('cap:sync가 채우는 assets/public·Capacitor 설정만 바뀌면 Gradle은 돌리지 않는다', () => {
    for (const f of ['android/app/src/main/assets/public/index.html', 'capacitor.config.json']) {
      expect(cmds([f]).some((x) => x.startsWith('./gradlew')), f).toBe(false);
    }
  });
});
