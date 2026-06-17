import { describe, it, expect, beforeEach } from "vitest";
import { useQuizStore } from "./useQuizStore";

// #75 채점 루프가 의존하는 store 액션 검증 (#76 — store 로직 유닛 테스트).
function reset() {
  useQuizStore.setState({
    answers: {}, histories: {}, reviewIds: {}, graded: {},
    mode: "exam", setId: "S", index: 0, elapsedSeconds: 0, lastTick: null,
  });
}

describe("useQuizStore 채점 관련 액션", () => {
  beforeEach(reset);

  it("setGraded는 키별 채점 상태를 설정한다", () => {
    useQuizStore.getState().setGraded("S-exam", true);
    expect(useQuizStore.getState().graded["S-exam"]).toBe(true);
  });

  it("addHistory는 id로 기록을 추가한다", () => {
    useQuizStore.getState().addHistory({ id: "1", setId: "S", mode: "exam", answers: { "S-exam-1": ["a"] } });
    expect(useQuizStore.getState().histories["1"].setId).toBe("S");
  });

  it("addHistory는 채점 요약 메타(정답수·소요시간)를 함께 저장한다", () => {
    useQuizStore.getState().addHistory({
      id: "2", setId: "S", mode: "exam", answers: {},
      correct: 7, total: 10, elapsedSeconds: 123, createdAt: 1700000000000,
    });
    const h = useQuizStore.getState().histories["2"];
    expect(h.correct).toBe(7);
    expect(h.total).toBe(10);
    expect(h.elapsedSeconds).toBe(123);
  });

  it("clearHistories는 모든 이력을 비운다", () => {
    useQuizStore.getState().addHistory({ id: "a", setId: "S", mode: "exam", answers: {} });
    useQuizStore.getState().addHistory({ id: "b", setId: "T", mode: "random", answers: {} });
    expect(Object.keys(useQuizStore.getState().histories)).toHaveLength(2);
    useQuizStore.getState().clearHistories();
    expect(useQuizStore.getState().histories).toEqual({});
  });

  it("setReviewIds는 세트별 오답 id를 저장한다", () => {
    useQuizStore.getState().setReviewIds("S", ["S-2", "S-3"]);
    expect(useQuizStore.getState().reviewIds["S"]).toEqual(["S-2", "S-3"]);
  });

  it("clearAnswers는 해당 세트/모드 답안을 지우고 채점 상태를 초기화한다", () => {
    useQuizStore.setState({
      answers: { "S-exam-1": ["a"], "S-exam-2": ["b"], "T-exam-1": ["c"] },
      graded: { "S-exam": true },
    });
    useQuizStore.getState().clearAnswers("S", "exam");
    const st = useQuizStore.getState();
    expect(st.answers["S-exam-1"]).toBeUndefined();
    expect(st.answers["T-exam-1"]).toEqual(["c"]); // 다른 세트는 보존
    expect(st.graded["S-exam"]).toBe(false);
  });

  it("tickTimer는 lastTick이 있을 때만 경과시간을 누적한다", () => {
    useQuizStore.setState({ elapsedSeconds: 0, lastTick: null });
    useQuizStore.getState().tickTimer();
    expect(useQuizStore.getState().elapsedSeconds).toBe(0);
    useQuizStore.setState({ lastTick: Date.now() - 2000 });
    useQuizStore.getState().tickTimer();
    expect(useQuizStore.getState().elapsedSeconds).toBeGreaterThanOrEqual(1.5);
  });
});
