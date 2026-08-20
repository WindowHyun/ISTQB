import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { normalizeQuestionData } = require_('./normalize-utils.js') as {
  normalizeQuestionData: (q: unknown) => { normalized: Q; requiresManualReview: boolean };
};

interface Q {
  type?: string;
  stem?: { type: string; text: string }[];
  options?: { key: string; text: string }[];
  answer?: string[];
}

/**
 * 보기 키 재부여 위험 — 이 스크립트에서 가장 조용한 결함 자리다.
 *
 * 지문/한 덩어리 보기에서 보기를 뽑아낼 때 키를 **나온 순서대로** a·b·c·d로 새로
 * 매기는데, 정답(answer)은 원본 키를 그대로 들고 있다. 원본 키가 달랐다면(A·B·C)
 * 정답 키가 목록에 없어 잡히지만, **원본도 이미 a·b·c·d였다면 아무것도 잡지 못한다** —
 * 순서만 바뀌어도 정답이 다른 보기를 가리키는데 검증은 통과한다.
 *
 * 그래서 "키를 다시 매겼으면 무조건 수동 검토"가 이 도구의 계약이다. 검토 도구에서는
 * 놓치는 쪽이 과하게 잡는 쪽보다 훨씬 비싸다.
 */
describe('normalizeQuestionData — 보기 키 재부여는 반드시 수동 검토로 올린다', () => {
  // 마침표 뒤에 공백이 없는 라벨(A.하나)이라야 fixNewlines의 줄바꿈 분리를 피해
  // 한 블록에 남고, 그때 비로소 extractFromStem이 실제로 발동한다.
  const stemWithOptions = (): Q => ({
    type: 'multiple_choice',
    stem: [{ type: 'paragraph', text: '다음 중 옳은 것은? A.하나 B.둘 C.셋 D.넷' }],
    answer: ['a'],
  });

  it('지문에서 보기를 뽑아내면 검토 대상이 된다', () => {
    const { normalized, requiresManualReview } = normalizeQuestionData(stemWithOptions());
    // 뽑아내기는 실제로 일어났다(가정 붕괴 방지).
    expect(normalized.options?.map((o) => o.key)).toEqual(['a', 'b', 'c', 'd']);
    // 다른 검사는 전부 통과한다: 보기 4개, 정답 'a'가 목록에 있음, 더 쪼갤 보기 없음.
    // 그래서 이 문항을 잡아내는 것은 '키를 다시 매겼다'는 사실 하나뿐이다.
    // 정답 'a'가 새 목록에 "있다"는 이유로 통과시키면 안 된다 — 그 'a'는 다른 보기다.
    expect(requiresManualReview, '키를 새로 매겼는데 통과시켰다').toBe(true);
  });

  it('한 덩어리로 뭉친 보기를 쪼개도 검토 대상이 된다', () => {
    const q: Q = {
      type: 'multiple_choice',
      stem: [{ type: 'paragraph', text: '다음 중 옳은 것은?' }],
      options: [{ key: 'a', text: '① 하나 ② 둘 ③ 셋 ④ 넷' }],
      answer: ['a'],
    };
    const { normalized, requiresManualReview } = normalizeQuestionData(q);
    expect(normalized.options?.length).toBe(4);
    expect(requiresManualReview).toBe(true);
  });

  // 반대편도 못 박는다 — 손대지 않은 문항까지 검토로 올리면 260건짜리 목록이 부풀어
  // 진짜 위험한 항목이 묻힌다. 키를 안 건드렸으면 종전 판단 그대로여야 한다.
  it('보기를 손대지 않은 정상 문항은 검토 대상이 아니다', () => {
    const q: Q = {
      type: 'multiple_choice',
      stem: [{ type: 'paragraph', text: '다음 중 옳은 것은?' }],
      options: [
        { key: 'a', text: '하나' },
        { key: 'b', text: '둘' },
        { key: 'c', text: '셋' },
        { key: 'd', text: '넷' },
      ],
      answer: ['b'],
    };
    expect(normalizeQuestionData(q).requiresManualReview).toBe(false);
  });

  it('원본을 변형하지 않는다(검토 전 데이터가 흔들리면 안 된다)', () => {
    const q = stemWithOptions();
    const before = JSON.stringify(q);
    normalizeQuestionData(q);
    expect(JSON.stringify(q)).toBe(before);
  });
});
