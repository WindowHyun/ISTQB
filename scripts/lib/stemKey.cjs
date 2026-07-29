/**
 * 문항 동일성 키 — 같은 문제가 여러 세트에 재수록됐는지 판정하는 단일 원천.
 *
 * 왜 문항 id로는 안 되는가: id에 세트 접두가 붙어 있어(CSTS-EL-2019-005 vs
 * CSTS-FL-2404-001) 같은 문제라도 세트마다 id가 다르다. 전 세트 626문항의 id는
 * 626개 전부 고유하므로, id 기준 중복 제거는 세트 간 재수록을 하나도 걸러내지 못한다.
 *
 * 왜 지문만으로는 부족한가: 지문이 같아도 보기가 전혀 다른 별개 문제가 실재한다 —
 * ISTQB 샘플 B-040과 C-040은 지문이 같지만 보기가 완전히 다르고 정답도 a/d로 갈린다.
 * 지문만으로 묶으면 이 둘이 한 문제로 합쳐져 통계가 문항 하나를 잃는다.
 *
 * 왜 보기 전문(全文) 일치로도 안 되는가: 재수록하면서 표기가 손질된 경우가 많다 —
 * "결함을 발견하는 것이다" / "결함의 발견에 있다", "주요 작업" / "주요작업",
 * "overflow" / "오버플로". 전문 일치를 요구하면 같은 문제 6그룹이 갈라진다.
 *
 * 그래서 지문 + 정답 + 보기 개수를 쓴다. 실측으로 두 요건을 모두 만족하는 기준이다:
 *   - B-040/C-040은 정답이 달라 분리된다(오병합 없음).
 *   - 표기만 손질된 6그룹은 정답·보기 수가 같아 합쳐진다.
 * 결과: 교차 세트 중복 45그룹 94문항. 그룹 내 유형 불일치 0, 제품 교차 0.
 *
 * 정규화가 하는 일: 마크업·공백·문장부호를 걷어내 표기 차이만 다른 재수록을 같은 키로
 * 모은다. 규칙이 조금만 달라져도 그룹 수가 흔들리므로 여기 한 곳에서만 정의한다.
 *
 * 런타임(앱)은 이 파일을 쓰지 않는다 — 빌드 시 만든 그룹 표를 index.json에서 읽기만
 * 하므로 정규화 비용도 번들 크기도 앱에 실리지 않는다.
 */

/** stem은 { text } 노드의 중첩 구조 — 재귀로 텍스트만 뽑는다. */
function collectText(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) collectText(n, out);
    return;
  }
  if (typeof node === "object") {
    if (typeof node.text === "string") out.push(node.text);
    // 표·목록 등 중첩 컨테이너. 지문 본문이 여기 들어가는 문항이 있다.
    for (const key of ["items", "rows", "cells", "children"]) {
      if (node[key]) collectText(node[key], out);
    }
  }
}

/**
 * 렌더러가 해석하는 유일한 마크업. parser.tsx는 <u>…</u>만 밑줄로 렌더하고 그 외
 * 꺾쇠는 문자 그대로 보여준다 — 정규화도 같은 계약을 따라야 화면과 키가 어긋나지 않는다.
 *
 * 일반적인 태그 제거(/<[^>]+>/g)를 쓰면 안 된다. 지문에는 태그가 아닌 꺾쇠가 실제로 있고
 * (<보기>, <제어 흐름 그래프>, "A < B", "D < 0", "T> 12") 그것들은 내용이다. 싸잡아
 * 지우면 문항의 뜻이 달라진 채로 키가 만들어진다.
 */
const RENDERED_TAG = /<\/?u\s*>/gi;

function normalize(text) {
  return String(text || "")
    // 표기 차이 흡수 — 같은 문장이 밑줄 유무만 다르게 수록된 경우를 같은 키로 모은다.
    .replace(RENDERED_TAG, "")
    .replace(/\s+/g, "")
    // 문장부호·괄호·따옴표는 재수록 시 표기가 흔들리는 부분이라 무시한다.
    .replace(/[.,·:;()[\]{}"'`~!?\-–—]/g, "")
    .toLowerCase();
}

/**
 * 문항의 동일성 키. 지문이 너무 짧아 신뢰할 수 없으면 null을 돌려준다
 * (짧은 지문끼리 우연히 같아 서로 다른 문제가 병합되는 것을 막는다).
 */
function stemKeyOf(question) {
  const parts = [];
  collectText(question.stem, parts);
  const stem = normalize(parts.join(" "));
  if (stem.length < 10) return null;
  // 정답과 보기 개수를 함께 넣는다 — 지문이 같아도 다른 문제면 대개 정답이 갈린다.
  // 보기 전문을 쓰지 않는 이유는 파일 상단 주석 참조(재수록 시 표기 손질을 흡수).
  const answer = [...(question.answer || [])].sort().join(",");
  const optionCount = (question.options || []).length;
  return `${stem}##${answer}##${optionCount}`;
}

module.exports = { stemKeyOf, normalize, collectText };
