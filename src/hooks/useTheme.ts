import { useEffect, useState } from 'react';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

export type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'istqb-theme';

/**
 * 테마 환경설정(system/light/dark)을 관리한다.
 * - system: OS 선호(prefers-color-scheme)를 따르고 변경을 실시간 반영.
 * - 적용은 body[data-theme] 속성으로 하고, 전역 CSS가 색 토큰을 덮어쓴다.
 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(
    () => (safeGetItem(STORAGE_KEY) as ThemePref) || 'system',
  );

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
