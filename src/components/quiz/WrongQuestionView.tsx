import { Question } from '../../hooks/useQuestions';
import { RichText } from '../../utils/parser';
import { formatAnswerList } from '../../utils/answerDisplay';

/**
 * 틀린 문항을 읽기 전용으로 보여준다 — 지문 · 보기(내 답/정답 표시) · 해설.
 *
 * 두 곳이 같은 것을 그린다: 오답 노트 모달의 3단계와, 퀵 오답의 전체 화면 보기.
 * 사본을 두지 않는 이유는 이 저장소가 이미 여러 번 겪은 것이다 — 같은 사실을 두 곳이
 * 각자 그리면 한쪽만 고쳐진 채 갈라진다(내 답 표시가 한쪽에만 붙었던 일이 그랬다).
 *
 * 답안은 저장된 회차 기록에서 온다(문항 데이터가 아니라). 그래서 문항을 못 불러온
 * 상황에서도 '내 답 / 정답'은 부르는 쪽이 따로 보여줄 수 있다.
 */
export const WrongQuestionView = ({
  question,
  myAnswer,
  correctAnswer,
}: {
  question: Question;
  myAnswer: string[];
  correctAnswer: string[];
}) => {
  const fmt = (arr: string[]) => formatAnswerList(arr, '미응답');
  return (
    <div className="wrong-note-view">
      <div className="question-stem">
        <RichText content={question.stem} />
      </div>
      {question.options.length > 0 ? (
        <div className="options wrong-note-options">
          {question.options.map((opt) => {
            const mine = myAnswer.some((a) => a.toLowerCase() === opt.key.toLowerCase());
            const correct = correctAnswer.some((a) => a.toLowerCase() === opt.key.toLowerCase());
            let cls = 'option';
            if (correct) cls += ' correct';
            else if (mine) cls += ' selected wrong';
            return (
              <div key={opt.key} className={cls} data-mine={mine || undefined} data-correct={correct || undefined}>
                <span className="option-key">{opt.key.toUpperCase()}</span>
                <span className="option-text"><RichText content={opt.text} inline /></span>
                {(mine || correct) && (
                  <span className="wn-tag">{correct ? (mine ? '내 답 · 정답' : '정답') : '내 답'}</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // 단답형·진위형 등 보기 없는 문항: 내 답/정답 텍스트로 표시.
        <dl className="wrong-note-short">
          <div><dt>내 답</dt><dd>{fmt(myAnswer)}</dd></div>
          <div><dt>정답</dt><dd>{fmt(correctAnswer)}</dd></div>
        </dl>
      )}
      {/* 해설 — 오답 노트의 목적이 "왜 틀렸는지" 복습인데 종전에는 지문·보기·내 답·정답만
          보여 정작 이유를 볼 수 없었다(연습 모드 피드백에는 이미 노출). */}
      <div className="wrong-note-explain" data-testid="wrong-note-explain">
        <h5>해설</h5>
        <RichText content={question.explanation || '해설이 없습니다.'} />
      </div>
    </div>
  );
};
