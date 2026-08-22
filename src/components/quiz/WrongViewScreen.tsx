import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuestions, Question } from '../../hooks/useQuestions';
import { loadSetQuestions, peekSetQuestions } from '../../utils/questionLoader';
import { questionKey } from '../../utils/chapterStats';
import { formatAnswerList } from '../../utils/answerDisplay';
import { WrongQuestionView } from './WrongQuestionView';
import { wrongViewIndex, wrongViewStep } from '../../utils/wrongNote';
import { useBackDismiss } from '../../hooks/useBackDismiss';
import { BACK_PRIORITY } from '../../utils/backGuard';

/**
 * 오답 하나를 **본문 화면**에 펼친다 — 팝업이 아니다.
 *
 * 오답 노트의 **두 목록이 모두 여기로 온다**(퀵 임시 목록 · 세트별 오답).
 * 처음에는 퀵 전용이었다: 퀵 오답은 출처 세트가 문항마다 달라(전 세트를 섞는 모드라)
 * "세트를 고르고 번호를 찾는" 노트의 3단계로는 닿을 수 없었기 때문이다. 세트별 오답은
 * 그 3단계 안에 상세 화면을 따로 갖고 있었는데, 같은 것을 보는 화면이 둘일 이유가 없어
 * 이쪽으로 합쳤다.
 *
 * 모달이 아니라 화면인 이유: 해설은 길고(코드 블록·표·그림이 섞인다) 모달 안에서는
 * 스크롤이 이중으로 겹친다. 그리고 노트를 닫아야만 문제를 볼 수 있던 종전 동선이
 * "닫고 다시 열기"를 반복하게 했다.
 *
 * 합치면서 모달 상세에 있던 **이전/다음 이동(`‹ 3 / 12 ›`)을 함께 가져왔다.** 옮기지
 * 않았다면 세트별 오답에서 문항을 하나 볼 때마다 노트로 돌아가야 해, 기능이 조용히
 * 나빠졌을 자리다(형제 목록은 `wrongView.siblings`가 나른다).
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

  // 이 화면에 들어오는 길은 오답 노트 하나뿐이고(노트는 그때 닫힌다), 나가는 버튼도
  // 헤더의 '← 오답 노트'다. 그래서 뒤로가기는 '풀이로 돌아가기'가 아니라 **노트로**
  // 되돌린다 — 눌러서 들어온 자리로 정확히 되돌아가는 것이 뒤로가기의 뜻이다.
  //
  // 종전에는 여기가 가드에 등록돼 있지 않았다. 화면을 통째로 차지하는 데다 워크스페이스가
  // 언마운트된 상태라, 안드로이드에서 뒤로가기를 누르면 **앱이 그대로 종료됐다**
  // (해설을 읽다 뒤로가기 한 번에 앱이 사라진다). 웹에서는 브라우저가 페이지를 떠났다.
  const close = () => setWrongView(null);
  const backToNote = () => { setWrongView(null); setWrongNoteOpen(true); };
  useBackDismiss(Boolean(wrongView), backToNote, BACK_PRIORITY.screen);

  if (!wrongView) return null;

  // 같은 세트의 오답을 죽 훑는 이동. 형제 목록이 없으면(퀵) 이동 자체를 그리지 않는다 —
  // 버튼만 두고 늘 비활성으로 두면 "왜 안 눌리지"가 되고, 그 답이 화면에 없다.
  // 자리 찾기·경계 판정은 utils/wrongNote가 단일 원천이다(유닛이 닿는 자리).
  const siblings = wrongView.siblings ?? [];
  const at = wrongViewIndex(siblings, wrongView);
  const goto = (delta: number) => {
    const next = wrongViewStep(siblings, wrongView, delta);
    if (!next) return;
    // setId·siblings는 그대로 유지한다 — 같은 세트 안에서만 움직인다.
    setWrongView({ ...wrongView, ...next });
  };

  const setTitle = appData?.sets.find((s) => s.id === wrongView.setId)?.title ?? wrongView.setId;
  // id로 먼저 찾는다 — 문항 번호는 세트마다 겹치므로, 번호만으로 찾으면 재수록 문항에서
  // 다른 세트의 같은 번호를 집을 수 있다. 옛 기록에는 id가 없어 번호로 내려간다.
  const question = questions?.find((q) => (wrongView.qid ? questionKey(q) === wrongView.qid : false))
    ?? questions?.find((q) => q.number === wrongView.number)
    ?? null;

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
          {at >= 0 && siblings.length > 1 && (
            <div className="wn-nav" role="group" aria-label="오답 문항 이동">
              <button
                type="button"
                className="wn-nav-btn"
                data-testid="wrong-note-prev"
                aria-label="이전 오답 문항"
                disabled={at <= 0}
                onClick={() => goto(-1)}
              >
                ‹
              </button>
              <span className="wn-nav-pos" data-testid="wrong-note-pos">
                {at + 1} / {siblings.length}
              </span>
              <button
                type="button"
                className="wn-nav-btn"
                data-testid="wrong-note-next"
                aria-label="다음 오답 문항"
                disabled={at >= siblings.length - 1}
                onClick={() => goto(1)}
              >
                ›
              </button>
            </div>
          )}
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
            // 풀이 화면을 대신하는 화면이므로 스킵 링크의 목적지도 이어받는다.
            stemId="questionStem"
          />
        )}
      </article>
    </section>
  );
};
