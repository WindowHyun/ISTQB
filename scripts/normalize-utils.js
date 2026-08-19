/**
 * PDF에서 뜯어낸 문항을 보기 쉬운 모양으로 되돌린다.
 *
 * ⚠ 이 함수의 결과를 **자동으로 채택하면 안 된다.** fix-questions.js는 결과를
 * reports/normalized/ 아래에만 쓰고 원본은 건드리지 않는다. 이유는 아래 위험 때문이다.
 *
 * ── 위험: 보기 키 재부여 ──────────────────────────────────────────────
 * 지문이나 한 덩어리 보기에서 보기를 뽑아낼 때(extractFromStem·extractFromOptions),
 * 새 보기에는 **나온 순서대로** 'a','b','c','d' 키를 새로 매긴다. 그런데 정답(q.answer)은
 * 원본 키를 그대로 들고 있다. 둘을 이어 주는 것은 아무것도 없다.
 *
 *   - 원본 키가 달랐다면(A·B·C / 1·2·3·4) 정답 키가 새 보기 목록에 없으므로 아래
 *     검증에서 잡힌다.
 *   - **원본 키도 이미 a·b·c·d였다면 아무것도 잡지 못한다.** 뽑아낸 순서가 원본 순서와
 *     다르면 정답이 조용히 다른 보기를 가리킨다 — 데이터는 멀쩡해 보이고 검증도 통과하며,
 *     사용자만 맞는 답을 골랐는데 오답 처리를 당한다.
 *
 * 그래서 **키를 다시 매겼으면 무조건 수동 검토로 올린다.** 이 스크립트는 검토 도구이므로
 * 놓치는 쪽(거짓 음성)이 과하게 잡는 쪽보다 훨씬 비싸다. 검토자는 새 보기의 순서가 원본과
 * 같은지, 그리고 q.answer가 여전히 옳은 보기를 가리키는지를 눈으로 확인해야 한다.
 *
 * @param {Object} rawQuestion The raw question object
 * @returns {Object} { normalized: Object, requiresManualReview: boolean }
 */
