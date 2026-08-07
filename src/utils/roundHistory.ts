import type { Question } from '../hooks/useQuestions';
import type { ExamHistory, QuizMode } from '../store/useQuizStore';
import { buildChapterStats, questionKey } from './chapterStats';

/**
 * 채점 회차 레코드 조립 — 순수 계층.
 *
 * 종전에는 이 계산이 useQuizSession의 handleGrade 안에 통째로 들어 있었다. 훅 안에 있으니
 * 유닛이 닿지 못했고(useQuizSession 커버리지 0%), 검증은 E2E가 화면 너머로 스쳐 지나가는
 * 것뿐이었다. 그런데 여기서 만드는 값은 그대로 영속화돼 통계·오답노트·합격 판정의 입력이
 * 된다 — 필드 하나가 빠지면 새로고침 뒤에야, 그것도 조용히 드러난다.
 *
 * 실제로 이 조립부에서 나온 결함들:
 *  - wrongItems[].setId 누락 → 퀵 오답이 '퀵 랜덤' 한 덩어리로 뭉치고 번호 충돌로 유실
 *  - chapterQuestions 누락 → 재풀이할 때마다 챕터 분모가 부풀어 6문항이 "0/18"
 *  - cstsWeighted 누락 → 새로고침 뒤 통계 %가 합격 판정과 어긋남
 *
 * 훅에서 꺼내 순수 함수로 만들면 이 계약을 값으로 못 박을 수 있다. 시각·난수처럼 외부에
 * 의존하는 것은 인자로 받아 결정적으로 만든다(테스트가 시계에 매이지 않게).
 */
export interface RoundHistoryInput {
  setId: string;
  mode: QuizMode;
  /** 이번 회차에 출제된 문항 — 챕터 집계와 답안 스냅샷의 입력. */
  questions: Question[];
  /** 현재 답안 전체(다른 세트·모드 키가 섞여 있어도 된다 — 아래에서 골라 담는다). */
  answers: Record<string, string[]>;
  answerKeyOf: (q: Question) => string;
  /** 오답으로 판정된 문항. 화면 표시와 같은 판정을 재사용해 규칙이 갈리지 않게 한다. */
  wrongQuestions: Question[];
  certification?: 'istqb' | 'csts';
  /** 세트 제목(퀵은 '퀵 랜덤'). 세트가 index.json에서 빠져도 통계에 내부 id가 노출되지 않게 한다. */
  setTitle?: string;
  elapsedSeconds: number;
  /** 챕터 미니 시험 표식 — 랜덤 + 챕터 필터일 때만 실린다. */
  chapter?: string;
  /** CSTS 가중 점수 스냅샷. ISTQB에서는 넣지 않는다(단순 정답률이라 불필요). */
  cstsWeighted?: { score: number; maxScore: number };
  /** 회차 시각. 주입 가능하게 두어 테스트가 결정적이 된다. */
  now: number;
  /** 회차 id. 같은 ms 재채점·백업 병합에서도 겹치지 않아야 한다. */
  id: string;
}

/** 회차 id — 시각(36진수) + 난수. 같은 ms에 두 번 채점해도 기존 회차를 덮지 않는다. */
export function makeRoundId(now = Date.now(), rand = Math.random): string {
  return `${now.toString(36)}-${rand().toString(36).slice(2, 8)}`;
}

/** 문항의 오답노트 식별자 — 퀵은 회차 setId가 센티넬이라 출처를 항목에 실어야 한다. */
export function buildWrongItems(
  wrongQuestions: Question[],
  answers: Record<string, string[]>,
  answerKeyOf: (q: Question) => string,
): NonNullable<ExamHistory['wrongItems']> {
  return wrongQuestions.map((q) => ({
    number: q.number,
    myAnswer: answers[answerKeyOf(q)] || [],
    correctAnswer: q.answer,
    // 오답 모드 출제 대상(reviewIds)과 같은 식별자를 함께 남긴다 — 회차를 지웠을 때
    // 남은 회차로 그 대상을 재계산하려면 번호만으로는 부족하다(번호는 세트마다 겹친다).
    qid: questionKey(q),
    // 출처 세트는 퀵에서만 채워진다(일반 회차는 회차의 setId가 곧 출처).
    // 빠지면 서로 다른 세트의 오답이 한 덩어리로 묶이고 번호가 겹치면 서로를 덮어쓴다.
    ...(q.sourceSetId ? { setId: q.sourceSetId } : {}),
  }));
}

/**
 * 채점 시점 답안 스냅샷 — 이번 회차에 출제된 문항의 답만 담는다.
 * 전체 answers를 그대로 넣으면 다른 세트·모드의 답까지 회차에 실려,
 * 나중에 "이 답안이 그 회차와 같은가"(findGradedRoundMatch) 판정이 어긋난다.
 */
export function buildGradedAnswers(
  questions: Question[],
  answers: Record<string, string[]>,
  answerKeyOf: (q: Question) => string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const q of questions) {
    const k = answerKeyOf(q);
    if (answers[k]) out[k] = answers[k];
  }
  return out;
}

/** 회차 레코드를 조립한다. 부수효과 없음 — 저장은 호출부가 한다. */
export function buildRoundHistory(input: RoundHistoryInput): ExamHistory {
  const {
    setId, mode, questions, answers, answerKeyOf, wrongQuestions,
    certification, setTitle, elapsedSeconds, chapter, cstsWeighted, now, id,
  } = input;

  const chapterOutcome = buildChapterStats(questions, answers, answerKeyOf);

  return {
    id,
    setId,
    mode,
    certification,
    answers: buildGradedAnswers(questions, answers, answerKeyOf),
    // 출제 수에서 오답 수를 뺀다 — 미응답은 오답에 포함되므로 따로 세지 않는다.
    correct: questions.length - wrongQuestions.length,
    total: questions.length,
    elapsedSeconds: Math.round(elapsedSeconds),
    createdAt: now,
    setTitle,
    wrongItems: buildWrongItems(wrongQuestions, answers, answerKeyOf),
    chapterStats: chapterOutcome.stats,
    chapterQuestions: chapterOutcome.questions,
    cstsWeighted,
    chapter,
  };
}
