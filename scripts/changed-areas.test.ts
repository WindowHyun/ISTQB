import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Scopes = Record<string, { config: string; files: Set<string> }>;
const require_ = createRequire(import.meta.url);
const { classify, AREAS, changedFiles, mutationScopes } = require_('./changed-areas.js') as {
  classify: (files: string[], opts?: { scopes?: Scopes; exists?: (f: string) => boolean }) => Record<string, boolean>;
  AREAS: string[];
  changedFiles: (base: string, opts?: { cwd?: string }) => string[] | null;
  mutationScopes: (opts?: {
    srcFiles?: string[];
    read?: (f: string) => string | null;
    configs?: Record<string, { mutate: string[] }>;
  }) => Scopes;
};

const onOf = (files: string[]) =>
  Object.entries(classify(files)).filter(([, v]) => v).map(([k]) => k).sort();
const broad = AREAS.filter((a) => !['native', 'mutationCore', 'mutationStorage'].includes(a)).sort();

describe('changed-areas — 변경 파일 → 검증 영역', () => {
  it('문서만 바뀌면 아무 영역도 켜지 않는다', () => {
    expect(onOf(['README.md', 'docs/harness/data.md', 'AGENTS.md'])).toEqual([]);
  });

  it('저장 계층 뮤테이션은 변이 대상의 import 폐포·대상에 닿는 테스트·설정에서 켜진다', () => {
    for (const f of [
      'src/utils/storage.ts',
      'src/utils/storage.import.test.ts',
      'src/store/useQuizStore.ts',
      'src/store/useQuizStore.actions.test.ts',
      'src/utils/answerKey.ts',
      'src/utils/roundHistory.ts',
      // roundHistory가 import한다 — 종전 고정 목록이 빠뜨린 의존 모듈
      'src/utils/chapterStats.ts',
      'src/utils/scoring.ts',
      'stryker.storage.config.json',
      'vitest.stryker.config.ts',
    ]) {
      expect(classify([f]).mutationStorage, f).toBe(true);
    }
    // 저장 계층의 타입만 가져다 쓰는 테스트(import type)는 런타임에 닿지 않는다.
    for (const f of ['src/utils/attemptStats.test.ts', 'src/components/quiz/QuestionCard.tsx', 'e2e/react-quick.spec.ts']) {
      expect(classify([f]).mutationStorage, f).toBe(false);
    }
  });

  it('핵심 뮤테이션은 stryker.config.json의 대상·의존 모듈·닿는 테스트에서만 켜진다', () => {
    for (const f of [
      'src/utils/scoring.ts',
      'src/utils/scoring.test.ts',
      'src/utils/sessionDerive.test.ts',
      // 테스트가 chapterStats에 닿는 길목 — 이 모듈이 바뀌면 변이를 죽이는 입력이 바뀐다.
      'src/utils/wrongNote.ts',
      'stryker.config.json',
    ]) {
      expect(classify([f]).mutationCore, f).toBe(true);
    }
    for (const f of ['src/utils/parser.tsx', 'src/hooks/useTheme.ts', 'src/utils/toast.ts']) {
      expect(classify([f]).mutationCore, f).toBe(false);
    }
  });

  it('지워진 src 테스트는 무엇을 죽이던 것인지 모르므로 두 뮤테이션을 모두 켠다', () => {
    const on = classify(['src/utils/gone.test.ts'], { exists: () => false });
    expect(on.mutationCore).toBe(true);
    expect(on.mutationStorage).toBe(true);
  });

  it('의존성·도구 설정 변경은 넓게 켜되 Gradle은 켜지 않는다', () => {
    for (const f of ['playwright.config.ts', 'vite.config.ts', 'tsconfig.test.json']) {
      expect(onOf([f]), f).toEqual(broad);
    }
    // 테스트 러너·Stryker 버전이 바뀔 수 있다 — 뮤테이션도 켠다.
    for (const f of ['package-lock.json', 'package.json']) {
      expect(onOf([f]), f).toEqual([...broad, 'mutationCore', 'mutationStorage'].sort());
    }
  });

  it('워크플로는 넓게(뮤테이션 잡 자체를 고쳤을 수 있다), 그 밖의 모르는 파일은 뮤테이션 없이 넓게', () => {
    expect(onOf(['.github/workflows/ci.yml'])).toEqual([...broad, 'mutationCore', 'mutationStorage'].sort());
    expect(onOf(['some-root-file.txt'])).toEqual(broad);
  });

  it('린트 설정은 정적 게이트만', () => {
    expect(onOf(['eslint.config.mjs'])).toEqual(['unit']);
  });

  it('데이터 변경은 data + sweep', () => {
    expect(onOf(['www/data/istqb/ISTQB-A.json'])).toEqual(['data', 'sweep']);
  });

  it('parser.tsx는 ui이면서 전수 스윕 대상이다', () => {
    expect(onOf(['src/utils/parser.tsx'])).toEqual(['sweep', 'ui']);
  });

  it('문항 카드·작업 영역·결과 화면은 ui이면서 전수 스윕 대상이다', () => {
    for (const f of [
      'src/components/quiz/QuestionCard.tsx',
      'src/components/quiz/QuestionWorkspace.tsx',
      'src/components/quiz/ResultSummary.tsx',
    ]) {
      expect(onOf([f]), f).toEqual(['sweep', 'ui']);
    }
  });

  it('출제 목록·채점 흐름 훅은 logic이면서 전수 스윕 대상이다', () => {
    expect(onOf(['src/hooks/useQuizSession.ts'])).toEqual(['logic', 'sweep']);
    expect(onOf(['src/hooks/useQuestions.ts'])).toEqual(['logic', 'mutationCore', 'mutationStorage', 'sweep']);
    expect(onOf(['src/utils/sessionDerive.ts'])).toEqual(['logic', 'mutationCore', 'sweep']);
    expect(onOf(['src/hooks/useTheme.ts'])).toEqual(['logic']);
  });

  it('렌더 경로의 유닛 테스트만 바뀌면 스윕을 켜지 않는다', () => {
    expect(onOf(['src/utils/parser.render.test.ts'])).toEqual(['unit']);
  });

  it('E2E 스펙은 속한 Playwright 프로젝트의 영역만, 공용 파일은 모든 프로젝트를 켠다', () => {
    expect(onOf(['e2e/react-quick.spec.ts'])).toEqual(['e2e']);
    expect(onOf(['e2e/explore-monkey.spec.ts'])).toEqual(['explore']);
    expect(onOf(['e2e/nonfunctional.spec.ts'])).toEqual(['nonfunctional']);
    expect(onOf(['e2e/apk-functional.spec.ts'])).toEqual(['apk']);
    for (const f of ['e2e/helpers.ts', 'e2e/fixtures.ts']) {
      expect(onOf([f]), f).toEqual(['apk', 'e2e', 'explore', 'nonfunctional']);
    }
  });

  it('컴포넌트는 ui, 훅은 logic, 안드로이드는 android', () => {
    expect(onOf(['src/components/stats/StatsDashboard.tsx'])).toEqual(['ui']);
    expect(onOf(['src/hooks/useBackDismiss.ts'])).toEqual(['logic']);
    expect(onOf(['capacitor.config.json'])).toEqual(['android']);
    expect(onOf(['android/app/build.gradle'])).toEqual(['android', 'native']);
  });
});

