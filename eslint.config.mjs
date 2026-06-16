import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// 플랫 설정. 앱 코드(src/)와 E2E(e2e/)만 린트한다.
// 레거시 바닐라(script.js 등)와 node 스크립트(scripts/)는 별도 환경이라 제외.
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'www/**',
      'public/**',
      'android/**',
      'coverage/**',
      'scripts/**',
      'docs/**',
      'script.js',
      'service-worker.js',
      'local-server.js',
      'server.js',
      'extract_pdf_images.js',
      'clean.js',
      'compare.js',
      'test-bug.js',
      // parser.tsx는 #61(타입화)에서 정리하며 그때 린트에 포함한다.
      'src/utils/parser.tsx',
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
);
