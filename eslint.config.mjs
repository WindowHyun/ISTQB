import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// 플랫 설정. 앱 코드(src/)·E2E(e2e/)·파이프라인 스크립트(scripts/)를 린트한다.
// 레거시 바닐라(script.js 등)는 제외. scripts/는 CJS Node 환경으로 별도 블록.
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'www/**',
      'public/**',
      'android/**',
      'coverage/**',
      '.stryker-tmp*/**', // 설정별 tempDirName(.stryker-tmp, .stryker-tmp-storage …)을 모두 덮는다
      'docs/**',
      'script.js',
      'service-worker.js',
      'local-server.js',
      'test-bug.js',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // E2E 고정 대기 금지 — `page.waitForTimeout`은 "충분히 기다렸겠지"라는 추측이다.
    // 느린 러너에서는 모자라 플래키가 되고, 빠른 러너에서는 남아 시간을 태운다. 더 나쁜 경우
    // 검사가 보려던 경로를 가린다: 새로고침 전 800ms 대기는 디바운스 저장이 먼저 끝나게 해,
    // 새로고침 순간의 저장(flushPersist)이 망가져도 NF11 '즉시 reload'가 통과했다.
    // 상태를 기다릴 때는 자동 재시도 단언(toHaveText 등)이나 expect.poll을 쓴다.
    // "일정 시간 동안 아무 일도 없다"를 보는 부정 단언·시간 측정처럼 대기 자체가 검사인
    // 경우에만 `// eslint-disable-next-line no-restricted-syntax -- <이유>`로 허용한다.
    files: ['e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.property.name='waitForTimeout']",
        message: '고정 대기 대신 상태를 기다린다(자동 재시도 단언·expect.poll). 대기 자체가 검사라면 eslint-disable-next-line에 이유를 적는다.',
      }],
    },
  },
  {
    // 데이터 파이프라인/빌드 스크립트 — 정적 분석 사각지대였던 영역(오타·미정의 참조가
    // CI를 통과해 릴리스 시점에야 드러나던 문제). CJS Node 환경으로 기본 검사만 적용.
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off', // CJS 스크립트는 require 사용
    },
  },
);
