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
// 표시용 정답률(%) — 내림. 반올림하면 64.6%가 "65%·불합격"으로 표기와 판정이 모순된다.
// 결과 모달·학습 통계가 공유해 화면 간 퍼센트가 어긋나지 않게 한다.
// (epsilon은 부동소수 오차로 정확히 경계인 값이 깎이는 것 방지)
export function displayRatePercent(correct: number, total: number): number {
  return total ? Math.floor((correct / total) * 100 + 1e-9) : 0;
}

export function evaluatePass(cert: Certification, correct: number, total: number): PassResult {
  const rate = total ? (correct / total) * 100 : 0;
  const ratePercent = displayRatePercent(correct, total);

  if (cert === 'csts') {
    const converted = Math.floor(rate * 0.7 * 10 + 1e-9) / 10; // 환산 점수(소수 첫째자리, 내림 — 표시·판정 일치)
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
