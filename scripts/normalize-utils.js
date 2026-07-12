/**
 * Normalizes question data, fixing newlines and separating options.
 * @param {Object} rawQuestion The raw question object
 * @returns {Object} { normalized: Object, requiresManualReview: boolean }
 */
function normalizeQuestionData(rawQuestion) {
  let q = JSON.parse(JSON.stringify(rawQuestion));
  let requiresManualReview = false;

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
