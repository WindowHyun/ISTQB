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
});
