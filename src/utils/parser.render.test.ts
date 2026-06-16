// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { RichText } from "./parser";

// parser.tsx의 renderRichText 미정의로 인한 런타임 크래시(#56/#68에서 발견)를 막는 회귀 가드.
// RichText는 useEffect에서 renderRichText를 호출하므로, 정의가 없으면 이 테스트가 throw로 실패한다.
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

async function renderRichText(content: unknown): Promise<string> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(RichText, { content }));
  });
  const text = container.textContent ?? "";
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return text;
}

describe("RichText (parser renderRichText 회귀 가드)", () => {
  it("ContentBlock[] stem을 텍스트로 렌더한다", async () => {
    const text = await renderRichText([{ type: "paragraph", text: "유효한 테스트 목적" }]);
    expect(text).toContain("유효한 테스트 목적");
  });

  it("문자열 content도 렌더한다", async () => {
    const text = await renderRichText("단순 문자열 보기");
    expect(text).toContain("단순 문자열 보기");
  });

  // #1: 이미 마커를 가진 list 항목에 순번을 또 붙이지 않는다("1. A." 이중 표기 방지).
  it("기존 마커가 있는 list 항목은 번호를 중복 부여하지 않는다", async () => {
    const text = await renderRichText([
      { type: "list", items: ["1. 사용성 테스팅", "2. 단위 테스팅"] },
      { type: "list", items: ["A. 1사분면: 기술", "B. 2사분면: 비즈니스"] },
    ]);
    expect(text).toContain("A.1사분면: 기술");
    expect(text).not.toContain("1.A."); // A 보기 앞에 번호가 또 붙으면 안 됨
    expect(text).not.toContain("1.1."); // 1 항목 앞에 번호가 또 붙으면 안 됨
  });

  // #2: PDF 분할로 끊긴 문장 조각을 표시 단계에서 다시 이어붙인다(데이터 불변).
  it("종결부호 없이 끊긴 문단 조각을 이어붙인다", async () => {
    const text = await renderRichText([
      { type: "paragraph", text: "변경되었는지 테스트한" },
      { type: "paragraph", text: "다." },
    ]);
    expect(text).toContain("테스트한다.");
  });

  // #3: 단어가 블록 경계에서 쪼개진 경우(예: 개발(ATD + D))도 이어붙인다.
  it("괄호 안에서 쪼개진 영문 약어 조각을 이어붙인다", async () => {
    const text = await renderRichText([
      { type: "paragraph", text: "인수 테스트 주도 개발(ATD" },
      { type: "paragraph", text: "D) 접근법을 가장 잘 설명한 것은?" },
    ]);
    expect(text).toContain("(ATDD)");
  });
});
