// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readThemePref } from './useTheme';

// 저장된 테마 환경설정 읽기 — 손상값이 들어와도 앱이 고착되지 않아야 한다.
// 종전에는 `as ThemePref` 단언이라 "purple" 같은 값이 그대로 통과했고, 그러면
// pref !== 'system'이 되어 matchMedia 구독이 걸리지 않아 OS 테마 변경에 영영 반응하지
// 않는 상태가 됐다(색도 깨진다 — 어느 토큰도 매칭되지 않으므로).
const KEY = 'istqb-theme';

beforeEach(() => localStorage.clear());

describe('readThemePref', () => {
  it('저장값이 없으면 system', () => {
    expect(readThemePref()).toBe('system');
  });

  it.each(['system', 'light', 'dark'] as const)('유효한 값 %s는 그대로 쓴다', (v) => {
    localStorage.setItem(KEY, v);
    expect(readThemePref()).toBe(v);
  });

  it.each(['purple', '', 'SYSTEM', 'null', '{}'])('알 수 없는 값 %j는 system으로 떨어진다', (v) => {
    localStorage.setItem(KEY, v);
    expect(readThemePref()).toBe('system');
  });
});
