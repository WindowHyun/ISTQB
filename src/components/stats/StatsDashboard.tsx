import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { ExamHistory } from '../../store/useQuizStore';
import { SetSummary } from '../../hooks/useQuestions';
import { formatClock } from '../../utils/time';
import { displayRatePercent } from '../../utils/scoring';
import { aggregateChapterStats, weightedRatePercent } from '../../utils/chapterStats';
import { buildSetTimelines, formatDeltaPp } from '../../utils/attemptStats';
import { ConfirmButtons } from '../common/ConfirmButtons';

// 챕터 정답률이 합격 컷 미만이면 '약점'으로 강조한다 — 자격증별 컷과 동일 기준
// (ISTQB 65% / CSTS 75%). 고정 65는 CSTS에서 66~74% 약점을 놓친다.
const WEAK_THRESHOLD_BY_CERT: Record<string, number> = { istqb: 65, csts: 75 };

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
  /** 챕터 집중 연습 진입(현재 세트를 해당 챕터로 필터해 연습 모드로). */
  onPracticeChapter: (chapter: string) => void;
  /** 시험 응시 중(잠금)이면 연습 진입 버튼을 비활성화한다(핸들러 가드와 이중 방어). */
  practiceLocked?: boolean;
  /** 현재 제품(약점 임계값 결정 — istqb 65% / csts 75%). */
  certification?: 'istqb' | 'csts' | null;
}

