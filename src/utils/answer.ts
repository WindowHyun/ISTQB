// 정답 판정 — 대소문자 무시, 순서 무관, 개수 일치.
// QuestionCard / QuestionWorkspace가 공유(중복 제거 + 유닛 테스트 대상, #76).
export function isAnswerCorrect(answer: string[], selected: string[]): boolean {
  // 손상 데이터 방어 — answer 필드가 누락/비배열/빈 배열인 문항은 판정 불가이므로 오답 처리.
  // (빈 정답키 + 빈 선택이 "정답"으로 집계되는 것도 함께 차단)
  if (!Array.isArray(answer) || answer.length === 0) return false;
  if (selected.length !== answer.length) return false;
  // 중복 키(예: ['a','a'])는 개수만 맞아도 오답 — UI는 못 만들지만 가져오기 데이터로 유입될 수 있다.
  const chosen = selected.map((s) => s.toLowerCase());
  if (new Set(chosen).size !== chosen.length) return false;
  const expected = answer.map((a) => a.toLowerCase());
  return chosen.every((s) => expected.includes(s));
}

// 단답형 비교용 정규화: 공백 제거 + 소문자.
export function normalizeText(value: string): string {
  return (value || '').replace(/\s+/g, '').toLowerCase();
}

// 서답형 정답키는 여러 허용답을 한 문자열에 콤마/슬래시(공백 포함)/"또는"/이중공백으로 묶어
// 두는 경우가 있고(원본 공개답안 표기 규약), 괄호로 영문·대안을 병기한다
// (예: "로그(Log)", "동등 분할(클래스), 동치 분할", "재테스팅 / retesting / 재테스트").
// 종전 로직은 이 문자열 전체와의 완전일치만 정답으로 봐, 자연스러운 단일 답을 입력하면
// 오답 처리됐다. 아래에서 개별 허용답으로 펼쳐 판정한다.
// - 구분자 규약은 정답 대조 스크립트(verify-pdf-data.py: `[,/]|또는|\s{2,}`)와 맞춘다.
//   단, 슬래시는 "조건/결정" 같은 용어 내부 구분과 섞이지 않도록 공백을 낀 경우만 분리한다.
// - 전개는 후보를 늘리기만 하므로 종전에 맞던 입력을 틀리게 만들지 않는다(원문 전체도 후보에 포함).
//
// export하는 이유: 이 함수가 정하는 것은 "무엇을 정답으로 인정하는가"다. isQuestionCorrect를
// 통해서만 보면 후보가 하나 더 늘어나도(= 오답을 정답으로 세도) 기존 검사는 전부 통과한다 —
// 맞던 입력은 여전히 맞기 때문이다. 실제로 뮤테이션 테스트에서 후보 목록에 엉뚱한 문자열을
// 끼워 넣는 변이가 살아남았다. 전개 결과를 그대로 고정할 수 있어야 과다 인정을 막는다.
export function shortAnswerCandidates(answer: string[]): string[] {
  const out: string[] = [];
  for (const raw of answer) {
    const whole = String(raw);
    out.push(whole); // 원문 전체(종전 완전일치 동작 보존)
    for (const part of whole.split(/[,，]|\s+\/\s+|\s+또는\s+|\s{2,}/)) {
      const t = part.trim();
      if (!t) continue;
      out.push(t);
      const stripped = t.replace(/\([^)]*\)/g, '').trim(); // 괄호 제거: "로그(Log)" → "로그"
      if (stripped) out.push(stripped);
      const inner = t.match(/\(([^)]+)\)/g); // 괄호 내용도 허용: "로그(Log)" → "Log"
      if (inner) for (const m of inner) out.push(m.slice(1, -1).trim());
    }
  }
  return out;
}

// 수치 답의 단위 표기 흔들림 — "50%"를 "50"으로, "4개"를 "4"로 쓰는 것은 같은 답이다.
// 원본 공개답안이 단위를 붙여 적어 둔 문항(CSTS 2018-20·2019-65·66·67, 2402-63,
// 2403-68, 2404-67, 2405-64, SW-EXAMPLE-66)에서, 값을 맞게 쓴 사람이 단위를 안 붙였다는
// 이유로 오답 처리됐다. 반대(정답키는 "4", 입력은 "4개")도 같은 이유로 인정한다.
//
// 인정 범위를 좁게 둔다 — 문항이 단위를 지정하므로 값만 맞으면 되지만, 서로 **다른** 단위를
// 붙인 입력("50%" vs "50개")까지 같게 보면 채점이 무의미해진다. 그래서 단위가 양쪽 다
// 있을 때는 같아야 하고, 한쪽이 비어 있을 때만 값으로 비교한다.
const NUMERIC_UNITS = '%|％|퍼센트|개|일|명|점|회|번|건|배|단계|시간|분|초';
const NUMERIC_WITH_UNIT = new RegExp(`^([0-9]+(?:\\.[0-9]+)?)(${NUMERIC_UNITS})?$`);
// 같은 단위의 다른 표기는 하나로 접는다 — 전각 퍼센트는 한글 IME에서 흔히 나온다.
const UNIT_ALIASES: Record<string, string> = { '％': '%', '퍼센트': '%' };

