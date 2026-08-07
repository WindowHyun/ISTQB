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
