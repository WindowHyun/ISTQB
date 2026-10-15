import { describe, expect, it } from "vitest";
import { isReddish, parseCssColor } from "../e2e/cssColor";

// E2E가 getComputedStyle로 읽는 색 문자열의 파서. 입력은 Chromium이 실제로 돌려주는 직렬화다
// (`color-mix(in srgb, #c81e1e 80%, white)` → `color(srgb 0.827451 0.294118 0.294118)` 등을 실측했다).
//
// 이 검사가 있는 이유: 종전 파서는 숫자만 뽑아 읽어서 `color(display-p3 0.4 0.4 0.4)`(회색)을 붉다고 답했고
// `oklch(0.55 0.22 27)`(붉은색)을 아니라고 답했다. 붉은 기를 `.toBe(false)`로 재는 단언은 그 틀린 답으로 조용히 통과한다.
describe("parseCssColor", () => {
  it("rgb()·rgba()는 0~255 채널 그대로 읽는다", () => {
    expect(parseCssColor("rgb(200, 30, 30)")).toEqual({ r: 200, g: 30, b: 30 });
    expect(parseCssColor("rgba(200, 30, 30, 0.5)")).toEqual({ r: 200, g: 30, b: 30 });
    expect(parseCssColor("rgba(0, 0, 0, 0)")).toEqual({ r: 0, g: 0, b: 0 }); // transparent
  });

  it("공백 구문과 슬래시 알파도 읽는다", () => {
    expect(parseCssColor("rgb(200 30 30 / 0.5)")).toEqual({ r: 200, g: 30, b: 30 });
    expect(parseCssColor("  rgb(200 30 30)  ")).toEqual({ r: 200, g: 30, b: 30 });
  });

  // color-mix()의 계산값은 0~1 채널의 color(srgb …)다 — 255를 곱하지 않으면 모든 색이 검정에 가까워 보인다.
  it("color(srgb …)는 0~1 채널을 255배 해서 읽는다", () => {
    const c = parseCssColor("color(srgb 0.827451 0.294118 0.294118)");
    expect(c.r).toBeCloseTo(211, 0);
    expect(c.g).toBeCloseTo(75, 0);
    expect(c.b).toBeCloseTo(75, 0);
    expect(parseCssColor("color(srgb 1 0 0 / 0.4)")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it.each([
    ["color(display-p3 0.4 0.4 0.4)", "색 공간 이름 속 숫자('p3')를 채널로 읽지 않는다"],
    ["oklch(0.55 0.22 27)", "sRGB가 아닌 공간의 값을 sRGB로 착각하지 않는다"],
    ["lab(45 70 55)", "sRGB가 아닌 공간의 값을 sRGB로 착각하지 않는다"],
    ["color(srgb-linear 0.5 0.1 0.1)", "이름이 비슷한 다른 공간"],
    ["rgb(100%, 0%, 0%)", "퍼센트 채널은 계산값에 나오지 않는다"],
    ["#c81e1e", "계산값은 16진수로 오지 않는다"],
    ["red", "계산값은 색 이름으로 오지 않는다"],
    ["", "빈 문자열"],
  ])("읽을 수 없는 형식은 던진다: %s (%s)", (css) => {
    expect(() => parseCssColor(css)).toThrow(/읽을 수 없는 색 형식/);
  });
});

describe("isReddish", () => {
  it("경고색(빨강)은 붉다", () => {
    expect(isReddish("rgb(200, 30, 30)")).toBe(true); // 라이트 테마 --danger
    expect(isReddish("rgb(255, 107, 107)")).toBe(true); // 밝은 빨강(다크 테마 쪽)
    expect(isReddish("color(srgb 0.827451 0.294118 0.294118)")).toBe(true); // color-mix로 섞은 빨강
  });

  it("회색·검정·파랑·초록은 붉지 않다", () => {
    expect(isReddish("rgb(229, 231, 235)")).toBe(false); // 테두리 회색
    expect(isReddish("rgb(17, 24, 39)")).toBe(false); // 본문 글자
    expect(isReddish("rgb(37, 99, 235)")).toBe(false); // 파랑
    expect(isReddish("rgb(28, 124, 60)")).toBe(false); // 초록
    expect(isReddish("color(srgb 0.4 0.4 0.4)")).toBe(false); // 255배를 빠뜨리면 모든 색이 같은 어둠으로 읽힌다
  });

  it("붉은 기의 경계: 초록·파랑보다 40 넘게 커야 한다", () => {
    expect(isReddish("rgb(141, 100, 100)")).toBe(true);
    expect(isReddish("rgb(140, 100, 100)")).toBe(false);
  });

  it("읽을 수 없는 형식은 false가 아니라 던진다", () => {
    expect(() => isReddish("oklch(0.55 0.22 27)")).toThrow();
  });
});