// 정규화된 문자열이 "숫자(+단위)" 꼴이면 값과 단위로 쪼갠다. 아니면 null.
// 값은 선행 0·소수 표기 차이("50" vs "050" vs "50.0")까지 같게 보도록 수치로 비교한다.
// 부호·지수 표기(-50, 5e1)는 일부러 받지 않는다 — 정답키가 그런 꼴로 들어올 일이 없고,
// 넓힐수록 "숫자면 같다"에 가까워져 채점이 헐거워진다.
function numericWithUnit(normalized: string): { value: number; unit: string } | null {
  const m = NUMERIC_WITH_UNIT.exec(normalized);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = m[2] ?? '';
  return { value, unit: UNIT_ALIASES[unit] ?? unit };
}

// 정규화 후 완전일치가 아니어도, 단위만 다른 같은 수치면 정답으로 인정한다.
export function matchesShortAnswer(candidate: string, got: string): boolean {
  const c = normalizeText(candidate);
  if (c === '') return false;
  if (c === got) return true;
  const a = numericWithUnit(c);
  const b = numericWithUnit(got);
  if (!a || !b) return false;
  if (a.unit && b.unit && a.unit !== b.unit) return false;
  return a.value === b.value;
}

// 다답형 서답형의 한 입력 칸(파트) — 라벨 + 그 칸에서 허용하는 정답 동의어들.
export interface AnswerPart {
  label: string;
  answer: string[];
}

// 문제 유형별 정답 판정.
// - short_answer: 입력 텍스트를 정규화해 허용답 후보(shortAnswerCandidates) 중 하나와 일치하면 정답
//   (수치 답은 단위 표기 차이를 흡수한다 — matchesShortAnswer).
//   parts(다답형: 서로 다른 답을 여러 칸에서 요구, 예 "동등분할 4개·경계값 7개")가 주어지면
//   각 칸 selected[i]가 해당 파트 허용답과 모두 일치해야 정답이다(반쪽 답은 오답).
//   accepted(데이터의 acceptedAnswers)는 **채점에서만** 더 인정하는 표기다 — 아래 설명 참고.
// - 그 외(multiple_choice / true_false): 키 배열 비교(isAnswerCorrect).
//
// answer와 accepted를 가른 이유: 화면의 "정답"은 answer를 그대로 이어 붙여 보여 준다
// (QuestionCard). 같은 개념을 묻는 문항인데 세트마다 공개답안이 적어 둔 표기가 달라
// (예: 2405-63 "재테스팅(Re-testing)" vs 2402-64 "재테스팅 / retesting / 재테스트 / retest")
// 한쪽에서 맞던 입력이 다른 쪽에서 오답이 됐는데, 이를 answer에 전부 밀어 넣으면 이번엔
// 화면의 정답 줄이 동의어 나열로 길어진다. answer는 공개답안 표기(표시) 그대로 두고,
// 세트 간 통일을 위해 더 인정하는 표기만 accepted로 받는다.
// 다답형(parts)에는 적용하지 않는다 — 칸마다 허용답이 따로 있어 칸 단위로 적어야 한다.
export function isQuestionCorrect(
  answer: string[],
  selected: string[],
  type?: string,
  parts?: AnswerPart[],
  accepted?: string[],
): boolean {
  if (type === 'short_answer') {
    if (parts && parts.length) {
      // 모든 파트가 채워지고 각각 정답이어야 한다.
      return parts.every((p, i) => {
        const got = normalizeText(selected[i] || '');
        if (!got) return false;
        return shortAnswerCandidates(p.answer).some((c) => matchesShortAnswer(c, got));
      });
    }
    const got = normalizeText(selected[0] || '');
    if (!got) return false;
    if (!Array.isArray(answer)) return false;
    const keys = Array.isArray(accepted) && accepted.length ? [...answer, ...accepted] : answer;
    return shortAnswerCandidates(keys).some((c) => matchesShortAnswer(c, got));
  }
  return isAnswerCorrect(answer, selected);
}

// "답함" 집계 기준(진행률·미응답 경고·팔레트 색의 단일 원천).
// 다답형(answerParts)은 모든 칸이 채워져야 답함으로 본다 — 한 칸만 채운 부분 입력을
// "답함"으로 세면 진행률이 부풀고, 채점 전 "미응답 N개" 경고에서도 빠져 반쪽 답인 채로
// 제출된다(채점은 모든 칸 일치를 요구하므로 오답). 일반 문항은 종전대로 하나라도 있으면 답함.
export function isAnswered(selected: string[], parts?: AnswerPart[]): boolean {
  if (parts && parts.length) {
    return parts.every((_, i) => (selected[i] ?? '').trim() !== '');
  }
  return selected.length > 0;
}