function normalizeQuestionData(rawQuestion) {
  let q = JSON.parse(JSON.stringify(rawQuestion));
  let requiresManualReview = false;
  /** 보기 키를 새로 매겼는가 — 그랬다면 정답 매핑을 사람이 확인해야 한다(위 주석). */
  let keysReassigned = false;

  // 1. Fix newlines in stem and explanation
  const fixNewlines = (blocks) => {
    if (!Array.isArray(blocks)) return blocks;
    let newBlocks = [];
    blocks.forEach(b => {
      if (typeof b.text === 'string') {
        let text = b.text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
        text = text.replace(/\n{3,}/g, '\n\n');

        // General list item separation
        text = text.replace(/([^\n])\s*(•|○|①|②|③|④|[가-라][\-\.]|[1-9]\.\s|[1-9]\)\s|[A-D][\.\)]\s)/g, '$1\n$2');
        text = text.replace(/([^\n])\s*([1-4]사분면:)/g, '$1\n$2');

        // Specific broken stems from PDF extraction
        text = text.replace('리뷰 활동은 다음과 같다: 개별 리뷰 리뷰 착수 리뷰 계획 의사소통 및 분석', '리뷰 활동은 다음과 같다:\nA. 개별 리뷰\nB. 리뷰 착수\nC. 리뷰 계획\nD. 의사소통 및 분석');
        text = text.replace('그리고 리뷰에서 맡은 책임은 다음과 같다: 리뷰 회의의 효과적인 진행과 편안한 리뷰 환경을 보장한다 리뷰 회의에서 결정사항, 식별한 새로운 이상 현상과 같은 리뷰 정보를 기록한다 리뷰 대상을 결정하고 리뷰에 참여할인력, 리뷰 시간 등 자원을 제공한다 리뷰 진행 시기, 장소 협의 등 리뷰에 대한 전반적인 책임을 진다', '그리고 리뷰에서 맡은 책임은 다음과 같다:\nA. 리뷰 회의의 효과적인 진행과 편안한 리뷰 환경을 보장한다\nB. 리뷰 회의에서 결정사항, 식별한 새로운 이상 현상과 같은 리뷰 정보를 기록한다\nC. 리뷰 대상을 결정하고 리뷰에 참여할 인력, 리뷰 시간 등 자원을 제공한다\nD. 리뷰 진행 시기, 장소 협의 등 리뷰에 대한 전반적인 책임을 진다');
        text = text.replace('다음과 같은 테스트 활동이 있다: 테스트 분석 테스트 설계 테스트 구현 테스트 완료', '다음과 같은 테스트 활동이 있다:\nA. 테스트 분석\nB. 테스트 설계\nC. 테스트 구현\nD. 테스트 완료');

        const parts = text.split('\n');
        parts.forEach(p => {
          const trimmed = p.trim();
          if (trimmed) {
            newBlocks.push({ ...b, text: trimmed });
          }
        });
      } else {
        newBlocks.push(b);
      }
    });
    return newBlocks;
  };

  q.stem = fixNewlines(q.stem);
  q.explanation = fixNewlines(q.explanation);

  // 2. Option extraction patterns
  const optionRegexes = [
    // 가- 가. 라- 라.
    /([가-라][\-\.])\s*(.*?)(?=(?:[가-라][\-\.])|$)/gs,
    // 1) 4)
    /([1-4]\))\s*(.*?)(?=(?:[1-4]\))|$)/gs,
    // ① ④
    /([①-④])\s*(.*?)(?=(?:[①-④])|$)/gs,
    // A. A) D. D)
    /([A-D][\.\)])\s*(.*?)(?=(?:[A-D][\.\)])|$)/gs
  ];

  const trySplitOptions = (text) => {
    if (typeof text !== 'string') return null;
    for (const regex of optionRegexes) {
      const matches = [...text.matchAll(regex)];
      if (matches.length >= 2 && matches.length <= 5) {
        return matches.map(m => ({ label: m[1], text: m[2].trim() }));
      }
    }
    return null;
  };

  // Helper to extract options if they are inside stem
  const extractFromStem = () => {
    if (!q.stem || q.stem.length === 0) return false;
    const lastBlock = q.stem[q.stem.length - 1];
    if (lastBlock.type !== 'paragraph' && lastBlock.type !== 'prompt') return false;

    const text = lastBlock.text;
    
    // Check if options are at the end of the text
    const match = text.match(/([가-라][\-\.]|[1-4]\)|[①-④]|[A-D][\.\)])\s*/);
    if (match) {
      const index = match.index;
      const potentialQuestion = text.substring(0, index).trim();
      const potentialOptions = text.substring(index);
      
      const extracted = trySplitOptions(potentialOptions);
      if (extracted && extracted.length >= 2) {
        lastBlock.text = potentialQuestion; // keep the question part
        // Remove the block entirely if it became empty
        if (lastBlock.text === '') {
          q.stem.pop();
        }
        
        q.options = extracted.map((ext, i) => ({
          key: String.fromCharCode(97 + i), // 'a', 'b', 'c', 'd'
          text: `${ext.label} ${ext.text}`
        }));
        keysReassigned = true;
        return true;
      }
    }
    return false;
  };

  // Helper to extract options if they are merged in options array
  const extractFromOptions = () => {
    if (q.options && q.options.length === 1) {
      const text = q.options[0].text;
      const extracted = trySplitOptions(text);
      if (extracted && extracted.length >= 2) {
        q.options = extracted.map((ext, i) => ({
          key: String.fromCharCode(97 + i),
          text: `${ext.label} ${ext.text}`
        }));
        keysReassigned = true;
        return true;
      }
    }
    return false;
  };

  // 3. Perform extraction
  if (!q.options || q.options.length <= 1) {
    let extracted = extractFromOptions();
    if (!extracted) {
      extracted = extractFromStem();
    }
  }

  // Also clean up option text itself
  if (Array.isArray(q.options)) {
    q.options = q.options.map(opt => {
      if (typeof opt.text === 'string') {
         opt.text = opt.text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
      }
      return opt;
    });
  }

  // 4. Validate and flag for review
  if (q.type === 'multiple_choice') {
    if (!Array.isArray(q.options) || (q.options.length !== 4 && q.options.length !== 5)) {
      requiresManualReview = true;
    }
  }

  if (Array.isArray(q.answer) && q.answer.length > 0) {
    const validKeys = Array.isArray(q.options) ? q.options.map(o => o.key) : [];
    const allAnswersValid = q.answer.every(ans => validKeys.includes(ans));
    if (!allAnswersValid) {
      requiresManualReview = true;
    }
    // 키를 다시 매겼다면 '정답 키가 목록에 있다'는 것으로는 아무것도 보장되지 않는다.
    // 원본 키도 a·b·c·d였다면 순서만 바뀌어도 통과하면서 정답이 다른 보기를 가리킨다.
    if (keysReassigned) {
      requiresManualReview = true;
    }
  } else {
    requiresManualReview = true;
  }

  // Also check if any option still seems to contain multiple options
  if (!requiresManualReview && Array.isArray(q.options)) {
    for (const opt of q.options) {
      // Just check if we can split it further. If so, it might be wrongly merged.
      // E.g., option A contains "B."
      const anotherSplit = trySplitOptions(opt.text);
      if (anotherSplit && anotherSplit.length > 1) {
        requiresManualReview = true;
      }
    }
  }

  return { normalized: q, requiresManualReview };
}

module.exports = {
  normalizeQuestionData
};
