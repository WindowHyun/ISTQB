import type { Question } from '../hooks/useQuestions';
import { isQuestionCorrect } from './answer';

export type Certification = 'istqb' | 'csts' | null;

export interface PassResult {
  passed: boolean;
  ratePercent: number; // 정답률(%)
  criterionLabel: string; // 합격 기준 설명
  scoreLabel: string; // 자격증별 점수 표기
}

// CSTS 검정방법별 배점(공식 검정 안내 — 4지선다 50문항×1.5점·진위형 10문항×1.0점·
// 서답형 10문항×1.5점 = 100점 만점, 75점 이상 합격). 세트별로 문항 구성이 조금씩
// 달라도(예: 진위 8·서답 12) 배점은 문항 유형에 고정으로 붙는다.
const CSTS_TYPE_POINTS: Record<string, number> = {
  multiple_choice: 1.5,
  true_false: 1.0,
  short_answer: 1.5,
};
// 배점표에 없는 유형(방어적 폴백)은 주 유형과 같은 1.5점으로 취급한다.
const CSTS_DEFAULT_POINTS = 1.5;

export interface CstsWeightedScore {
  score: number; // 획득 가중 점수
  maxScore: number; // 이 세트의 만점(문항 구성에 따라 정확히 100이 아닐 수 있음)
}

// 채점 시점에 문항 유형별 배점을 적용해 가중 점수를 계산한다(이력에 저장해 재사용 — chapterStats와 동일 패턴).
export function computeCstsWeightedScore(
  questions: Question[],
  answers: Record<string, string[]>,
  answerKeyOf: (q: Question) => string,
): CstsWeightedScore {
  let score = 0;
  let maxScore = 0;
  for (const q of questions) {
    const points = CSTS_TYPE_POINTS[q.type ?? ''] ?? CSTS_DEFAULT_POINTS;
    maxScore += points;
    if (isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type, q.answerParts)) score += points;
  }
  return { score, maxScore };
}

// 자격증별 합격 컷스코어.
// - CSTS: 문항 유형별 배점(가중 점수) 합산이 만점의 75% 이상이어야 합격. 단순 문항
//   정답률로는 판정할 수 없다 — 배점이 낮은 진위형(1.0점)에 정답이 몰리면 정답률은
//   75% 이상이어도 가중 점수는 미달일 수 있고, 그 반대도 가능하다.
// - ISTQB FL: 40문항 기준 26문항(65%) 이상 정답. (세트 문항수가 달라도 65%로 일반화. 전 문항이
//   객관식 단일 유형이라 배점 가중이 필요 없다)
// 표시용 정답률(%) — 내림. 반올림하면 64.6%가 "65%·불합격"으로 표기와 판정이 모순된다.
// 결과 모달·학습 통계가 공유해 화면 간 퍼센트가 어긋나지 않게 한다.
// (epsilon은 부동소수 오차로 정확히 경계인 값이 깎이는 것 방지)
export function displayRatePercent(correct: number, total: number): number {
  return total ? Math.floor((correct / total) * 100 + 1e-9) : 0;
}

export function evaluatePass(
  cert: Certification,
  correct: number,
  total: number,
  cstsWeighted?: CstsWeightedScore,
): PassResult {
  const ratePercent = displayRatePercent(correct, total);

  if (cert === 'csts') {
    if (cstsWeighted && cstsWeighted.maxScore > 0) {
      const { score, maxScore } = cstsWeighted;
      const weightedRatePercent = Math.floor((score / maxScore) * 100 + 1e-9);
      const displayScore = Math.floor(score * 10 + 1e-9) / 10;
      const displayMax = Math.floor(maxScore * 10 + 1e-9) / 10;
      return {
        passed: score >= maxScore * 0.75 - 1e-9,
        ratePercent: weightedRatePercent,
        criterionLabel: '검정방법별 배점 합산 75% 이상(4지선다·서답형 1.5점, 진위형 1.0점 — 100점 만점 기준 75점)',
        scoreLabel: `${displayScore} / ${displayMax}점 (${weightedRatePercent}%)`,
      };
    }
    // 방어적 폴백 — 문항 유형 정보를 못 받은 예외 상황(정상 경로에서는 도달하지 않음).
    // 단순 정답률로는 실제 합격 여부를 알 수 없으므로 판정을 내리지 않고 미달로 보수 처리한다.
    return {
      passed: false,
      ratePercent,
      criterionLabel: '검정방법별 배점 합산 75% 이상(문항 유형 정보를 불러오지 못해 정답률만 표시)',
      scoreLabel: `${correct} / ${total} (${ratePercent}%)`,
    };
  }

  const rate = total ? (correct / total) * 100 : 0;
  return {
    passed: rate >= 65,
    ratePercent,
    // 세트 문항수(total)에 맞춰 필요 정답 수를 산출한다(EXTRA 26문항 등에서 "26/40" 오표기 방지, #P5-3).
    criterionLabel: `${Math.ceil(total * 0.65)} / ${total}문항(65%) 이상 정답`,
    scoreLabel: `${correct} / ${total} (${ratePercent}%)`,
  };
}
