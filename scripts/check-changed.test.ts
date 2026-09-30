import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { plan } = require_('./check-changed.js') as {
  plan: (areas: Record<string, boolean>, opts?: { skipSlow?: boolean }) => [string, string[], { cwd?: string }?][];
};
const { classify, SWEEP_SPECS } = require_('./changed-areas.js') as {
  classify: (files: string[]) => Record<string, boolean>;
  SWEEP_SPECS: string[];
};

const cmds = (files: string[], opts?: { skipSlow?: boolean }) =>
  plan(classify(files), opts).map(([c, a]) => `${c} ${a.join(' ')}`);
const playwright = (files: string[], opts?: { skipSlow?: boolean }) =>
  cmds(files, opts).filter((x) => x.startsWith('npx playwright'));
const STATIC = ['npm run lint', 'npm run typecheck', 'npm run typecheck:test', 'npm test'];

describe('check:changed — 영역 → 검증 명령', () => {
  it('문서만 바뀌면 아무것도 실행하지 않는다', () => {
    expect(cmds(['AGENTS.md', 'docs/harness/testing.md'])).toEqual([]);
  });

  it('데이터 변경은 verify·PDF 대조와, CI e2e-sweep과 같은 전수 스윕 두 스펙을 돌린다', () => {
    const c = cmds(['www/data/istqb/sample-a.json']);
    expect(c).toContain('npm run verify');
    expect(c).toContain('python3 scripts/verify-pdf-data.py');
    expect(c).toContain(`npx playwright test --project=explore ${SWEEP_SPECS.join(' ')}`);
    // 몽키·페어와이즈까지 도는 explore 전체는 아니다.
    expect(c.some((x) => x.includes('--project=explore') && !SWEEP_SPECS.every((s) => x.includes(s)))).toBe(false);
  });

  it('전수 스윕은 프로젝트 묶음 호출 뒤에 따로 실행한다(스펙 필터가 다른 프로젝트까지 거르지 않게)', () => {
    const pw = playwright(['src/components/quiz/QuestionCard.tsx']);
    expect(pw).toHaveLength(2);
    expect(pw[0]).toContain('--project=react');
    expect(pw[0]).not.toContain('explore');
    expect(pw[1]).toBe(`npx playwright test --project=explore ${SWEEP_SPECS.join(' ')}`);
  });

  it('--skip-slow는 탐색 E2E(explore)도 뺀다', () => {
    const pw = playwright(['www/data/istqb/sample-a.json', 'e2e/explore-monkey.spec.ts'], { skipSlow: true });
    expect(pw).toHaveLength(1);
    expect(pw[0]).toContain('--project=react');
    expect(pw[0]).not.toContain('explore');
  });

  it('탐색 스펙이 바뀌면 explore 전체를 돌리고, 스윕 두 스펙을 또 돌리지 않는다', () => {
    expect(playwright(['e2e/explore-monkey.spec.ts'])).toEqual(['npx playwright test --project=explore']);
    expect(playwright(['e2e/explore-monkey.spec.ts', 'www/data/istqb/sample-a.json'])).toEqual([
      'npx playwright test --project=react --project=explore',
    ]);
  });

  it('E2E 스펙은 속한 프로젝트를, 공용 헬퍼는 모든 프로젝트를 돌린다', () => {
    expect(playwright(['e2e/react-quick.spec.ts'])).toEqual(['npx playwright test --project=react']);
    expect(playwright(['e2e/nonfunctional.spec.ts'])).toEqual(['npx playwright test --project=nonfunctional']);
    expect(playwright(['e2e/apk-functional.spec.ts'])).toEqual(['npx playwright test --project=apk --project=apk-nf']);
    expect(playwright(['e2e/helpers.ts'])).toEqual([
      'npx playwright test --project=react --project=apk --project=apk-nf --project=nonfunctional --project=explore',
    ]);
  });

  it('저장 계층 변경은 저장 계층 뮤테이션을 돌리고, --skip-slow면 뺀다', () => {
    expect(cmds(['src/utils/storage.ts'])).toContain('npm run test:mutation:storage');
    expect(cmds(['src/utils/storage.ts'], { skipSlow: true })).not.toContain('npm run test:mutation:storage');
  });

  it('핵심 뮤테이션은 대상에 닿는 테스트만 바뀌어도 돌리고, 닿지 않는 logic 변경에는 돌리지 않는다', () => {
    expect(cmds(['src/utils/scoring.test.ts'])).toEqual([...STATIC, 'npm run test:mutation']);
    expect(cmds(['src/hooks/useTheme.ts'])).not.toContain('npm run test:mutation');
  });

  it('대상에 닿지 않는 유닛 테스트만 바뀌면 정적 게이트와 유닛만 돌린다', () => {
    expect(cmds(['src/utils/parser.render.test.ts'])).toEqual(STATIC);
  });

  it('의존성·워크플로 변경은 Gradle을 돌리지 않는다(CI android-build가 매번 돈다)', () => {
    for (const f of ['package.json', '.github/workflows/ci.yml', 'playwright.config.ts']) {
      expect(cmds([f]).some((x) => x.startsWith('./gradlew')), f).toBe(false);
    }
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
