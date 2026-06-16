import { describe, it, expect } from "vitest";
import { isAnswerCorrect } from "./answer";

// QuestionCard/QuestionWorkspace 공유 정답판정 로직 유닛 테스트 (#76).
describe("isAnswerCorrect", () => {
  it("순서·대소문자 무관하게 일치하면 정답", () => {
    expect(isAnswerCorrect(["a", "b"], ["B", "a"])).toBe(true);
    expect(isAnswerCorrect(["C"], ["c"])).toBe(true);
  });
  it("개수 불일치는 오답", () => {
    expect(isAnswerCorrect(["a", "b"], ["a"])).toBe(false); // 부족
    expect(isAnswerCorrect(["a"], ["a", "b"])).toBe(false); // 초과
  });
  it("미선택은 오답", () => {
    expect(isAnswerCorrect(["a"], [])).toBe(false);
  });
  it("틀린 선택은 오답", () => {
    expect(isAnswerCorrect(["a"], ["b"])).toBe(false);
    expect(isAnswerCorrect(["a", "b"], ["a", "c"])).toBe(false);
  });
});
