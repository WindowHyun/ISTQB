import { describe, it, expect } from "vitest";
import { isAnswerCorrect, isQuestionCorrect } from "./answer";

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

// 유형별 정답판정(단답형 정규화 / 진위형 / 객관식) — #3 기능 추가분.
describe("isQuestionCorrect", () => {
  it("단답형은 공백·대소문자 무시 후 일치하면 정답", () => {
    expect(isQuestionCorrect(["테스트 실행"], ["테스트실행"], "short_answer")).toBe(true);
    expect(isQuestionCorrect(["50%"], [" 50 % "], "short_answer")).toBe(true);
    expect(isQuestionCorrect(["Boundary"], ["boundary"], "short_answer")).toBe(true);
  });
  it("단답형 미입력/오답은 오답", () => {
    expect(isQuestionCorrect(["테스트 실행"], [], "short_answer")).toBe(false);
    expect(isQuestionCorrect(["테스트 실행"], ["디버깅"], "short_answer")).toBe(false);
  });
  it("진위형(o/x)은 키 비교로 판정", () => {
    expect(isQuestionCorrect(["o"], ["o"], "true_false")).toBe(true);
    expect(isQuestionCorrect(["x"], ["o"], "true_false")).toBe(false);
  });
  it("객관식은 기존 키 비교를 따른다", () => {
    expect(isQuestionCorrect(["a", "b"], ["b", "a"], "multiple_choice")).toBe(true);
    expect(isQuestionCorrect(["a"], ["b"], "multiple_choice")).toBe(false);
  });
});
