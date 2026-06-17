import { Modal } from '../common/Modal';
import { formatClock } from '../../utils/time';

// 합격선은 정보용 기준선(ISTQB FL 권장 65%)이며 통과/미통과는 참고 표시일 뿐이다.
const PASS_RATE = 65;

interface ResultSummaryProps {
  setTitle: string;
  correct: number;
  total: number;
  elapsedSeconds: number;
  onClose: () => void;
  onOpenWrongNote: () => void;
}

export const ResultSummary = ({
  setTitle,
  correct,
  total,
  elapsedSeconds,
  onClose,
  onOpenWrongNote,
}: ResultSummaryProps) => {
  const rate = total ? Math.round((correct / total) * 100) : 0;
  const passed = rate >= PASS_RATE;
  const wrong = total - correct;

  return (
    <Modal title="채점 결과" onClose={onClose}>
      <div className="modal-body result-summary" data-testid="result-summary">
        <p className="result-set">{setTitle}</p>

        <div className={`result-score ${passed ? 'pass' : 'fail'}`}>
          <strong data-testid="result-rate">{rate}%</strong>
          <span className="result-badge">{passed ? '합격 기준 충족' : '합격 기준 미달'}</span>
        </div>

        <dl className="result-metrics">
          <div><dt>점수</dt><dd>{correct} / {total}</dd></div>
          <div><dt>오답</dt><dd>{wrong}개</dd></div>
          <div><dt>소요 시간</dt><dd>{formatClock(elapsedSeconds)}</dd></div>
          <div><dt>합격 기준(참고)</dt><dd>{PASS_RATE}%</dd></div>
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
