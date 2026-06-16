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

async function renderRichTextEl(content: unknown): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(RichText, { content }));
  });
  // unmount는 호출자가 끝난 뒤 GC. 검증을 위해 DOM 스냅샷을 복제해 반환.
  const clone = container.cloneNode(true) as HTMLElement;
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return clone;
}

async function renderRichText(content: unknown): Promise<string> {
  const el = await renderRichTextEl(content);
  return el.textContent ?? "";
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

  // #1: prompt 타입으로 끊긴 조각("보여준"+"다.")도 이어붙인다.
  it("prompt 타입 문장 조각도 이어붙인다", async () => {
    const text = await renderRichText([
      { type: "prompt", text: "결함의 상태별 누적 개수를 보여준" },
      { type: "prompt", text: "다. 이에 대한 설명으로 올바르지 않은 것은?" },
    ]);
    expect(text).toContain("보여준다.");
  });

  // #2: 이미지 블록 src가 마크다운(![..](url))에 들어와도 <img>로 렌더한다.
  it("마크다운 이미지 블록에서 src를 추출해 <img>로 렌더한다", async () => {
    const el = await renderRichTextEl([
      { type: "image", text: "![이미지](/images/questions/CSTS-FL-2402-030.png)" },
    ]);
    const img = el.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/images/questions/CSTS-FL-2402-030.png");
  });

  // #2: src가 없는 이미지 블록은 깨진 <img>를 만들지 않는다.
  it("src가 없는 이미지 블록은 렌더하지 않는다", async () => {
    const el = await renderRichTextEl([{ type: "image", text: "" }]);
    expect(el.querySelector("img")).toBeNull();
  });

  // #4: AC1/AC2/AC3 인수 조건은 각각 별도 줄로 분리되어야 하며 다시 합쳐지면 안 된다.
  it("AC 인수 조건은 줄마다 분리된다(과병합 금지)", async () => {
    const el = await renderRichTextEl([
      {
        type: "paragraph",
        text: "인수 조건: AC1: 일반 사용자는 1~3층에 출입할 수 있다 AC2: 4층은 특별 사용자만 출입할 수 있다 AC3: 특별 사용자는 모든 권한을 가진다",
      },
    ]);
    const lines = Array.from(el.querySelectorAll(".text-line")).map((n) => n.textContent || "");
    expect(lines.some((l) => l.startsWith("AC1:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("AC2:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("AC3:"))).toBe(true);
  });

  // "다음"처럼 "다" 뒤에 음절이 붙는 경우는 이전 줄과 합치면 안 된다(과병합 금지).
  it("'다음…'으로 시작하는 줄은 이전 줄과 합치지 않는다", async () => {
    const el = await renderRichTextEl([
      { type: "paragraph", text: "특별 사용자는 모든 권한을 가진다" },
      { type: "prompt", text: "다음 중 AC3을 테스트하는 데 가장 합리적인 테스트 케이스는?" },
    ]);
    const lines = Array.from(el.querySelectorAll(".text-line")).map((n) => n.textContent || "");
    expect(lines.some((l) => l.startsWith("다음 중 AC3"))).toBe(true);
  });
});
