import { describe, it, expect } from "vitest";
import { sanitizeAnswers, sanitizeUiState } from "./storage";

// 외부 입력(localStorage/백업 JSON) 검증 로직 유닛 테스트 (#65/#76).
describe("sanitizeAnswers", () => {
  it("문자열 배열만 남기고 비문자열/빈 배열을 제거한다", () => {
    const out = sanitizeAnswers({
      "S-exam-1": ["a", "b"],
      "S-exam-2": ["c", 3, null],
      "S-exam-3": [],
      "S-exam-4": "notarray",
    });
    expect(out).toEqual({ "S-exam-1": ["a", "b"], "S-exam-2": ["c"] });
  });
  it("객체가 아니면 빈 객체", () => {
    expect(sanitizeAnswers(null)).toEqual({});
    expect(sanitizeAnswers("x")).toEqual({});
    expect(sanitizeAnswers([1, 2])).toEqual({});
  });
});

describe("sanitizeUiState", () => {
  it("유효 필드만 통과시킨다", () => {
    const out = sanitizeUiState({
      mode: "exam",
      setId: "S",
      index: 3,
      elapsedSeconds: 12.5,
      navCollapsed: true,
      reviewIds: { S: ["S-1", 2, "S-3"] },
    });
    expect(out).toEqual({
      mode: "exam",
      setId: "S",
      index: 3,
      elapsedSeconds: 12.5,
      navCollapsed: true,
      reviewIds: { S: ["S-1", "S-3"] },
    });
  });
  it("잘못된 값은 버린다", () => {
    const out = sanitizeUiState({
      mode: "hacker",        // 화이트리스트 밖
      setId: 123,            // 문자열 아님
      index: -1,             // 음수
      elapsedSeconds: NaN,   // 비유한
      navCollapsed: "yes",   // boolean 아님
      reviewIds: "nope",     // 객체 아님
    });
    expect(out).toEqual({});
  });
  it("객체가 아니면 빈 객체", () => {
    expect(sanitizeUiState(undefined)).toEqual({});
    expect(sanitizeUiState(42)).toEqual({});
  });
});
