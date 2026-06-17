import { Modal } from '../common/Modal';
import { formatClock } from '../../utils/time';
import { evaluatePass, Certification } from '../../utils/scoring';

interface ResultSummaryProps {
  setTitle: string;
  certification: Certification;
  correct: number;
  total: number;
  elapsedSeconds: number;
  onClose: () => void;
  onOpenWrongNote: () => void;
}

export const ResultSummary = ({
  setTitle,
  certification,
  correct,
  total,
  elapsedSeconds,
  onClose,
  onOpenWrongNote,
}: ResultSummaryProps) => {
  const { passed, ratePercent, criterionLabel, scoreLabel } = evaluatePass(certification, correct, total);
  const wrong = total - correct;

  return (
    <Modal title="채점 결과" onClose={onClose}>
      <div className="modal-body result-summary" data-testid="result-summary">
        <p className="result-set">{setTitle}</p>

        <div className={`result-score ${passed ? 'pass' : 'fail'}`}>
          <strong data-testid="result-rate">{ratePercent}%</strong>
          <span className="result-badge">{passed ? '합격 기준 충족' : '합격 기준 미달'}</span>
        </div>

        <dl className="result-metrics">
          <div><dt>점수</dt><dd data-testid="result-score">{scoreLabel}</dd></div>
          <div><dt>오답</dt><dd>{wrong}개</dd></div>
          <div><dt>소요 시간</dt><dd>{formatClock(elapsedSeconds)}</dd></div>
          <div><dt>합격 기준</dt><dd className="result-criterion">{criterionLabel}</dd></div>
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
