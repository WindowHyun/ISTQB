import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/**
 * 배포 의존성 계약 — `npm audit --omit=dev`는 `dependencies`·`optionalDependencies`만 잰다.
 * 빌드·테스트 전용 패키지가 거기 들어가면 배포되지 않는 패키지의 권고 때문에 CI가 막힌다
 * (테스트 전용 네이티브 `canvas`가 optionalDependencies에 있었다). 새 런타임 의존성은 번들에 실리는지
 * 확인한 뒤 이 허용 목록에 넣는다.
 */
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  dependencies: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const RUNTIME = new Set(['@capacitor/android', '@capacitor/app', '@capacitor/core', 'lodash-es', 'react', 'react-dom', 'zustand']);

describe('package.json', () => {
  it('dependencies는 런타임 허용 목록 안에 있다', () => {
    const extra = Object.keys(pkg.dependencies).filter((d) => !RUNTIME.has(d));
    expect(extra, '배포 의존성에 새 패키지가 들어왔다 — 번들에 실리는 것인가?').toEqual([]);
  });

  it('optionalDependencies를 쓰지 않는다(테스트 전용 패키지가 audit 대상이 된다)', () => {
    expect(pkg.optionalDependencies ?? {}).toEqual({});
  });
});