export const StatsDashboard = ({ histories, sets, onClose, onClear, onPracticeChapter, practiceLocked, certification }: StatsDashboardProps) => {
  const weakThreshold = WEAK_THRESHOLD_BY_CERT[certification ?? 'istqb'] ?? 65;
  const rows = useMemo(() => {
    const titleOf = (setId: string) => sets.find((s) => s.id === setId)?.title || setId;
    return Object.values(histories)
      .map((h) => ({
        ...h,
        title: titleOf(h.setId),
        // Number(h.id)는 NaN일 수 있어 ??로 걸러지지 않는다 — ||로 0 폴백.
        when: h.createdAt ?? (Number(h.id) || 0),
        // 결과 모달(evaluatePass)과 같은 내림 기준 — 화면마다 퍼센트가 어긋나지 않게.
        rate: h.total ? displayRatePercent(h.correct ?? 0, h.total) : null,
      }))
      .sort((a, b) => b.when - a.when);
  }, [histories, sets]);

  const summary = useMemo(() => {
    const scored = rows.filter((r) => r.rate !== null);
    if (!scored.length) return null;
    // 평균은 문항 수 가중(정답 합/출제 합) — 회차별 %의 단순 평균은
    // 문항 수가 다른 회차(랜덤 40 vs 시험 70)를 왜곡한다.
    const avg = weightedRatePercent(Object.values(histories));
    const best = Math.max(...scored.map((r) => r.rate ?? 0));
    return { attempts: rows.length, avg: avg ?? 0, best };
  }, [rows, histories]);

  // 챕터별 정답률(약점 분석) — 정답률 오름차순(약한 챕터 먼저).
  const chapterRows = useMemo(() => {
    const agg = aggregateChapterStats(Object.values(histories));
    return Object.entries(agg)
      .map(([name, { c, t }]) => ({ name, c, t, rate: displayRatePercent(c, t) }))
      .sort((a, b) => a.rate - b.rate || b.t - a.t);
  }, [histories]);
  // 챕터 집계가 없는(구버전에서 채점한) 회차가 섞여 있으면 안내한다.
  const legacyCount = useMemo(
    () => Object.values(histories).filter((h) => h.total != null && !h.chapterStats).length,
    [histories],
  );

  // 성장 추이 — 최근 회차(오래된 → 최신)의 정답률 미니 바.
  const trend = useMemo(
    () => rows.filter((r) => r.rate !== null).slice(0, 12).reverse(),
    [rows],
  );

  // 세트별 회차 타임라인(Phase 2 학습 누적) — 세트마다 1회차→2회차… 정답률 추이·성장폭.
  const timelines = useMemo(
    () => buildSetTimelines(Object.values(histories), (id) => sets.find((s) => s.id === id)?.title || id),
    [histories, sets],
  );

  // 파괴적 액션은 공용 2단계 확인 버튼으로(window.confirm은 차단형이고 모달/토스트 체계와 불일치).
  const headerExtra =
    rows.length > 0 ? (
      <ConfirmButtons
        label="이력 비우기"
        confirmLabel="정말 삭제"
        confirmTestId="stats-clear-confirm"
        onConfirm={onClear}
      />
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
                <div><span title="문항 수 가중 평균(정답 합 ÷ 출제 합)">평균 정답률</span><strong>{summary.avg}%</strong></div>
                <div><span>최고 정답률</span><strong>{summary.best}%</strong></div>
              </div>
            )}

            {chapterRows.length > 0 && (
              <section className="stats-chapters" aria-label="챕터별 정답률" data-testid="stats-chapters">
                {/* 진단은 전 세트 합산, '연습' 진입은 현재 세트 한정 — 기준 차이를 라벨로 명시(A1). */}
                <h4>챕터별 정답률 <small>전 세트 합산 · 낮은 순 — 연습은 현재 세트에서 진행</small></h4>
                <ul>
                  {chapterRows.map((ch) => (
                    <li key={ch.name} className={ch.rate < weakThreshold ? 'weak' : ''} data-testid="stats-chapter-row">
                      <span className="sc-name">{ch.name}</span>
                      <span className="sc-bar" aria-hidden="true">
                        <i style={{ width: `${ch.rate}%` }} />
                      </span>
                      <span className="sc-rate">{ch.rate}% <small>({ch.c}/{ch.t})</small></span>
                      <button
                        type="button"
                        className="sc-practice"
                        data-testid="chapter-practice-btn"
                        disabled={practiceLocked}
                        title={practiceLocked
                          ? '시험 응시 중에는 집중 연습을 시작할 수 없습니다. 먼저 채점하세요.'
                          : `현재 세트에서 '${ch.name}' 문항만 연습`}
                        onClick={() => onPracticeChapter(ch.name)}
                      >
                        연습
                      </button>
                    </li>
                  ))}
                </ul>
                {legacyCount > 0 && (
                  <p className="stats-hint">챕터 집계가 없는 이전 회차 {legacyCount}건은 제외됨(새로 채점하면 반영).</p>
                )}
              </section>
            )}
            {chapterRows.length === 0 && legacyCount > 0 && (
              <p className="stats-hint" data-testid="stats-chapters-empty">
                챕터별 분석은 이번 버전에서 채점한 회차부터 집계됩니다.
              </p>
            )}

            {trend.length >= 2 && (
              <section className="stats-trend" aria-label="정답률 추이" data-testid="stats-trend">
                <h4>정답률 추이 <small>최근 {trend.length}회 (왼쪽이 과거)</small></h4>
                {/* 스크린리더용 요약(B2) — 막대는 aria-hidden이라 값이 전달되지 않는다. */}
                <p className="sr-only">
                  최근 {trend.length}회 정답률: {trend.map((r) => `${r.rate}%`).join(' → ')}
                </p>
                <div className="trend-bars" aria-hidden="true">
                  {trend.map((r) => (
                    <i
                      key={r.id}
                      style={{ height: `${Math.max(r.rate ?? 0, 4)}%` }}
                      className={(r.rate ?? 0) < weakThreshold ? 'weak' : ''}
                      title={`${r.title} · ${r.rate}%`}
                    />
                  ))}
                </div>
              </section>
            )}

            {timelines.length > 0 && (
              <section className="stats-timelines" aria-label="세트별 회차 이력" data-testid="stats-set-timeline">
                <h4>세트별 회차 이력 <small>응시할수록 쌓이는 성장 기록</small></h4>
                {timelines.map((tl) => (
                  <div key={tl.setId} className="set-timeline" data-testid="set-timeline-item">
                    <div className="stl-head">
                      <span className="stl-title">{tl.title}</span>
                      <span className="stl-count">{tl.attempts.length}회차</span>
                      {/* 성장폭은 같은 모드 회차 간 비교일 때만 표시(A2) — 라벨 규칙은 공용 formatDeltaPp. */}
                      {tl.improvement != null && (
                        <span
                          className={`stl-improve ${formatDeltaPp(tl.improvement).dir}`}
                          title="같은 모드의 첫 회차 대비 최신 회차 정답률 변화"
                        >
                          {formatDeltaPp(tl.improvement).label}
                        </span>
                      )}
                    </div>
                    <ol className="stl-rounds">
                      {tl.attempts.map((at) => (
                        <li key={at.id} className={at.rate < weakThreshold ? 'weak' : ''}>
                          <span className="stl-round-no">{at.round}회</span>
                          <span className="stl-round-mode">{MODE_LABEL[at.mode] || at.mode}</span>
                          <span className="stl-round-rate">{at.rate}%</span>
                          {at.deltaFromPrev != null && at.deltaFromPrev !== 0 && (
                            <span className={`stl-round-delta ${at.deltaFromPrev > 0 ? 'up' : 'down'}`}>
                              {at.deltaFromPrev > 0 ? `+${at.deltaFromPrev}` : at.deltaFromPrev}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </section>
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
