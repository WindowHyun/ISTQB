import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuestions, Question } from '../../hooks/useQuestions';
import { loadSetQuestions, peekSetQuestions } from '../../utils/questionLoader';
import { questionKey } from '../../utils/chapterStats';
import { formatAnswerList } from '../../utils/answerDisplay';
import { WrongQuestionView } from './WrongQuestionView';

/**
 * 오답 하나를 **본문 화면**에 펼친다 — 팝업이 아니다.
 *
 * 퀵 오답은 출처 세트가 문항마다 다르다(전 세트를 섞는 모드라). 그래서 "세트를 고르고
 * 번호를 찾는" 노트의 기존 3단계로는 닿을 수 없었고, 목록은 보기 전용이었다. 노트에서
 * '오답 보기'를 누르면 그 문항의 출처 세트를 열어 여기서 지문·보기·해설을 보여준다.
 *
 * 모달이 아니라 화면인 이유: 해설은 길고(코드 블록·표·그림이 섞인다) 모달 안에서는
 * 스크롤이 이중으로 겹친다. 그리고 노트를 닫아야만 문제를 볼 수 있던 종전 동선이
 * "닫고 다시 열기"를 반복하게 했다.
 */
export const WrongViewScreen = () => {
  const { wrongView, setWrongView, setWrongNoteOpen } = useQuizStore(useShallow((s) => ({
    wrongView: s.wrongView, setWrongView: s.setWrongView, setWrongNoteOpen: s.setWrongNoteOpen,
  })));
  const { appData } = useQuestions();
  const path = wrongView ? appData?.sets.find((s) => s.id === wrongView.setId)?.path ?? null : null;
  // 이미 열어 둔 세트는 동기로 꺼내 로딩 프레임이 깜빡이지 않게 한다(오답노트와 같은 규칙).
  const [questions, setQuestions] = useState<Question[] | null>(
    () => (path && peekSetQuestions(path)) || null,
  );

  useEffect(() => {
    if (!path) { setQuestions(null); return; }
    const cached = peekSetQuestions(path);
    if (cached) { setQuestions(cached); return; }
    let cancelled = false;
    loadSetQuestions(path)
      .then((qs) => { if (!cancelled) setQuestions(qs); })
      .catch(() => { if (!cancelled) setQuestions([]); });
    return () => { cancelled = true; };
  }, [path]);

  if (!wrongView) return null;

  const setTitle = appData?.sets.find((s) => s.id === wrongView.setId)?.title ?? wrongView.setId;
  // id로 먼저 찾는다 — 문항 번호는 세트마다 겹치므로, 번호만으로 찾으면 재수록 문항에서
  // 다른 세트의 같은 번호를 집을 수 있다. 옛 기록에는 id가 없어 번호로 내려간다.
  const question = questions?.find((q) => (wrongView.qid ? questionKey(q) === wrongView.qid : false))
    ?? questions?.find((q) => q.number === wrongView.number)
    ?? null;

  const close = () => setWrongView(null);
  const backToNote = () => { setWrongView(null); setWrongNoteOpen(true); };

  return (
    <section className="workspace wrong-view-screen" aria-label="오답 보기" data-testid="wrong-view-screen">
      <header className="topbar">
        <div className="topbar-title">
          <p id="setMeta">{setTitle}</p>
          <div className="question-title-row">
            <h2 id="questionTitle">문제 {wrongView.number}</h2>
            <span className="question-chapter-badge">오답 보기</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button type="button" data-testid="wrong-view-back" onClick={backToNote}>← 오답 노트</button>
          <button type="button" data-testid="wrong-view-close" onClick={close}>풀이로 돌아가기</button>
        </div>
      </header>

      <article className="question-card">
        <p className="wrong-view-answers">
          내 답 <b>{formatAnswerList(wrongView.myAnswer, '미응답')}</b>
          {' · '}
          정답 <b>{formatAnswerList(wrongView.correctAnswer, '미응답')}</b>
        </p>
        {!question ? (
          // 문항을 못 찾는 경우가 실제로 있다: 세트가 개편돼 번호가 바뀌었거나, 아직
          // 로딩 중이거나, 네트워크가 끊겼다. 그래도 위의 '내 답 / 정답'은 기록에서 오므로
          // 화면이 비지 않는다 — 무엇을 틀렸는지는 여기서도 확인할 수 있다.
          <p className="wn-loading" data-testid="wrong-view-missing">
            {questions === null ? '문제 불러오는 중…' : '문항을 찾을 수 없습니다. (세트가 갱신됐을 수 있어요)'}
          </p>
        ) : (
          <WrongQuestionView
            question={question}
            myAnswer={wrongView.myAnswer}
            correctAnswer={wrongView.correctAnswer}
          />
        )}
      </article>
    </section>
  );
};
