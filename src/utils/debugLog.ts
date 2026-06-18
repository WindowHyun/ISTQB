// 화면 내(in-app) 콘솔 로그 버스 — console.* 와 전역 에러를 가로채 화면 오버레이로 보여준다.
// 외부 의존성 없음(PWA/오프라인 호환). 기본 비활성이며 ?debug 또는 설정 토글로 켠다.

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
export interface LogEntry {
  id: number;
  level: LogLevel;
  text: string;
  time: number;
}

const STORAGE_KEY = 'istqb-debug';
const MAX = 400;
const buffer: LogEntry[] = [];
let snapshot: LogEntry[] = []; // useSyncExternalStore용 캐시(변경 시에만 새 참조)
const listeners = new Set<() => void>();
let seq = 0;
let patched = false;

function emit() {
  snapshot = buffer.slice();
  listeners.forEach((l) => l());
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v, (_k, val) => (val instanceof Error ? String(val) : val));
  } catch {
    return String(v);
  }
}

function push(level: LogLevel, args: unknown[]) {
  buffer.push({ id: ++seq, level, text: args.map(fmt).join(' '), time: Date.now() });
  if (buffer.length > MAX) buffer.shift();
  emit();
}

function patchConsole() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  (['log', 'info', 'warn', 'error', 'debug'] as LogLevel[]).forEach((level) => {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      push(level, args);
    };
  });
  window.addEventListener('error', (e) => {
    push('error', [`${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`]);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason;
    push('error', [`Unhandled rejection: ${r instanceof Error ? r.message : fmt(r)}`]);
  });
}

export function isDebugEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function setDebugEnabled(on: boolean): void {
  try {
    if (on) { localStorage.setItem(STORAGE_KEY, '1'); patchConsole(); }
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage 비가용 환경 무시 */ }
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getLogs(): LogEntry[] { return snapshot; }
export function clearLogs(): void { buffer.length = 0; emit(); }

// 모듈 로드 시: ?debug 쿼리 처리 + 활성 상태면 즉시 콘솔 패치(초기 로그까지 포착).
(function init() {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('debug')) {
      const v = params.get('debug');
      if (v === '0' || v === 'false') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, '1');
    }
  } catch { /* noop */ }
  if (isDebugEnabled()) patchConsole();
})();
