import { Modal } from '../common/Modal';
import { formatClock } from '../../utils/time';
import { evaluatePass, Certification, CstsWeightedScore } from '../../utils/scoring';
import { formatDeltaPp } from '../../utils/attemptStats';

interface ResultSummaryProps {
  setTitle: string;
  certification: Certification;
  correct: number;
  total: number;
  // CSTS 검정방법별 가중 점수 — 합격 판정의 실제 근거(정답률만으로는 판정 불가). ISTQB는 미사용.
  cstsWeighted?: CstsWeightedScore;
  elapsedSeconds: number;
  // Phase 2 학습 누적 — 같은 세트·모드 기준 이번이 몇 회차인지, 직전 회차 정답률(%).
  attemptRound?: number;
  previousRate?: number | null;
  // 회차 기준 모드 라벨(예: '시험') — 통계의 세트 타임라인(모드 혼합 회차)과 기준이
  // 다르므로, 어떤 기준의 회차인지 명시해 두 화면의 번호 차이를 오해하지 않게 한다.
  modeLabel?: string;
  onClose: () => void;
  onOpenWrongNote: () => void;
  /** 원클릭 재응시(A3) — 답안 초기화 후 시험은 게이트부터, 랜덤은 같은 추첨을 새로 푼다. */
  onRetry?: () => void;
  /**
   * 합격 판정을 숨긴다(퀵 랜덤). 10~20문항 표본에 '합격 기준 미달'을 붙이면 실제 시험에서
   * 떨어진다는 뜻으로 읽힌다 — 세트 전체를 푼 것이 아니므로 그 판정의 근거가 없다.
   */
  hidePassVerdict?: boolean;
  /**
   * '오답 노트 보기' 버튼을 숨긴다(퀵 랜덤). 퀵의 오답은 회차가 아니라 각 문항의 출처
   * 세트별로 흩어져 노트에 들어간다 — 결과 모달에서 바로 열면 방금 푼 회차의 오답만
   * 모여 있을 것이라 기대하게 되지만 실제로는 세트별 전 회차 합산이 보인다.
   */
  hideWrongNote?: boolean;
}

export const ResultSummary = ({
  setTitle,
  certification,
  correct,
  total,
  cstsWeighted,
  elapsedSeconds,
  attemptRound,
  previousRate,
  modeLabel,
  onClose,
  onOpenWrongNote,
  onRetry,
  hidePassVerdict,
  hideWrongNote,
}: ResultSummaryProps) => {
  const { passed, ratePercent, criterionLabel, scoreLabel } = evaluatePass(certification, correct, total, cstsWeighted);
  const wrong = total - correct;

  // 직전 회차 대비 변화(%p) — 첫 응시(previousRate null)면 "첫 응시"로 안내한다.
  // 라벨/방향 규칙은 formatDeltaPp 공용(통계 타임라인과 표기 일치).
  const hasPrev = previousRate != null;
  const { label: deltaLabel, dir: trend } = formatDeltaPp(hasPrev ? ratePercent - (previousRate as number) : 0);

  return (
    <Modal title="채점 결과" onClose={onClose}>
      <div className="modal-body result-summary" data-testid="result-summary">
        <p className="result-set">{setTitle}</p>

        <div className={`result-score ${hidePassVerdict ? 'neutral' : passed ? 'pass' : 'fail'}`}>
          {hidePassVerdict ? (
            <>
              {/* 퀵은 맞힌 개수를 그대로 보여준다 — %만 크게 띄우면 10문항 중 7개가 '70%'로
                  환산돼 세트 전체 회차와 같은 무게로 읽힌다. */}
              <strong data-testid="result-rate">{correct} / {total}문항</strong>
              <span className="result-badge">퀵 랜덤 · 합격 판정 없음</span>
            </>
          ) : (
            <>
              <strong data-testid="result-rate">{ratePercent}%</strong>
              <span className="result-badge">{passed ? '합격 기준 충족' : '합격 기준 미달'}</span>
            </>
          )}
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
          {!hidePassVerdict && (
            <div className="result-metric-wide"><dt>합격 기준</dt><dd className="result-criterion">{criterionLabel}</dd></div>
          )}
        </dl>

        <div className="result-actions">
          {wrong > 0 && !hideWrongNote && (
            <button type="button" className="primary" onClick={onOpenWrongNote}>
              오답 노트 보기
            </button>
          )}
          {onRetry && (
            <button type="button" data-testid="result-retry" onClick={onRetry}>
              다시 풀기
            </button>
          )}
          <button type="button" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  );
};
