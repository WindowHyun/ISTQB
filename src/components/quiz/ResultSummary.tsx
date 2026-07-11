import { Modal } from '../common/Modal';
import { formatClock } from '../../utils/time';
import { evaluatePass, Certification } from '../../utils/scoring';

interface ResultSummaryProps {
  setTitle: string;
  certification: Certification;
  correct: number;
  total: number;
  elapsedSeconds: number;
  // Phase 2 학습 누적 — 같은 세트·모드 기준 이번이 몇 회차인지, 직전 회차 정답률(%).
  attemptRound?: number;
  previousRate?: number | null;
  // 회차 기준 모드 라벨(예: '시험') — 통계의 세트 타임라인(모드 혼합 회차)과 기준이
  // 다르므로, 어떤 기준의 회차인지 명시해 두 화면의 번호 차이를 오해하지 않게 한다.
  modeLabel?: string;
  onClose: () => void;
  onOpenWrongNote: () => void;
}

export const ResultSummary = ({
  setTitle,
  certification,
  correct,
  total,
  elapsedSeconds,
  attemptRound,
  previousRate,
  modeLabel,
  onClose,
  onOpenWrongNote,
}: ResultSummaryProps) => {
  const { passed, ratePercent, criterionLabel, scoreLabel } = evaluatePass(certification, correct, total);
  const wrong = total - correct;

  // 직전 회차 대비 변화(%p) — 첫 응시(previousRate null)면 "첫 응시"로 안내한다.
  const hasPrev = previousRate != null;
  const delta = hasPrev ? ratePercent - (previousRate as number) : 0;
  const trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  const deltaLabel = delta > 0 ? `▲ +${delta}%p` : delta < 0 ? `▼ ${delta}%p` : '± 0%p';

  return (
    <Modal title="채점 결과" onClose={onClose}>
      <div className="modal-body result-summary" data-testid="result-summary">
        <p className="result-set">{setTitle}</p>

        <div className={`result-score ${passed ? 'pass' : 'fail'}`}>
          <strong data-testid="result-rate">{ratePercent}%</strong>
          <span className="result-badge">{passed ? '합격 기준 충족' : '합격 기준 미달'}</span>
        </div>

        {attemptRound != null && attemptRound > 0 && (
          <p className={`result-compare ${trend}`} data-testid="result-compare">
            <span className="rc-round">{modeLabel ? `${modeLabel} ` : ''}{attemptRound}회차</span>
            {hasPrev ? (
              <>
                <span className="rc-delta" data-testid="result-delta">{deltaLabel}</span>
                <span className="rc-prev">직전 {previousRate}%</span>
              </>
            ) : (
              <span className="rc-first">첫 응시 — 이 세트의 기준 회차예요</span>
            )}
          </p>
        )}

        <dl className="result-metrics">
          <div className="result-metric-wide"><dt>점수</dt><dd data-testid="result-score">{scoreLabel}</dd></div>
          <div><dt>오답</dt><dd>{wrong}개</dd></div>
          <div><dt>소요 시간</dt><dd>{formatClock(elapsedSeconds)}</dd></div>
          <div className="result-metric-wide"><dt>합격 기준</dt><dd className="result-criterion">{criterionLabel}</dd></div>
        </dl>

        <div className="result-actions">
          {wrong > 0 && (
            <button type="button" className="primary" onClick={onOpenWrongNote}>
              오답 노트 보기
            </button>
          )}
          <button type="button" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  );
};
