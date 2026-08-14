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

async function renderRichTextEl(content: unknown, inline = false): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(RichText, { content, inline }));
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

  // #2: src가 없는 이미지 블록은 렌더하지 않는다.
  it("src가 없는 이미지 블록은 렌더하지 않는다", async () => {
    const el = await renderRichTextEl([{ type: "image", text: "" }]);
    expect(el.querySelector("img")).toBeNull();
  });

  // 가/나/다/라 항목에서 "다."가 직전 "나." 항목에 잘못 흡수되지 않는다(항목 보존).
  it("한글 항목 마커(가/나/다/라)는 '다.' 어미 병합으로 사라지지 않는다", async () => {
    const text = await renderRichText([
      { type: "paragraph", text: "나. 변경이 올바르게 되었는지를 검사하기 위한 테스트" },
      { type: "paragraph", text: "다. 빌드가 테스트할만한 수준인지를 확인하는 테스트" },
    ]);
    expect(text).toContain("다. 빌드가 테스트할만한");
  });

  // 항목 마커(나.) 뒤라도 내용 없는 "다."(어미)는 합쳐야 한다("만족한다.").
  it("항목 뒤 내용 없는 '다.' 어미는 이전 줄과 합친다", async () => {
    const text = await renderRichText([
      { type: "paragraph", text: "나. 문장 커버리지를 만족하는 테스트 케이스 집합은 항상 조건 커버리지를 만족한" },
      { type: "paragraph", text: "다." },
    ]);
    expect(text).toContain("만족한다.");
  });

  // 보기/지문의 마크다운 파이프 표가 실제 <table>로 렌더된다(raw "|" 노출 금지).
  it("마크다운 파이프 표를 <table>로 렌더한다", async () => {
    const md = "| step# | 상태 | 입력 |\n|---|---|---|\n| 1 | 노선 예약됨 | 결제 |\n| 2 | 결제됨 | 발권 |";
    const el = await renderRichTextEl(md);
    const table = el.querySelector("table.data-table");
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("tr").length).toBe(3); // 헤더 + 2행(구분행 제외)
    expect(el.textContent).not.toContain("|---|");
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

  // #1: 괄호 안에서 쪼개진 영문 약어(QA)도 이어붙인다.
  it("괄호 안에서 쪼개진 QA 약어를 이어붙인다", async () => {
    const text = await renderRichText([
      { type: "paragraph", text: "테스트 부서를 품질 보증(Q" },
      { type: "paragraph", text: "A) 부서라고 한" },
      { type: "paragraph", text: "다." },
    ]);
    expect(text).toContain("품질 보증(QA) 부서라고 한다.");
  });

  // #2: 괄호 안 O/X 표기가 쪼개진 경우도 이어붙인다.
  it("괄호 안 O/X 표기 분할을 이어붙인다", async () => {
    const text = await renderRichText([
      { type: "paragraph", text: "정적 테스트 방법이다. (" },
      { type: "paragraph", text: "○ / X )" },
    ]);
    expect(text).toContain("(○ / X )");
  });

  // 빈칸 참조 기호(①)가 떨어져 나온 경우 이어붙인다.
  it("빈칸+①… 분할을 이어붙인다", async () => {
    const text = await renderRichText([
      { type: "paragraph", text: "아래 빈칸" },
      { type: "prompt", text: "①에 공통으로 들어갈 알맞은 용어는?" },
    ]);
    expect(text).toContain("빈칸①에");
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

describe("RichText — 콘텐츠 표시 수정 회귀(2402 Q2·2405 Q38/Q63·중첩 번호)", () => {
  // note 타입도 병합 대상 — CSTS 각주(※…)의 "…의미한"+"다." 조각을 잇는다(2402 Q2).
  it("note 블록의 한국어 어미 분절을 이어붙인다", async () => {
    const el = await renderRichTextEl([
      { type: "note", text: "※ A < B는 A의 개념보다 B가 더 광범위한 용어임을 의미한" },
      { type: "note", text: "다. A = B는 A와 B가 동일한 범위를 가짐을 의미한" },
      { type: "note", text: "다." },
    ]);
    const text = el.textContent || "";
    expect(text).toContain("의미한다. A = B는");
    expect(text).toContain("가짐을 의미한다.");
    // 조각 "다."가 별도 줄로 남지 않는다.
    const lines = Array.from(el.querySelectorAll(".text-line")).map((n) => (n.textContent || "").trim());
    expect(lines).not.toContain("다.");
  });

  // 다단계 번호("1.1")는 marker가 통째로 잡히고 들여쓰기 클래스가 붙는다.
  it("'1.1 기능' 항목은 1.1 전체가 마커이고 들여쓴다", async () => {
    const el = await renderRichTextEl([
      { type: "note", text: "1. 기능적 요구사항" },
      { type: "note", text: "1.1 기능 1" },
      { type: "note", text: "2.3 신뢰성 요구사항" },
    ]);
    const text = el.textContent || "";
    expect(text).toContain("1.1 기능 1");           // "1." + "1 기능 1"로 쪼개지지 않음
    expect(el.querySelectorAll(".indent-1").length).toBeGreaterThanOrEqual(2); // 1.1·2.3 들여쓰기
  });

  // <u>…</u> 인라인 밑줄만 해석한다(그 외 태그는 텍스트 그대로 — XSS 안전).
  it("<u> 구간을 밑줄로 렌더하고 다른 태그는 해석하지 않는다", async () => {
    const el = await renderRichTextEl([
      { type: "paragraph", text: "테스트 팀은 <u>동일한 테스트 케이스를 사용하여 새로운 버전을 테스트</u> 하였다." },
      { type: "paragraph", text: "<script>alert(1)</script><b>굵게?</b>" },
    ]);
    const u = el.querySelector("u");
    expect(u?.textContent).toBe("동일한 테스트 케이스를 사용하여 새로운 버전을 테스트");
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("b")).toBeNull();
    expect(el.textContent).toContain("<b>굵게?</b>"); // 밑줄 외 태그는 문자 그대로
  });

  // (가)~(바) 가로 나열 문단은 리스트 마커 강조 없이 그대로 한 줄 텍스트다(2405 Q38).
  it("가로 나열 '(가) … (나) …' 문단은 마커 강조 없이 렌더된다", async () => {
    const el = await renderRichTextEl([
      { type: "paragraph", text: "(가) 테스트 계획서   (나) 테스트 설계 명세서   (다) 테스트 케이스 명세서" },
    ]);
    expect(el.querySelectorAll(".structured-marker").length).toBe(0);
    expect(el.textContent).toContain("(가) 테스트 계획서");
  });
});

  // formula 블록도 괄호 열림/어미 분절을 이어붙인다(B Q23·C Q31).
describe("RichText — formula 조각 병합", () => {
  it("괄호가 열린 formula 조각을 이어붙인다", async () => {
    const text = await renderRichText([
      { type: "formula", text: "E(" },
      { type: "formula", text: "5) = (3*A(" },
      { type: "formula", text: "4) + A(3)) / 5" },
    ]);
    expect(text).toContain("E(5) = (3*A(4) + A(3)) / 5");
  });
});

describe("RichText — inline 모드(보기 텍스트) 회귀", () => {
  // 보기 값 "33.3%"·"10.5 M/D"가 하위 번호("1.1") 마커로 오인되면
  // 숫자 부분이 마커 스타일(강조)로 렌더된다 — inline에서는 구조 마커 해석을 끈다.
  it("소수값 보기는 마커 강조 없이 통짜 텍스트로 렌더된다", async () => {
    for (const v of ["33.3%", "10.5 M/D", "3.5시간"]) {
      const el = await renderRichTextEl(v, true);
      expect(el.querySelector(".structured-list")).toBeNull();
      expect((el.textContent ?? "").replace(/\s+/g, "")).toBe(v.replace(/\s+/g, ""));
    }
  });

  it("inline에서도 파이프 표 보기는 <table>로 렌더된다", async () => {
    const el = await renderRichTextEl("| TC | OS |\n|---|---|\n| 1 | IBM |", true);
    expect(el.querySelector("table")).not.toBeNull();
    expect(el.textContent).toContain("IBM");
  });

  it("stem(비 inline) 하위 번호 리스트는 계속 마커로 해석된다", async () => {
    const el = await renderRichTextEl("1. 기능적 요구사항\n1.1 기능 1", false);
    expect(el.querySelector(".structured-list")).not.toBeNull();
  });
});

// 코드 블록은 overflow-x: auto라 가로로 잘리는데, 포커스를 받을 수 없으면 키보드·
// 스크린리더 사용자는 잘린 부분을 영영 볼 수 없다(WCAG 2.1.1, axe
// scrollable-region-focusable/serious). E2E(react-a11y-axe)가 한 문항을 지정해 보지만,
// 렌더러 자체의 계약은 여기서 못 박는다 — 속성 한 줄이 지워져도 유닛이 잡아야 한다.
describe("RichText — 코드 블록 접근성", () => {
  it("코드 블록이 키보드 포커스를 받을 수 있고 이름을 갖는다", async () => {
    const el = await renderRichTextEl([{ type: "code", lines: ["int a = 1;", "print(a);"] }]);
    const block = el.querySelector(".code-block");
    expect(block, "코드 블록이 렌더되지 않았다").not.toBeNull();
    expect(block!.getAttribute("tabindex")).toBe("0");
    // 이름 없는 포커스 대상이 되면 스크린리더가 "무엇에 왔는지" 알릴 수 없다.
    expect(block!.getAttribute("role")).toBe("group");
    expect(block!.getAttribute("aria-label")).toBeTruthy();
  });

  it("코드 줄바꿈을 보존한다", async () => {
    const el = await renderRichTextEl([{ type: "code", lines: ["a", "b"] }]);
    expect(el.querySelector(".code-block")!.textContent).toBe("a\nb");
  });

  /**
   * 손상·비정형 블록 방어 — 지문은 PDF 추출본이라 형태가 어긋난 것이 섞여 들어온다.
   * 한 블록 때문에 렌더 전체가 죽으면 그 문항은 화면에 아무것도 뜨지 않는다(원인도 안 보인다).
   */
  it("__TABLE__ 마커의 JSON이 깨져 있으면 표 대신 글자로 내려 렌더한다", async () => {
    const el = await renderRichTextEl("__TABLE__:[[깨진");
    expect(el.querySelector("table")).toBeNull();
    expect(el.textContent).toContain("__TABLE__:[[깨진");
  });

  it("__TABLE__ 마커가 배열이 아니면 표로 만들지 않는다", async () => {
    const el = await renderRichTextEl('__TABLE__:{"a":1}');
    expect(el.querySelector("table")).toBeNull();
    expect(el.textContent).toContain("__TABLE__:");
  });

  it("__CODE__ 마커의 JSON이 깨져 있어도 글자로 남는다", async () => {
    const el = await renderRichTextEl("__CODE__:[불완전");
    expect(el.querySelector("pre")).toBeNull();
    expect(el.textContent).toContain("__CODE__:[불완전");
  });

  it("이미지 블록은 src 필드로도 렌더된다(마크다운이 아니어도)", async () => {
    const el = await renderRichTextEl([{ type: "image", src: "/images/questions/a.png" }]);
    expect(el.querySelector("img")?.getAttribute("src")).toBe("/images/questions/a.png");
  });

  it("코드 블록이 lines 없이 text로 와도 줄로 나눠 렌더한다", async () => {
    const el = await renderRichTextEl([{ type: "code", text: "line1\nline2" }]);
    const block = el.querySelector(".code-block");
    expect(block, "lines 없이 온 코드 블록이 렌더되지 않았다").not.toBeNull();
    expect(block!.textContent).toBe("line1\nline2");
  });

  it("표 블록에 rows가 없으면 표를 만들지 않는다(빈 표 대신 아무것도)", async () => {
    const el = await renderRichTextEl([{ type: "table" }]);
    expect(el.querySelector("table")).toBeNull();
  });

  it("list 항목이 객체면 marker를 그대로 쓰고, 없으면 순번을 준다", async () => {
    const el = await renderRichTextEl([
      { type: "list", items: [{ marker: "㉠", text: "첫째" }, { text: "둘째" }] },
    ]);
    const markers = Array.from(el.querySelectorAll(".structured-marker")).map((m) => m.textContent);
    expect(markers).toEqual(["㉠", "2."]);
    expect(el.textContent).toContain("첫째");
  });

  // PDF에서 불릿은 글꼴 전용 영역(PUA) 문자로 나오기도 한다 — 그대로 두면 네모(□)로 보인다.
  it("불릿 마커는 PUA 문자여도 기호(•)로 통일해 렌더한다", async () => {
    const el = await renderRichTextEl([{ type: "list", items: ["\u2022 첫째", "\uF0B7 둘째"] }]);
    const markers = Array.from(el.querySelectorAll(".structured-marker")).map((m) => m.textContent);
    expect(markers).toEqual(["\u2022", "\u2022"]);
    expect(el.textContent).toContain("둘째");
  });

  it("빈 문자열·빈 블록은 아무것도 렌더하지 않는다", async () => {
    const el = await renderRichTextEl([{ type: "paragraph", text: "   " }, { type: "paragraph" }]);
    expect((el.textContent ?? "").trim()).toBe("");
  });
});
