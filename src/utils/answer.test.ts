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
  it("중복 선택은 개수가 맞아도 오답(가져오기 데이터 방어)", () => {
    expect(isAnswerCorrect(["a", "b"], ["a", "a"])).toBe(false);
    expect(isAnswerCorrect(["a", "b"], ["A", "a"])).toBe(false); // 정규화 후 중복
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
  it("단답형: 한 문자열에 콤마로 묶인 동의어를 개별 허용답으로 인정", () => {
    const ans = ["동등 분할(클래스), 동치 분할, 등가 분할 Equivalence partitioning"];
    expect(isQuestionCorrect(ans, ["동등 분할"], "short_answer")).toBe(true); // 괄호 제거형
    expect(isQuestionCorrect(ans, ["동치 분할"], "short_answer")).toBe(true);
    expect(isQuestionCorrect(ans, ["클래스"], "short_answer")).toBe(true); // 괄호 내용
    expect(isQuestionCorrect(ans, ["전혀 다른 답"], "short_answer")).toBe(false);
  });
  it("단답형: 공백 낀 슬래시로 묶인 동의어 인정(용어 내부 슬래시는 미분리)", () => {
    expect(isQuestionCorrect(["재테스팅 / retesting / 재테스트"], ["retesting"], "short_answer")).toBe(true);
    expect(isQuestionCorrect(["재테스팅 / retesting / 재테스트"], ["재테스트"], "short_answer")).toBe(true);
    // "조건/결정"은 공백 없는 슬래시 → 분리하지 않는다(전체/괄호제거형으로만 인정).
    expect(isQuestionCorrect(["조건/결정(분기) 커버리지"], ["조건/결정 커버리지"], "short_answer")).toBe(true);
    expect(isQuestionCorrect(["조건/결정(분기) 커버리지"], ["조건"], "short_answer")).toBe(false);
  });
  it("단답형: 괄호 병기(영문·대안)는 괄호 유무 모두 정답", () => {
    expect(isQuestionCorrect(["로그(Log)"], ["로그"], "short_answer")).toBe(true);
    expect(isQuestionCorrect(["로그(Log)"], ["Log"], "short_answer")).toBe(true);
    expect(isQuestionCorrect(["로그(Log)"], ["로그(Log)"], "short_answer")).toBe(true); // 원문 전체도 유지
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
