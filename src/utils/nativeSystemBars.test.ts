// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncNativeSystemBars, watchNativeSystemBars } from './nativeSystemBars';

/**
 * APK 다크 모드에서 앱 위아래에 남던 **흰 띠 두 줄**을 없애는 다리.
 * 웹에는 시스템 바가 없어 어떤 E2E로도 볼 수 없는 자리라, 계약을 여기서 못 박는다.
 */
const bridgeOf = () => (window as unknown as { AndroidTheme?: unknown }).AndroidTheme;
const setBridge = (v: unknown) => { (window as unknown as { AndroidTheme?: unknown }).AndroidTheme = v; };
const clearBridge = () => { delete (window as unknown as { AndroidTheme?: unknown }).AndroidTheme; };

/** globals.css 대신 토큰만 심는다 — 색의 출처가 CSS라는 계약을 그대로 재현한다. */
function styleTokens(light: string, dark: string) {
  const el = document.createElement('style');
  el.textContent = `:root { --surface: ${light}; } body[data-theme="dark"] { --surface: ${dark}; }`;
  document.head.appendChild(el);
  return el;
}

describe('nativeSystemBars', () => {
  let setSystemBars: ReturnType<typeof vi.fn>;
  let style: HTMLStyleElement;

  beforeEach(() => {
    style = styleTokens('#ffffff', '#131c2b');
    setSystemBars = vi.fn();
    setBridge({ setSystemBars });
    delete document.body.dataset.theme;
  });
  afterEach(() => { style.remove(); clearBridge(); });

  it('라이트 테마에서는 표면색과 "밝은 바"를 넘긴다', () => {
    document.body.dataset.theme = 'light';
    syncNativeSystemBars();
    expect(setSystemBars).toHaveBeenCalledWith('#ffffff', true);
  });

  // 이 한 줄이 결함 그 자체다 — 종전에는 네이티브가 흰색으로 박아 둔 채였다.
  it('다크 테마에서는 다크 표면색과 "어두운 바"를 넘긴다', () => {
    document.body.dataset.theme = 'dark';
    syncNativeSystemBars();
    expect(setSystemBars).toHaveBeenCalledWith('#131c2b', false);
  });

  // 색을 여기서 정하지 않는다는 계약. 토큰을 바꾸면 넘기는 값도 따라 바뀌어야 한다 —
  // 값을 복제해 두면 팔레트가 바뀔 때 시스템 바만 조용히 옛 색으로 남는다.
  it('색은 CSS 토큰에서 읽는다(코드에 복제하지 않는다)', () => {
    style.textContent = 'body[data-theme="dark"] { --surface: #010203; }';
    document.body.dataset.theme = 'dark';
    syncNativeSystemBars();
    expect(setSystemBars).toHaveBeenCalledWith('#010203', false);
  });

  // 손상된 저장값이 그대로 실릴 수 있다(useTheme의 readThemePref가 막지 못한 경로).
  // 'dark'가 아니면 라이트로 보아야 흰 바탕에 흰 아이콘이 되는 일이 없다.
  it('알 수 없는 테마 값은 라이트로 본다', () => {
    document.body.dataset.theme = 'purple';
    syncNativeSystemBars();
    expect(setSystemBars).toHaveBeenCalledWith('#ffffff', true);
  });

  it('스타일이 아직 없으면 아무것도 넘기지 않는다(검은 바 방지)', () => {
    style.remove();
    syncNativeSystemBars();
    expect(setSystemBars).not.toHaveBeenCalled();
  });

  it('브리지가 없는 웹에서는 아무 일도 하지 않는다', () => {
    clearBridge();
    expect(() => syncNativeSystemBars()).not.toThrow();
    expect(bridgeOf()).toBeUndefined();
  });

  it('브리지가 던져도 앱을 멈추지 않는다', () => {
    setBridge({ setSystemBars: () => { throw new Error('bridge gone'); } });
    expect(() => syncNativeSystemBars()).not.toThrow();
  });

  it('감시를 걸면 즉시 한 번 맞추고, 테마가 바뀔 때마다 다시 맞춘다', async () => {
    const stop = watchNativeSystemBars();
    expect(setSystemBars).toHaveBeenCalledTimes(1); // 프리페인트가 심어 둔 값

    document.body.dataset.theme = 'dark';
    await vi.waitFor(() => expect(setSystemBars).toHaveBeenCalledTimes(2));
    expect(setSystemBars).toHaveBeenLastCalledWith('#131c2b', false);

    // 다크 → 라이트로 되돌아올 때도 따라와야 한다(아이콘 플래그가 남으면 시계가 사라진다).
    document.body.dataset.theme = 'light';
    await vi.waitFor(() => expect(setSystemBars).toHaveBeenLastCalledWith('#ffffff', true));

    stop();
    document.body.dataset.theme = 'dark';
    const after = setSystemBars.mock.calls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(setSystemBars, '해제 후에도 감시가 살아 있다').toHaveBeenCalledTimes(after);
  });
});
