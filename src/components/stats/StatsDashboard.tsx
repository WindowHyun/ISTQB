import { useMemo } from 'react';
import { Modal } from '../common/Modal';
import { ExamHistory } from '../../store/useQuizStore';
import { SetSummary } from '../../hooks/useQuestions';
import { formatClock } from '../../utils/time';
import { displayRatePercent } from '../../utils/scoring';
import { aggregateChapterStats, aggregateLatestChapterStats, weightedRatePercent } from '../../utils/chapterStats';
import {
  buildSetTimelines, buildMiniTestRounds, formatDeltaPp, attemptRatePercent, isSetLevelRound,
} from '../../utils/attemptStats';
import { ConfirmButtons } from '../common/ConfirmButtons';
import { MODE_LABEL } from '../../utils/modeLabel';

// 챕터 정답률이 합격 컷 미만이면 '약점'으로 강조한다 — 자격증별 컷과 동일 기준
// (ISTQB 65% / CSTS 75%). 고정 65는 CSTS에서 66~74% 약점을 놓친다.
const WEAK_THRESHOLD_BY_CERT: Record<string, number> = { istqb: 65, csts: 75 };

// 약점 순위에 올리기 위한 최소 누적 출제 수. 이보다 적으면 정답률이 0%/100%로 널뛰어
// 순위가 실력이 아니라 표본 크기를 반영한다(1문항 챕터는 맞히면 100%, 틀리면 0%).
// 세트 하나로는 못 채워도 여러 회차·세트에 걸쳐 누적되면 순위로 올라온다.
const MIN_CHAPTER_SAMPLE = 5;

// 회차 날짜 표기 — 로케일을 ko-KR로 고정한다. toLocaleDateString()을 인자 없이 쓰면
// 브라우저 로케일을 따라가, 한국어 앱인데 기기에 따라 "6/15/2025"(미국식)로 나온다.
// 포매터를 모듈 상수로 재사용한다: 이력이 수천 건 쌓이면 행마다 Intl 객체를 새로
// 만드는 비용이 통계 렌더 시간에 그대로 실린다(NF12는 1,000건 렌더를 예산으로 잰다).
const ROUND_DATE_FMT = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' });
const ROUND_TIME_FMT = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
// 날짜만 찍으면 하루에 여러 번 응시했을 때 세 줄이 모두 같은 값이라 방금 친 회차를
// 가려낼 수 없다. 오늘 회차는 시각만, 이전 회차는 날짜+시각으로 보여준다.
function formatRoundDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  const time = ROUND_TIME_FMT.format(d);
  return sameDay ? `오늘 ${time}` : `${ROUND_DATE_FMT.format(d)} ${time}`;
}

interface StatsDashboardProps {
  histories: Record<string, ExamHistory>;
  sets: SetSummary[];
  onClose: () => void;
  onClear: () => void;
  /** 챕터 집중 연습 진입(현재 세트를 해당 챕터로 필터해 연습 모드로). */
  onPracticeChapter: (chapter: string) => void;
  /** 챕터 미니 시험 진입(해당 챕터에서 최대 10문항 추첨, 채점 시 챕터 통계에 반영). */
  onMiniTestChapter: (chapter: string) => void;
  /** 시험 응시 중(잠금)이면 연습 진입 버튼을 비활성화한다(핸들러 가드와 이중 방어). */
  practiceLocked?: boolean;
  /** 현재 제품(약점 임계값 결정 — istqb 65% / csts 75%). */
  certification?: 'istqb' | 'csts' | null;
  /** 회차 1건 삭제 — 잘못 제출한 회차 때문에 이력을 통째로 버리지 않아도 되게. */
  onDeleteRound: (id: string) => void;
}

