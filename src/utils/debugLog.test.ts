// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setDebugEnabled, isDebugEnabled, getLogs, clearLogs } from './debugLog';

describe('debugLog 화면 콘솔 버스', () => {
  beforeEach(() => { setDebugEnabled(true); clearLogs(); });

  it('활성화하면 console.log/error를 버퍼에 캡처한다', () => {
    console.log('hello', 42);
    console.error(new Error('boom'));
    const logs = getLogs();
    expect(logs.some((l) => l.level === 'log' && l.text.includes('hello') && l.text.includes('42'))).toBe(true);
    expect(logs.some((l) => l.level === 'error' && l.text.includes('boom'))).toBe(true);
  });

  it('clearLogs는 버퍼를 비운다', () => {
    console.log('x');
    expect(getLogs().length).toBeGreaterThan(0);
    clearLogs();
    expect(getLogs().length).toBe(0);
  });

  it('setDebugEnabled(false)는 비활성으로 바꾼다(localStorage 반영)', () => {
    expect(isDebugEnabled()).toBe(true);
    setDebugEnabled(false);
    expect(isDebugEnabled()).toBe(false);
  });

  it('객체 인자도 안전하게 문자열화한다', () => {
    setDebugEnabled(true);
    console.log({ a: 1, b: 'two' });
    expect(getLogs().some((l) => l.text.includes('"a":1'))).toBe(true);
  });

  it('비활성화하면 버퍼 적재도 멈춘다(오버레이만 숨는 것이 아님)', () => {
    setDebugEnabled(false);
    clearLogs();
    console.log('captured-while-off');
    expect(getLogs().some((l) => l.text.includes('captured-while-off'))).toBe(false);
    // 다시 켜면 이후 로그부터 캡처된다.
    setDebugEnabled(true);
    console.log('captured-while-on');
    expect(getLogs().some((l) => l.text.includes('captured-while-on'))).toBe(true);
  });
});

/**
 * 실기기 진단용 화면 콘솔 — 여기서 죽으면 "원인을 보려던 도구가 원인을 만든다".
 * 문자열화와 전역 오류 포착이 어떤 입력에도 견디는지 고정한다.
 */
describe('debugLog 문자열화·전역 오류 포착', () => {
  beforeEach(() => { setDebugEnabled(true); clearLogs(); });

  it('Error는 이름과 메시지로 남긴다(빈 객체 {}가 되지 않게)', () => {
    console.error(new TypeError('없는 속성'));
    expect(getLogs()[0].text).toBe('TypeError: 없는 속성');
  });

  it('순환 참조 객체도 문자열화한다(JSON.stringify가 던지는 입력)', () => {
    const cyclic: Record<string, unknown> = { name: 'a' };
    cyclic.self = cyclic;
    console.log(cyclic);
    expect(getLogs()).toHaveLength(1);
    expect(getLogs()[0].text).toContain('object');
  });

  it('중첩된 Error도 문자열로 풀어 남긴다', () => {
    console.warn({ cause: new RangeError('범위 밖') });
    expect(getLogs()[0].text).toContain('RangeError: 범위 밖');
  });

  it('처리되지 않은 전역 오류를 잡아 남긴다', () => {
    window.dispatchEvent(new ErrorEvent('error', {
      message: '터짐', filename: 'app.js', lineno: 12, colno: 3,
    }));
    expect(getLogs().some((l) => l.level === 'error' && l.text.includes('터짐 @ app.js:12:3'))).toBe(true);
  });

  it('처리되지 않은 Promise 거부도 잡는다(Error가 아닌 이유까지)', () => {
    const withReason = (reason: unknown) => {
      const e = new Event('unhandledrejection') as Event & { reason?: unknown };
      e.reason = reason;
      window.dispatchEvent(e);
    };
    withReason(new Error('거부됨'));
    withReason('문자열 거부');
    const texts = getLogs().map((l) => l.text);
    expect(texts.some((t) => t.includes('Unhandled rejection: 거부됨'))).toBe(true);
    expect(texts.some((t) => t.includes('Unhandled rejection: 문자열 거부'))).toBe(true);
  });
});
