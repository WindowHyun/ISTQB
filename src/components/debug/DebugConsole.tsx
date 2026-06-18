import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  subscribe, getLogs, clearLogs, isDebugEnabled, setDebugEnabled, LogLevel,
} from '../../utils/debugLog';

const LEVEL_TAG: Record<LogLevel, string> = {
  log: 'LOG', info: 'INFO', warn: 'WARN', error: 'ERR', debug: 'DBG',
};

function fmtTime(t: number) {
  const d = new Date(t);
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

// 화면 콘솔 오버레이. isDebugEnabled() 일 때만 표시. 플로팅 버튼 → 패널 토글.
export const DebugConsole = () => {
  const logs = useSyncExternalStore(subscribe, getLogs, getLogs);
  // 활성 상태도 같은 버스로 구독(설정 토글/?debug 반영).
  const enabled = useSyncExternalStore(subscribe, isDebugEnabled, isDebugEnabled);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'error'>('all');

  // 패널이 열려 있고 새 로그가 들어오면 맨 아래로 스크롤.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById('debug-console-body');
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, open]);

  if (!enabled) return null;

  const shown = filter === 'error' ? logs.filter((l) => l.level === 'error' || l.level === 'warn') : logs;
  const errCount = logs.filter((l) => l.level === 'error').length;

  return (
    <div className="debug-console" data-testid="debug-console">
      <button
        type="button"
        className="dc-fab"
        data-testid="debug-fab"
        aria-label="화면 콘솔 열기/닫기"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {'</>'}{errCount > 0 && <span className="dc-badge">{errCount}</span>}
      </button>

      {open && (
        <section className="dc-panel" role="dialog" aria-label="화면 콘솔">
          <header className="dc-head">
            <strong>콘솔 <span className="dc-count">{logs.length}</span></strong>
            <div className="dc-actions">
              <button
                type="button"
                className={filter === 'all' ? 'on' : ''}
                onClick={() => setFilter('all')}
              >전체</button>
              <button
                type="button"
                className={filter === 'error' ? 'on' : ''}
                onClick={() => setFilter('error')}
              >오류</button>
              <button type="button" onClick={clearLogs} data-testid="debug-clear">비우기</button>
              <button type="button" onClick={() => setDebugEnabled(false)} data-testid="debug-off">끄기</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기">✕</button>
            </div>
          </header>
          <div className="dc-body" id="debug-console-body" data-testid="debug-body">
            {shown.length === 0 ? (
              <p className="dc-empty">로그가 없습니다.</p>
            ) : (
              shown.map((l) => (
                <div key={l.id} className={`dc-row dc-${l.level}`}>
                  <span className="dc-tag">{LEVEL_TAG[l.level]}</span>
                  <span className="dc-time">{fmtTime(l.time)}</span>
                  <span className="dc-text">{l.text}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
};
