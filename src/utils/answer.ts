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
function shortAnswerCandidates(answer: string[]): string[] {
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

// 다답형 서답형의 한 입력 칸(파트) — 라벨 + 그 칸에서 허용하는 정답 동의어들.
export interface AnswerPart {
  label: string;
  answer: string[];
}

// 문제 유형별 정답 판정.
// - short_answer: 입력 텍스트를 정규화해 허용답 후보(shortAnswerCandidates) 중 하나와 일치하면 정답.
//   parts(다답형: 서로 다른 답을 여러 칸에서 요구, 예 "동등분할 4개·경계값 7개")가 주어지면
//   각 칸 selected[i]가 해당 파트 허용답과 모두 일치해야 정답이다(반쪽 답은 오답).
// - 그 외(multiple_choice / true_false): 키 배열 비교(isAnswerCorrect).
export function isQuestionCorrect(
  answer: string[],
  selected: string[],
  type?: string,
  parts?: AnswerPart[],
): boolean {
  if (type === 'short_answer') {
    if (parts && parts.length) {
      // 모든 파트가 채워지고 각각 정답이어야 한다.
      return parts.every((p, i) => {
        const got = normalizeText(selected[i] || '');
        if (!got) return false;
        return shortAnswerCandidates(p.answer).some((c) => c !== '' && normalizeText(c) === got);
      });
    }
    const got = normalizeText(selected[0] || '');
    if (!got) return false;
    if (!Array.isArray(answer)) return false;
    return shortAnswerCandidates(answer).some((c) => c !== '' && normalizeText(c) === got);
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

