export type Certification = 'istqb' | 'csts' | null;

export interface PassResult {
  passed: boolean;
  ratePercent: number; // 정답률(%)
  criterionLabel: string; // 합격 기준 설명
  scoreLabel: string; // 자격증별 점수 표기
}

// 자격증별 합격 컷스코어.
// - CSTS: 100점 만점 기준 75점 이상(= 정답률 75%) → 환산 점수 52.5점 이상 합격.
// - ISTQB FL: 40문항 기준 26문항(65%) 이상 정답. (세트 문항수가 달라도 65%로 일반화)
export function evaluatePass(cert: Certification, correct: number, total: number): PassResult {
  const rate = total ? (correct / total) * 100 : 0;
  const ratePercent = Math.round(rate);

  if (cert === 'csts') {
    const converted = Math.round(rate * 0.7 * 10) / 10; // 환산 점수(소수 첫째자리)
    return {
      passed: rate >= 75,
      ratePercent,
      criterionLabel: '75점 이상 · 환산 52.5점 이상',
      scoreLabel: `${ratePercent}점 · 환산 ${converted}점`,
    };
  }

  return {
    passed: rate >= 65,
    ratePercent,
    // 세트 문항수(total)에 맞춰 필요 정답 수를 산출한다(EXTRA 26문항 등에서 "26/40" 오표기 방지, #P5-3).
    criterionLabel: `${Math.ceil(total * 0.65)} / ${total}문항(65%) 이상 정답`,
    scoreLabel: `${correct} / ${total} (${ratePercent}%)`,
  };
}
