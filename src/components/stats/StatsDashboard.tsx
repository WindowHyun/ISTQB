import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { ExamHistory } from '../../store/useQuizStore';
import { SetSummary } from '../../hooks/useQuestions';
import { formatClock } from '../../utils/time';

const MODE_LABEL: Record<string, string> = {
  exam: '시험',
  random: '랜덤',
  practice: '연습',
  review: '오답',
};

interface StatsDashboardProps {
  histories: Record<string, ExamHistory>;
  sets: SetSummary[];
  onClose: () => void;
  onClear: () => void;
}

export const StatsDashboard = ({ histories, sets, onClose, onClear }: StatsDashboardProps) => {
  const rows = useMemo(() => {
    const titleOf = (setId: string) => sets.find((s) => s.id === setId)?.title || setId;
    return Object.values(histories)
      .map((h) => ({
        ...h,
        title: titleOf(h.setId),
        // Number(h.id)는 NaN일 수 있어 ??로 걸러지지 않는다 — ||로 0 폴백.
        when: h.createdAt ?? (Number(h.id) || 0),
        rate: h.total ? Math.round(((h.correct ?? 0) / h.total) * 100) : null,
      }))
      .sort((a, b) => b.when - a.when);
  }, [histories, sets]);

  const summary = useMemo(() => {
    const scored = rows.filter((r) => r.rate !== null);
    if (!scored.length) return null;
    const avg = Math.round(scored.reduce((s, r) => s + (r.rate ?? 0), 0) / scored.length);
    const best = Math.max(...scored.map((r) => r.rate ?? 0));
    return { attempts: rows.length, avg, best };
  }, [rows]);

  const handleClear = () => {
    if (confirm('저장된 모든 응시 이력을 삭제하시겠습니까?')) onClear();
  };

  const headerExtra =
    rows.length > 0 ? (
      <button type="button" className="danger" onClick={handleClear}>이력 비우기</button>
    ) : null;

  return (
    <Modal title="학습 통계" onClose={onClose} headerExtra={headerExtra}>
      <div className="modal-body" data-testid="stats-dashboard">
        {rows.length === 0 ? (
          <p>아직 채점한 기록이 없습니다. 시험·랜덤 모드에서 채점하면 여기에 누적됩니다.</p>
        ) : (
          <>
            {summary && (
              <div className="stats-summary" aria-label="요약">
                <div><span>응시 횟수</span><strong>{summary.attempts}</strong></div>
                <div><span>평균 정답률</span><strong>{summary.avg}%</strong></div>
                <div><span>최고 정답률</span><strong>{summary.best}%</strong></div>
              </div>
            )}
            <ul className="stats-list">
              {rows.map((r) => (
                <li key={r.id}>
                  <div className="stats-row-main">
                    <span className="stats-set">{r.title}</span>
                    <span className="stats-mode">{MODE_LABEL[r.mode] || r.mode}</span>
                  </div>
                  <div className="stats-row-meta">
                    {r.rate !== null ? (
                      <span className="stats-score">{r.correct} / {r.total} · {r.rate}%</span>
                    ) : (
                      <span className="stats-score">기록 없음</span>
                    )}
                    {r.elapsedSeconds != null && (
                      <span className="stats-time">{formatClock(r.elapsedSeconds)}</span>
                    )}
                    {r.when > 0 && (
                      <span className="stats-date">{new Date(r.when).toLocaleDateString()}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
};
