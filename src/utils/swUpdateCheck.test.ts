// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startUpdateChecks,
  SW_UPDATE_PERIOD_MS,
  SW_UPDATE_MIN_INTERVAL_MS,
} from './swUpdateCheck';

// jsdom의 visibilityState는 읽기 전용이라 getter를 갈아끼워 흉내낸다.
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function visibilityChange(state: DocumentVisibilityState): void {
  setVisibility(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

function makeRegistration() {
  return { update: vi.fn((): Promise<unknown> => Promise.resolve()) };
}

describe('swUpdateCheck', () => {
  let registration: ReturnType<typeof makeRegistration>;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    registration = makeRegistration();
    setVisibility('visible');
    stop = startUpdateChecks(registration);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('등록 직후에는 곧바로 다시 묻지 않는다', () => {
    // 방금 sw.js를 받아 오면서 등록된 참이다.
    visibilityChange('visible');
    window.dispatchEvent(new Event('focus'));
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('앱으로 돌아오면 확인한다', () => {
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    visibilityChange('visible');
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('화면이 가려질 때는 확인하지 않는다', () => {
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    visibilityChange('hidden');
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('창이 포커스를 되찾으면 확인한다 — 탭을 바꾸지 않고 다른 앱을 다녀오는 경우다', () => {
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('focus'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('네트워크가 돌아오면 확인한다', () => {
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('online'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('최소 간격 안에 겹친 확인은 건너뛰고, 지나면 다시 묻는다', () => {
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    visibilityChange('visible');
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    expect(registration.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS - 1);
    window.dispatchEvent(new Event('focus'));
    expect(registration.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    window.dispatchEvent(new Event('focus'));
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('앱을 켜 둔 채로도 주기마다 확인한다', () => {
    vi.advanceTimersByTime(SW_UPDATE_PERIOD_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SW_UPDATE_PERIOD_MS);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('해제하면 리스너와 타이머가 모두 걷힌다', () => {
    stop();
    vi.advanceTimersByTime(SW_UPDATE_PERIOD_MS * 3);
    visibilityChange('visible');
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('기기 시각이 뒤로 조정돼도 확인이 얼어붙지 않는다', () => {
    // 되감긴 만큼(여기서는 하루) 확인이 멈추면 그 사이 배포는 전달되지 않는다.
    vi.setSystemTime(Date.now() - 24 * 60 * 60 * 1000);
    window.dispatchEvent(new Event('focus'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('확인이 실패해도 예외가 새지 않는다 — 오프라인이면 정상적으로 실패한다', async () => {
    registration.update.mockRejectedValue(new Error('offline'));
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    expect(() => window.dispatchEvent(new Event('focus'))).not.toThrow();
    // 거부가 .catch로 삼켜지는지 본다 — 마이크로태스크만 흘리고 타이머는 건드리지 않는다.
    await Promise.resolve();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });
});
