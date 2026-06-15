import { describe, it, expect } from "vitest";
import { clampQuestionIndex, isCorrectAnswer, toSavedAnswer } from "./quiz.utils";
import type { QuizQuestion } from "./quiz.types";

function makeQuestion(answer: string[]): QuizQuestion {
  return { id: "SET-1", number: 1, type: "multiple_choice", stem: [], answer };
}

describe("isCorrectAnswer", () => {
  it("선택 순서와 무관하게 정답을 판정한다", () => {
    expect(isCorrectAnswer(makeQuestion(["a", "b"]), ["b", "a"])).toBe(true);
  });
  it("단일 정답이 일치하면 정답", () => {
    expect(isCorrectAnswer(makeQuestion(["c"]), ["c"])).toBe(true);
  });
  it("일부만 선택하면 오답", () => {
    expect(isCorrectAnswer(makeQuestion(["a", "b"]), ["a"])).toBe(false);
  });
  it("정답 개수를 초과해 선택하면 오답", () => {
    expect(isCorrectAnswer(makeQuestion(["a"]), ["a", "b"])).toBe(false);
  });
  it("미선택은 오답", () => {
    expect(isCorrectAnswer(makeQuestion(["a"]), [])).toBe(false);
  });
});

describe("clampQuestionIndex", () => {
  const three = [makeQuestion(["a"]), makeQuestion(["a"]), makeQuestion(["a"])];
  it("상한을 넘으면 마지막 인덱스로 고정", () => {
    expect(clampQuestionIndex(5, three)).toBe(2);
  });
  it("음수는 0으로 고정", () => {
    expect(clampQuestionIndex(-1, three)).toBe(0);
  });
  it("범위 내 값은 유지", () => {
    expect(clampQuestionIndex(1, three)).toBe(1);
  });
  it("빈 목록은 0", () => {
    expect(clampQuestionIndex(3, [])).toBe(0);
  });
});

describe("toSavedAnswer", () => {
  it("정답 여부와 메타데이터를 기록한다", () => {
    const saved = toSavedAnswer(makeQuestion(["a", "b"]), "exam", ["b", "a"]);
    expect(saved.questionId).toBe("SET-1");
    expect(saved.mode).toBe("exam");
    expect(saved.selected).toEqual(["b", "a"]);
    expect(saved.isCorrect).toBe(true);
    expect(typeof saved.updatedAt).toBe("number");
  });
  it("오답이면 isCorrect=false", () => {
    const saved = toSavedAnswer(makeQuestion(["a"]), "practice", ["b"]);
    expect(saved.isCorrect).toBe(false);
  });
});
