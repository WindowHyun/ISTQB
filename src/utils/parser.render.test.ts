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
});
