import { useEffect, useState } from 'react';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

export type ThemePref = 'system' | 'light' | 'dark';

// ⚠ 계약: 이 키와 해석 규칙(system→matchMedia, body[data-theme])은
// index.vite.html의 프리페인트 스크립트에 인라인으로 복제되어 있다(게이트 화면 FOUC 방지).
// 키·값·적용 대상을 바꾸면 프리페인트 쪽도 함께 갱신할 것.
const STORAGE_KEY = 'istqb-theme';

/**
 * 테마 환경설정(system/light/dark)을 관리한다.
 * - system: OS 선호(prefers-color-scheme)를 따르고 변경을 실시간 반영.
 * - 적용은 body[data-theme] 속성으로 하고, 전역 CSS가 색 토큰을 덮어쓴다.
 */
const THEME_PREFS: ThemePref[] = ['system', 'light', 'dark'];

/**
 * 저장값을 신뢰하지 않는다. 종전에는 `as ThemePref`로 그냥 단언해서, 손상되거나 손으로
 * 고친 값("purple")이 그대로 body[data-theme]에 실렸다. 그러면 어느 테마 토큰도 걸리지
 * 않아 색이 깨지고, 더 나쁜 것은 `pref === 'system'`이 거짓이라 matchMedia 구독도 걸리지
 * 않아 **OS 테마를 바꿔도 반응하지 않는 상태로 고착**된다는 점이다.
 */
export function readThemePref(): ThemePref {
  const raw = safeGetItem(STORAGE_KEY);
  return THEME_PREFS.includes(raw as ThemePref) ? (raw as ThemePref) : 'system';
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readThemePref);

  useEffect(() => {
    safeSetItem(STORAGE_KEY, pref);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const effective = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
      document.body.dataset.theme = effective;
    };
    apply();
    if (pref === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [pref]);

  return { pref, setPref };
}
