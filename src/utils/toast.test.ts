// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showToast } from './toast';

// 사용자 통지 경로(showToast) — 저장 실패 알림 등 견고성 수정이 의존하는 UI 채널.
describe('showToast', () => {
  afterEach(() => {
    document.getElementById('toast-host')?.remove();
    vi.useRealTimers();
  });

  it('메시지·타입 클래스·role=status로 토스트를 띄운다', () => {
    showToast('저장 실패', 'error');
    const el = document.querySelector('[data-testid="toast"]') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('저장 실패');
    expect(el.className).toContain('toast-error');
    expect(el.getAttribute('role')).toBe('status');
  });

  it('호스트는 1개만 생성되고 aria-live=polite를 가진다', () => {
    showToast('하나');
    showToast('둘');
    const hosts = document.querySelectorAll('#toast-host');
    expect(hosts.length).toBe(1);
    expect(hosts[0].getAttribute('aria-live')).toBe('polite');
    expect(document.querySelectorAll('[data-testid="toast"]').length).toBe(2);
  });

  it('지정 시간이 지나면 자동으로 제거된다', () => {
    vi.useFakeTimers();
    showToast('잠깐', 'info', 1000);
    expect(document.querySelectorAll('[data-testid="toast"]').length).toBe(1);
    vi.advanceTimersByTime(1000 + 300); // duration + 제거 폴백(250ms)
    expect(document.querySelectorAll('[data-testid="toast"]').length).toBe(0);
  });

  it('클릭하면 즉시 닫힌다', () => {
    vi.useFakeTimers();
    showToast('클릭 닫기', 'success', 60_000);
    const el = document.querySelector('[data-testid="toast"]') as HTMLElement;
    el.click();
    vi.advanceTimersByTime(300); // 전환 폴백
    expect(document.querySelectorAll('[data-testid="toast"]').length).toBe(0);
  });
});
