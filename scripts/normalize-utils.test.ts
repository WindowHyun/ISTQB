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

/**
 * 한국어 보기 마커 — 가·나·다·라 네 글자.
 *
 * 마커 클래스를 `[가-라]`로 적으면 가·나·다·라가 아니라 U+AC00~U+B77C **전 음절**이라, 모든
 * "…한다."를 '다.' 앞에서 쪼갰다("발견한" / "다. 그리고 …" — requiresManualReview는 false라 검토에도
 * 안 올랐다). 정본 www/data에는 이미 같은 모양의 조각이 83곳 있다(렌더러가 이어 붙인다).
 */
describe('normalizeQuestionData — 문장 끝 "다."는 보기 마커가 아니다', () => {
  const blocks = (text: string): Q => ({
    type: 'multiple_choice',
    stem: [{ type: 'paragraph', text }],
    answer: ['a'],
  });

  it('문장 끝의 "…한다."를 쪼개지 않는다', () => {
    const text = '테스트는 결함을 발견한다. 그리고 리스크가 줄어든다. 다음 중 옳은 것은?';
    const { normalized } = normalizeQuestionData(blocks(text));
    expect(normalized.stem?.map((b) => b.text), '문장 끝 다.에서 지문이 쪼개졌다').toEqual([text]);
  });

  it('줄머리·공백 뒤의 진짜 가·나·다·라 마커는 여전히 나눈다', () => {
    const { normalized } = normalizeQuestionData(blocks('옳은 것은? 가. 하나 나. 둘 다. 셋 라. 넷'));
    expect(normalized.stem?.map((b) => b.text)).toEqual(['옳은 것은?', '가. 하나', '나. 둘', '다. 셋', '라. 넷']);
  });
});
