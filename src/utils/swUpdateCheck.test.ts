// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startUpdateChecks,
  SW_UPDATE_PERIOD_MS,
  SW_UPDATE_MIN_INTERVAL_MS,
  probeUpdateBlocked,
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

  // 재연결 직후의 online 이벤트가 이전 실패가 남긴 최소 간격에 막혀, 새 버전 배너가 최대 주기만큼 늦어졌다.
  // 실패한 확인은 '확인한 것'이 아니므로 간격을 소진하지 않는다.
  it('실패한 확인은 최소 간격을 소진하지 않는다 — 곧바로 이어지는 재연결이 다시 묻는다', async () => {
    registration.update.mockRejectedValueOnce(new Error('offline'));
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('focus'));
    expect(registration.update).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();

    window.dispatchEvent(new Event('online'));
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('확인이 진행 중일 때는 겹친 확인을 계속 건너뛴다', () => {
    registration.update.mockReturnValueOnce(new Promise(() => {})); // 끝나지 않는 요청
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('성공한 확인은 간격을 그대로 소진한다', async () => {
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new Event('online'));
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

// R-03(D-01 C): 갱신 실패의 원인이 사이트 인증일 때만 사용자에게 알린다.
describe('인증에 막힌 갱신 알림', () => {
  beforeEach(() => { vi.useFakeTimers(); setVisibility('visible'); });
  afterEach(() => { vi.useRealTimers(); });

  const failing = () => ({ update: vi.fn((): Promise<unknown> => Promise.reject(new Error('401'))) });
  const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

  it('update가 실패하고 인증이 원인이면 한 번 알린다', async () => {
    const onBlocked = vi.fn();
    const stop = startUpdateChecks(failing(), SW_UPDATE_PERIOD_MS, SW_UPDATE_MIN_INTERVAL_MS, {
      onBlocked, probe: () => Promise.resolve(true),
    });
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(onBlocked).toHaveBeenCalledTimes(1);

    // 이후 실패에서는 다시 알리지 않는다(토스트가 쌓이지 않게).
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    stop();
  });

  it('원인이 인증이 아니면(오프라인·서버 오류) 알리지 않는다', async () => {
    const onBlocked = vi.fn();
    const stop = startUpdateChecks(failing(), SW_UPDATE_PERIOD_MS, SW_UPDATE_MIN_INTERVAL_MS, {
      onBlocked, probe: () => Promise.resolve(false),
    });
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(onBlocked).not.toHaveBeenCalled();
    stop();
  });

  it('성공한 확인은 알리지 않고 원인도 묻지 않는다', async () => {
    const onBlocked = vi.fn();
    const probe = vi.fn(() => Promise.resolve(true));
    const stop = startUpdateChecks(makeRegistration(), SW_UPDATE_PERIOD_MS, SW_UPDATE_MIN_INTERVAL_MS, { onBlocked, probe });
    vi.advanceTimersByTime(SW_UPDATE_MIN_INTERVAL_MS);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(probe).not.toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
    stop();
  });

  describe('probeUpdateBlocked', () => {
    const resp = (status: number) => vi.fn(() => Promise.resolve({ status } as Response));
    it('401·403이면 막힌 것이다', async () => {
      expect(await probeUpdateBlocked('/sw.js', resp(401))).toBe(true);
      expect(await probeUpdateBlocked('/sw.js', resp(403))).toBe(true);
    });
    it('200·500·네트워크 오류는 막힌 것이 아니다', async () => {
      expect(await probeUpdateBlocked('/sw.js', resp(200))).toBe(false);
      expect(await probeUpdateBlocked('/sw.js', resp(500))).toBe(false);
      expect(await probeUpdateBlocked('/sw.js', vi.fn(() => Promise.reject(new TypeError('offline'))))).toBe(false);
    });
    it('오프라인이면 묻지 않는다', async () => {
      const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const f = resp(401);
      expect(await probeUpdateBlocked('/sw.js', f)).toBe(false);
      expect(f).not.toHaveBeenCalled();
      spy.mockRestore();
    });
    it('캐시 없이 HEAD로 묻는다(본문을 받지 않고 최신 상태를 본다)', async () => {
      const f = resp(200);
      await probeUpdateBlocked('/sw.js', f);
      expect(f).toHaveBeenCalledWith('/sw.js', expect.objectContaining({ method: 'HEAD', cache: 'no-store' }));
    });
  });
});
