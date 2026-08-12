import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { answerKeyFor } from '../../utils/answerKey';
import { computeQuickStats } from '../../utils/quickStats';
import { Question } from '../../hooks/useQuestions';

interface QuickScoreboardProps {
  /** 이번 퀵 세션의 출제 순서. */
  questions: Question[];
  /** 현재 문항의 인덱스 — 여기까지(포함)만 집계한다(아직 안 나온 문항은 밖). */
  cursor: number;
}

/**
 * 퀵 현황 — 진행·정답·오답·연속(최고)을 문제 헤더 안에 한 줄로 보여준다.
 *
 * 퀵에는 진행률(N/총계)도 타이머도 없다. 끝을 정해 놓지 않은 모드라 분모가 없고, 회차가
 * 기록으로 남지도 않는다. 그래서 사이드바의 '진행 / 시간' 줄은 퀵에서 통째로 빠지는데,
 * 그 자리를 아무것도 대신하지 않으면 **지금 몇 개를 맞히고 있는지 알 방법이 화면에 없다.**
 * 그 값을 여기서 맡는다.
 *
 * 헤더 카드 안에 넣는 이유: 종전 자리는 헤더와 문제 사이를 가로지르는 폭 가득한 카드
 * 네 장이었다. 문제를 읽는 동선(제목 → 지문) 한가운데에 숫자 네 개가 끼어 지문이 화면
 * 아래로 밀렸고, 매 문항 갱신되는 값이라 시선도 그때마다 끌려갔다. 헤더 오른쪽은 원래
 * ‹ › 두 버튼만 있어 비어 있던 자리라, 같은 정보를 세로 공간을 전혀 쓰지 않고 담는다.
 *
 * 값은 스토어 카운터가 아니라 답안에서 파생한다(computeQuickStats) — 근거는 그쪽 주석 참고.
 */
export const QuickScoreboard = ({ questions, cursor }: QuickScoreboardProps) => {
  // answers는 여기서만 구독한다. 워크스페이스 슬라이스에 넣으면 보기를 누를 때마다
  // 헤더·팔레트·하단 액션바까지 통째로 다시 그려진다(O1 의도 유지) — 이 한 줄만 갱신되면 된다.
  const { answers, setId } = useQuizStore(useShallow((s) => ({
    answers: s.answers, setId: s.setId,
  })));

  const stats = computeQuickStats(
    questions,
    answers,
    (q) => answerKeyFor(setId, 'quick', q),
    cursor,
  );

  return (
    // role=status + aria-live: 답을 확정할 때마다 바뀌는 값이라 시각 사용자에게만 보이면
    // 안 된다. 다만 낭독은 '진행/정답/오답' 묶음 하나로 끝나야 하므로 컨테이너에 한 번만 건다.
    <div className="quick-scoreboard" role="status" aria-live="polite" aria-label="퀵 진행 현황">
      <div className="qs-item">
        <b>{stats.solved}</b>
        <small>진행</small>
      </div>
      <div className="qs-item qs-ok">
        <b>{stats.correct}</b>
        <small>정답</small>
      </div>
      <div className="qs-item qs-no">
        <b>{stats.wrong}</b>
        <small>오답</small>
      </div>
      {/* 연속과 최고를 한 칸에 겹친다 — 칸을 다섯으로 늘리면 헤더 폭을 넘어 제목을 밀어낸다.
          큰 숫자는 '지금 연속'이고(끊기면 0), 최고는 그 아래 라벨에 작게 붙는다. */}
      <div className="qs-item qs-streak">
        <b>{stats.streak}</b>
        <small>연속 · 최고 {stats.best}</small>
      </div>
    </div>
  );
};
