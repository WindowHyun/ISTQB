import { describe, it, expect } from "vitest";
import { sanitizeAnswers, sanitizeUiState, sanitizeHistory } from "./storage";

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
  it("randomDraw는 setId·ids가 유효할 때만 통과한다(새로고침 이어풀기용)", () => {
    expect(
      sanitizeUiState({ randomDraw: { setId: "S", chapter: null, ids: ["S-1", 2, "S-3"] } }).randomDraw,
    ).toEqual({ setId: "S", chapter: null, ids: ["S-1", "S-3"] });
    // chapter 문자열은 보존(미니 시험 스코프).
    expect(
      sanitizeUiState({ randomDraw: { setId: "S", chapter: "테스트 기법", ids: ["S-1"] } }).randomDraw,
    ).toEqual({ setId: "S", chapter: "테스트 기법", ids: ["S-1"] });
  });
  it("손상된 randomDraw(빈 ids·setId 없음·비객체)는 버린다", () => {
    expect(sanitizeUiState({ randomDraw: { setId: "S", ids: [] } }).randomDraw).toBeUndefined();
    expect(sanitizeUiState({ randomDraw: { ids: ["S-1"] } }).randomDraw).toBeUndefined();
    expect(sanitizeUiState({ randomDraw: "nope" }).randomDraw).toBeUndefined();
  });
});

describe("sanitizeHistory", () => {
  it("유효한 이력은 필드를 보존해 통과시킨다", () => {
    const h = sanitizeHistory({
      id: "h1", setId: "S", mode: "exam",
      answers: { "S-exam-1": ["a"] },
      correct: 7, total: 10, elapsedSeconds: 120, createdAt: 1700000000000,
      setTitle: "세트 A",
      wrongItems: [{ number: 3, myAnswer: ["b"], correctAnswer: ["a"] }],
    });
    expect(h).not.toBeNull();
    expect(h!.correct).toBe(7);
    expect(h!.wrongItems).toEqual([{ number: 3, myAnswer: ["b"], correctAnswer: ["a"] }]);
  });

  it("필수 필드(id/setId)가 없으면 null, 무효 mode는 'exam'으로 보정한다(데이터 보존)", () => {
    expect(sanitizeHistory(null)).toBeNull();
    expect(sanitizeHistory({ setId: "S", mode: "exam" })).toBeNull(); // id 없음
    expect(sanitizeHistory({ id: "h", mode: "exam" })).toBeNull(); // setId 없음
    // mode가 없거나 무효라도 실제 응시 기록(id·setId 유효)은 버리지 않는다.
    expect(sanitizeHistory({ id: "h", setId: "S" })?.mode).toBe("exam");
    expect(sanitizeHistory({ id: "h", setId: "S", mode: "evil" })?.mode).toBe("exam");
  });

  it("certification 필드는 유효 값만 통과한다(제품 스코프 필터용)", () => {
    expect(sanitizeHistory({ id: "h", setId: "S", mode: "exam", certification: "csts" })?.certification).toBe("csts");
    expect(sanitizeHistory({ id: "h", setId: "S", mode: "exam", certification: "hack" })?.certification).toBeUndefined();
  });

  it("손상된 wrongItems·비유한 숫자를 걸러 렌더 예외를 막는다", () => {
    const h = sanitizeHistory({
      id: "h2", setId: "S", mode: "random", answers: "junk",
      correct: NaN, total: "10",
      wrongItems: [null, "x", { number: "3" }, { number: 5, myAnswer: "b", correctAnswer: [1, "a"] }],
    });
    expect(h).not.toBeNull();
    expect(h!.answers).toEqual({});
    expect(h!.correct).toBeUndefined();
    expect(h!.total).toBeUndefined();
    // number가 유효한 항목만 남고, 배열 아닌 답안은 빈 배열로 정규화된다.
    expect(h!.wrongItems).toEqual([{ number: 5, myAnswer: [], correctAnswer: ["a"] }]);
  });
});