describe('mutationScopes — import 그래프', () => {
  const tree: Record<string, string> = {
    'src/t.ts': "import { d } from './d';\nexport const t = d;",
    'src/d.ts': 'export const d = 1;',
    'src/mid.ts': "import {\n  t,\n} from './t';\nexport const m = t;",
    'src/other.ts': 'export const o = 1;',
    'src/typeonly.test.ts': "import type { T } from './t';\nimport { o } from './other';",
    'src/direct.test.ts': "import { t } from './t';\nimport { o } from './other';",
    'src/viaMid.test.ts': "import { m } from './mid';",
    'src/dynamic.test.ts': "type M = typeof import('./other');\nconst load = () => import('./t');",
  };
  const scopes = mutationScopes({
    srcFiles: Object.keys(tree),
    read: (f) => tree[f] ?? null,
    configs: { 'stryker.config.json': { mutate: ['src/t.ts'] }, 'stryker.storage.config.json': { mutate: [] } },
  });
  const files = [...scopes.mutationCore.files].sort();

  it('대상·의존 모듈·닿는 테스트(정적·동적·여러 줄 import)·길목 모듈을 담는다', () => {
    expect(files).toEqual(['src/d.ts', 'src/direct.test.ts', 'src/dynamic.test.ts', 'src/mid.ts', 'src/t.ts', 'src/viaMid.test.ts']);
  });

  it('타입만 가져오는 테스트와, 테스트가 대상과 무관하게 부르는 모듈은 뺀다', () => {
    expect(files).not.toContain('src/typeonly.test.ts');
    expect(files).not.toContain('src/other.ts');
  });
});

describe('changedFiles — git 이름 바꾸기', () => {
  it('옮긴 파일의 원래 경로도 목록에 남는다(데이터를 DATA/로 옮겨도 data 영역이 켜진다)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'changed-areas-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    mkdirSync(join(dir, 'www/data'), { recursive: true });
    writeFileSync(join(dir, 'www/data/x.json'), JSON.stringify({ q: 'x'.repeat(200) }));
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    mkdirSync(join(dir, 'DATA'));
    renameSync(join(dir, 'www/data/x.json'), join(dir, 'DATA/x.json'));
    git('add', '-A');
    git('commit', '-q', '-m', 'move');

    const files = changedFiles('HEAD~1', { cwd: dir });
    expect(files).toContain('www/data/x.json');
    expect(classify(files ?? []).data).toBe(true);
  });
});
