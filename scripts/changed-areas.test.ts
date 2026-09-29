import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { classify, AREAS } = require_('./changed-areas.js') as {
  classify: (files: string[]) => Record<string, boolean>;
  AREAS: string[];
};

const onOf = (files: string[]) =>
  Object.entries(classify(files)).filter(([, v]) => v).map(([k]) => k).sort();

describe('changed-areas — 변경 파일 → 검증 영역', () => {
  it('문서만 바뀌면 아무 영역도 켜지 않는다', () => {
    expect(onOf(['README.md', 'docs/harness/data.md', 'AGENTS.md'])).toEqual([]);
  });

  it('저장 계층 뮤테이션은 변이 대상·import 모듈·설정에서만 켜진다', () => {
    for (const f of [
      'src/utils/storage.ts',
      'src/utils/storage.import.test.ts',
      'src/store/useQuizStore.ts',
      'src/utils/answerKey.ts',
      'src/utils/roundHistory.ts',
      'stryker.storage.config.json',
    ]) {
      expect(classify([f]).mutationStorage, f).toBe(true);
    }
    for (const f of ['src/utils/scoring.ts', 'src/components/quiz/QuestionCard.tsx', 'e2e/react-quick.spec.ts']) {
      expect(classify([f]).mutationStorage, f).toBe(false);
    }
  });

  it('의존성·도구 설정 변경은 전 영역을 켠다', () => {
    for (const f of ['package-lock.json', 'playwright.config.ts', 'vite.config.ts', 'tsconfig.test.json']) {
      expect(onOf([f]), f).toEqual([...AREAS].sort());
    }
  });

  it('모르는 파일(워크플로 등)은 넓게 잡는다', () => {
    expect(onOf(['.github/workflows/ci.yml'])).toEqual([...AREAS].sort());
  });

  it('데이터 변경은 data + sweep', () => {
    expect(onOf(['www/data/istqb/ISTQB-A.json'])).toEqual(['data', 'sweep']);
  });

  it('parser.tsx는 ui이면서 전수 스윕 대상이다', () => {
    expect(onOf(['src/utils/parser.tsx'])).toEqual(['sweep', 'ui']);
  });

  it('렌더·채점 경로의 유닛 테스트만 바뀌면 스윕을 켜지 않는다', () => {
    expect(onOf(['src/utils/scoring.test.ts', 'src/utils/parser.render.test.ts'])).toEqual(['unit']);
  });

  it('컴포넌트는 ui, 훅·유틸은 logic, e2e는 e2e, 안드로이드는 android', () => {
    expect(onOf(['src/components/stats/StatsDashboard.tsx'])).toEqual(['ui']);
    expect(onOf(['src/hooks/useQuizSession.ts'])).toEqual(['logic']);
    expect(onOf(['e2e/helpers.ts'])).toEqual(['e2e']);
    expect(onOf(['capacitor.config.json'])).toEqual(['android']);
  });
});