export const StatsDashboard = ({ histories, sets, onClose, onClear, onPracticeChapter, onMiniTestChapter, practiceLocked, certification, onDeleteRound }: StatsDashboardProps) => {
  const weakThreshold = WEAK_THRESHOLD_BY_CERT[certification ?? 'istqb'] ?? 65;
  // 빈 상태 판정에만 쓰는 개수. 실전·미니를 모두 세어, 미니만 푼 사용자에게
  // "기록 없음"이 뜨지 않게 한다(미니 섹션에는 내용이 있으므로 모순이 된다).
  const roundCount = Object.keys(histories).length;

  // 요약은 '실전 회차'(세트 전체)만 센다.
  // 종전에는 챕터 미니(10문항)까지 섞여, 미니에서 10/10을 받으면 실전 최고가 65%인데도
  // "최고 정답률 100%"로 보였다. 합격 가늠이 목적인 지표라 표본을 섞으면 안 된다.
  // 응시 횟수·평균·최고가 모두 같은 집합(isSetLevelRound)을 쓰므로 아래 타임라인의
  // 회차 수와도 일치한다(종전엔 요약 5 / 타임라인 3으로 어긋났다).
  const summary = useMemo(() => {
    const setLevel = Object.values(histories).filter(isSetLevelRound);
    const scored = setLevel.filter((h) => h.total).map(attemptRatePercent);
    if (!scored.length) return null;
    // 평균은 문항 수 가중(정답 합/출제 합) — 회차별 %의 단순 평균은
    // 문항 수가 다른 회차(랜덤 40 vs 시험 70)를 왜곡한다.
    const avg = weightedRatePercent(setLevel);
    return { attempts: scored.length, avg: avg ?? 0, best: Math.max(...scored) };
  }, [histories]);

  // 세트 제목 조회 — index.json에서 세트가 제거·개명되면 sets에서 못 찾는다.
  // 그때 setId를 그대로 쓰면 "istqb/sample-a.json" 같은 내부 경로가 사용자에게 보이므로,
  // 채점 시점에 이력에 저장해 둔 setTitle을 먼저 쓴다.
  const titleOf = useMemo(() => {
    const savedTitles = new Map<string, string>();
    for (const h of Object.values(histories)) {
      if (h.setTitle) savedTitles.set(h.setId, h.setTitle);
    }
    return (id: string) => sets.find((s) => s.id === id)?.title || savedTitles.get(id) || id;
  }, [histories, sets]);

  // 챕터 미니 시험 회차 — 타임라인에선 빠지므로 여기서 챕터명과 함께 보여준다.
  const miniRounds = useMemo(
    () => buildMiniTestRounds(Object.values(histories), titleOf),
    [histories, titleOf],
  );

  // 챕터별 정답률(약점 분석) — 정답률 오름차순(약한 챕터 먼저).
  // 표본이 MIN_CHAPTER_SAMPLE 미만인 챕터는 순위에서 분리한다: 정답률만으로 정렬하면
  // 표본이 가장 작은 챕터가 늘 1위 약점이 된다. 실제 데이터에서 세트당 1~4문항짜리
  // 챕터가 흔해(CSTS 2018은 6개 중 5개), 1문항을 틀린 챕터(0%)가 19문항을 풀어 10%가
  // 나온 진짜 약점보다 위에 온다 — 앱이 엉뚱한 챕터를 공부하라고 지시하게 된다.
  const { rankedChapters, lowSampleChapters, staleRounds } = useMemo(() => {
    const all_ = Object.values(histories);
    // 문항 단위 최신 시도 기준(재풀이해도 분모가 늘지 않는다). 문항 id를 남기지 않던
    // 과거 회차만 있으면 셀 것이 없으므로 종전 누적 방식으로 폴백한다.
    const latest = aggregateLatestChapterStats(all_);
    const useLatest = Object.keys(latest.stats).length > 0;
    const agg = useLatest ? latest.stats : aggregateChapterStats(all_);
    const all = Object.entries(agg)
      .map(([name, { c, t }]) => ({ name, c, t, rate: displayRatePercent(c, t) }))
      .sort((a, b) => a.rate - b.rate || b.t - a.t);
    return {
      rankedChapters: all.filter((ch) => ch.t >= MIN_CHAPTER_SAMPLE),
      // 표본 많은 순 — 판단 보류 그룹 안에서는 '가장 먼저 표본이 찰' 챕터를 위에 둔다.
      lowSampleChapters: all.filter((ch) => ch.t < MIN_CHAPTER_SAMPLE).sort((a, b) => b.t - a.t),
      // 최신 기준으로 셀 때 빠진 과거 회차 수(폴백 중이면 0 — 그때는 전부 집계된다).
      staleRounds: useLatest ? latest.legacyRounds : 0,
    };
  }, [histories]);
  const chapterRows = rankedChapters;
  // 챕터 집계가 없는(구버전에서 채점한) 회차가 섞여 있으면 안내한다.
  const legacyCount = useMemo(
    () => Object.values(histories).filter((h) => h.total != null && !h.chapterStats).length,
    [histories],
  );

  // 세트별 회차 타임라인(Phase 2 학습 누적) — 세트마다 1회차→2회차… 정답률 추이·성장폭.
  const timelines = useMemo(
    () => buildSetTimelines(Object.values(histories), titleOf),
    [histories, titleOf],
  );

  // 파괴적 액션은 공용 2단계 확인 버튼으로(window.confirm은 차단형이고 모달/토스트 체계와 불일치).
  const headerExtra =
    roundCount > 0 ? (
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
        {roundCount === 0 ? (
          <p>아직 채점한 기록이 없습니다. 시험·랜덤 모드에서 채점하면 여기에 누적됩니다.</p>
        ) : (
          <>
            {summary && (
              <>
                <div className="stats-summary" aria-label="요약">
                  <div><span>응시 횟수</span><strong>{summary.attempts}</strong></div>
                  <div><span>평균 정답률</span><strong>{summary.avg}%</strong></div>
                  <div><span>최고 정답률</span><strong>{summary.best}%</strong></div>
                </div>
                {/* 계산 기준은 종전에 title(툴팁)에만 있어 모바일에서 볼 수 없었다. */}
                <p className="stats-hint stats-summary-note" data-testid="stats-summary-note">
                  세트 전체를 푼 <strong>실전 회차</strong>만 셉니다(챕터 미니 시험 제외).
                  평균은 문항 수로 가중해 계산합니다 — 정답 합 ÷ 출제 합.
                </p>
              </>
            )}

            {chapterRows.length > 0 && (
              <section className="stats-chapters" aria-label="챕터별 정답률" data-testid="stats-chapters">
                {/* 진단은 전 세트 합산, '연습'·'미니 시험' 진입은 현재 세트 한정(A1).
                    두 버튼의 차이는 종전에 title(툴팁)에만 있었는데, 모바일은 hover가 없어
                    툴팁이 뜨지 않는다 — 폰으로 쓰는 사용자는 차이를 알 방법이 없었다.
                    화면에 보이는 설명으로 옮기고, 제목은 '왜 쓰는지'를 먼저 말한다. */}
                <h4>약한 챕터부터 <small>풀어 본 문항 기준 · 정답률 낮은 순</small></h4>
                <p className="stats-hint sc-legend">
                  <strong>연습</strong>은 그 챕터 문항을 해설과 함께 익히는 용도예요(기록에 남지 않습니다).
                  {' '}<strong>미니 시험</strong>은 그 챕터에서 <strong>최대 10문항</strong>을 뽑아 채점해
                  정답률을 다시 잽니다(현재 세트에 그보다 적으면 있는 만큼만 출제됩니다).
                </p>
                {/* 종전에는 회차별 출제 수를 그대로 더해, 같은 문항을 다시 풀 때마다 분모가
                    커졌다(6문항 챕터가 "0/18"). 지금은 문항마다 가장 최근 결과만 세므로
                    괄호 안 숫자가 '내가 풀어 본 서로 다른 문항 수'다 — 복습해도 늘지 않는다.
                    설명이 길면 모바일에서 데이터보다 안내가 먼저 화면을 채운다 — 한 줄로 둔다. */}
                <p className="stats-hint sc-legend">
                  괄호 안은 <strong>풀어 본 서로 다른 문항 수</strong> — 다시 풀면 최근 결과로 바뀝니다.
                </p>
                {/* 잠금 사유도 종전엔 툴팁뿐이라 모바일에서는 "버튼이 왜 안 눌리지"로만 보였다. */}
                {practiceLocked && (
                  <p className="stats-hint sc-locked" data-testid="stats-chapter-locked">
                    시험 응시 중에는 시작할 수 없어요. 먼저 채점하세요.
                  </p>
                )}
                <ul>
                  {chapterRows.map((ch) => (
                    <li key={ch.name} className={ch.rate < weakThreshold ? 'weak' : ''} data-testid="stats-chapter-row">
                      <span className="sc-name">{ch.name}</span>
                      <span className="sc-bar" aria-hidden="true">
                        <i style={{ width: `${ch.rate}%` }} />
                      </span>
                      <span className="sc-rate">{ch.rate}% <small>({ch.c}/{ch.t})</small></span>
                      {/* aria-label: 행마다 같은 글자("연습")가 반복돼 스크린리더로는
                          어느 챕터의 버튼인지 알 수 없다 — 챕터명을 함께 읽어준다. */}
                      <button
                        type="button"
                        className="sc-practice"
                        data-testid="chapter-practice-btn"
                        disabled={practiceLocked}
                        aria-label={`${ch.name} 연습`}
                        title={practiceLocked
                          ? '시험 응시 중에는 집중 연습을 시작할 수 없습니다. 먼저 채점하세요.'
                          : `현재 세트에서 '${ch.name}' 문항만 연습 (통계 미기록)`}
                        onClick={() => onPracticeChapter(ch.name)}
                      >
                        연습
                      </button>
                      <button
                        type="button"
                        className="sc-minitest"
                        data-testid="chapter-minitest-btn"
                        disabled={practiceLocked}
                        aria-label={`${ch.name} 미니 시험`}
                        title={practiceLocked
                          ? '시험 응시 중에는 미니 시험을 시작할 수 없습니다. 먼저 채점하세요.'
                          : `'${ch.name}' 미니 시험(최대 10문항) — 채점하면 챕터 통계에 반영`}
                        onClick={() => onMiniTestChapter(ch.name)}
                      >
                        미니 시험
                      </button>
                    </li>
                  ))}
                </ul>
                {legacyCount > 0 && (
                  <p className="stats-hint">챕터 집계가 없는 이전 회차 {legacyCount}건은 제외됨(새로 채점하면 반영).</p>
                )}
                {staleRounds > 0 && (
                  <p className="stats-hint" data-testid="stats-stale-rounds">
                    문항 정보가 없는 이전 회차 {staleRounds}건은 제외됨 — 그 회차는 어떤 문항을
                    풀었는지 남아 있지 않아 중복을 걸러낼 수 없어요(다시 풀면 반영됩니다).
                  </p>
                )}
              </section>
            )}

            {lowSampleChapters.length > 0 && (
              <section className="stats-chapters stats-lowsample" aria-label="표본이 적은 챕터" data-testid="stats-lowsample">
                {/* 표본이 적으면 정답률이 0%/100%로 널뛴다 — 순위에 섞으면 실력이 아니라
                    표본 크기로 줄을 세우게 되므로, 판단을 보류한다고 명시하고 분리한다. */}
                <h4>아직 판단하기 이른 챕터 <small>{MIN_CHAPTER_SAMPLE}문항 미만 · 더 풀면 순위에 올라옵니다</small></h4>
                {chapterRows.length === 0 && (
                  <p className="stats-hint sc-legend">
                    <strong>연습</strong>은 해설과 함께 익히는 용도(기록에 남지 않음),
                    {' '}<strong>미니 시험</strong>은 최대 10문항을 채점해 정답률을 잽니다.
                  </p>
                )}
                <ul>
                  {lowSampleChapters.map((ch) => (
                    <li key={ch.name} data-testid="stats-lowsample-row">
                      <span className="sc-name">{ch.name}</span>
                      <span className="sc-rate sc-rate-weak">
                        <small>{ch.c}/{ch.t}문항</small>
                      </span>
                      <button
                        type="button"
                        className="sc-practice"
                        data-testid="chapter-practice-btn"
                        disabled={practiceLocked}
                        aria-label={`${ch.name} 연습`}
                        onClick={() => onPracticeChapter(ch.name)}
                      >
                        연습
                      </button>
                      <button
                        type="button"
                        className="sc-minitest"
                        data-testid="chapter-minitest-btn"
                        disabled={practiceLocked}
                        aria-label={`${ch.name} 미니 시험`}
                        onClick={() => onMiniTestChapter(ch.name)}
                      >
                        미니 시험
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {chapterRows.length === 0 && legacyCount > 0 && (
              <p className="stats-hint" data-testid="stats-chapters-empty">
                챕터별 분석은 이번 버전에서 채점한 회차부터 집계됩니다.
              </p>
            )}

            {timelines.length > 0 && (
              <section className="stats-timelines" aria-label="세트별 회차 이력" data-testid="stats-set-timeline">
                <h4>세트별 회차 이력 <small>세트 전체를 푼 실전 회차</small></h4>
                {/* 성장폭 설명도 종전엔 title(툴팁)뿐이라 모바일에서 볼 수 없었다. */}
                <p className="stats-hint">
                  모드마다 <strong>첫 회차 → 최신 회차</strong> 변화를 배지로 보여줍니다.
                  시험과 랜덤은 문항 수가 달라 서로 비교하지 않습니다.
                </p>
                {timelines.map((tl) => (
                  <div key={tl.setId} className="set-timeline" data-testid="set-timeline-item">
                    <div className="stl-head">
                      <span className="stl-title">{tl.title}</span>
                      <span className="stl-count">{tl.attempts.length}회차</span>
                      {/* 모드별로 각각 표시 — 종전에는 '최신 회차의 모드' 하나만 계산해,
                          랜덤을 한 번 풀면 시험 성장폭 배지가 통째로 사라졌다. */}
                      {tl.improvements.map((imp) => (
                        <span
                          key={imp.mode}
                          className={`stl-improve ${formatDeltaPp(imp.delta).dir}`}
                          data-testid="stl-improve"
                        >
                          {MODE_LABEL[imp.mode] || imp.mode} {formatDeltaPp(imp.delta).label}
                        </span>
                      ))}
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
                          {/* 소요 시간·날짜는 종전에 아래 중복 목록에만 있었다. 여기로 흡수하면서
                              "10:00"이 시각으로 읽히지 않게 라벨을 붙인다. */}
                          {at.elapsedSeconds != null && (
                            <span className="stl-round-time">소요 {formatClock(at.elapsedSeconds)}</span>
                          )}
                          {at.createdAt > 0 && (
                            <span className="stl-round-date">{formatRoundDate(at.createdAt)}</span>
                          )}
                          <button
                            type="button"
                            className="stl-round-del"
                            data-testid="round-delete-btn"
                            aria-label={`${tl.title} ${at.round}회차 기록 삭제`}
                            title="이 회차 기록만 삭제"
                            onClick={() => onDeleteRound(at.id)}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </section>
            )}

            {miniRounds.length > 0 && (
              <section className="stats-minis" aria-label="챕터 미니 시험 기록" data-testid="stats-mini-rounds">
                {/* 미니 회차는 타임라인에서 빠지므로 여기서 보여준다 — 종전에는 아래 목록에
                    "랜덤 0/10"으로만 떠서 어느 챕터의 미니인지 알 수 없었다. */}
                <h4>챕터 미니 시험 <small>최대 10문항 재측정 · 위 요약에는 넣지 않습니다</small></h4>
                <ul className="mini-rounds">
                  {miniRounds.map((m) => (
                    <li key={m.id} className={m.rate < weakThreshold ? 'weak' : ''} data-testid="mini-round-item">
                      <span className="mr-chapter">{m.chapter}</span>
                      <span className="mr-rate">{m.rate}% <small>({m.correct}/{m.total})</small></span>
                      {m.elapsedSeconds != null && (
                        <span className="mr-time">소요 {formatClock(m.elapsedSeconds)}</span>
                      )}
                      {m.createdAt > 0 && <span className="mr-date">{formatRoundDate(m.createdAt)}</span>}
                      <button
                        type="button"
                        className="stl-round-del"
                        data-testid="round-delete-btn"
                        aria-label={`${m.chapter} 미니 시험 기록 삭제`}
                        title="이 회차 기록만 삭제"
                        onClick={() => onDeleteRound(m.id)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

          </>
        )}
      </div>
    </Modal>
  );
};
