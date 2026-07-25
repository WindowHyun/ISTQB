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

  it("removeHistories는 지정한 id의 이력만 지운다(제품별 이력 비우기)", () => {
    useQuizStore.getState().addHistory({ id: "a", setId: "S", mode: "exam", answers: {} });
    useQuizStore.getState().addHistory({ id: "b", setId: "T", mode: "random", answers: {} });
    useQuizStore.getState().removeHistories(["a"]);
    const h = useQuizStore.getState().histories;
    expect(h["a"]).toBeUndefined();
    expect(h["b"]).toBeDefined();
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

describe("useQuizStore 세션/네비/타이머 액션", () => {
  beforeEach(reset);

  it("setAnswer는 기존 답안을 보존하며 키를 추가·갱신한다", () => {
    useQuizStore.getState().setAnswer("S-exam-1", ["a"]);
    useQuizStore.getState().setAnswer("S-exam-2", ["b"]);
    useQuizStore.getState().setAnswer("S-exam-1", ["c"]); // 갱신
    const a = useQuizStore.getState().answers;
    expect(a["S-exam-1"]).toEqual(["c"]);
    expect(a["S-exam-2"]).toEqual(["b"]);
  });

  it("setIndex는 값·함수형 둘 다 지원한다", () => {
    useQuizStore.getState().setIndex(5);
    expect(useQuizStore.getState().index).toBe(5);
    useQuizStore.getState().setIndex((i) => i + 2);
    expect(useQuizStore.getState().index).toBe(7);
  });

  it("clearAnswers는 유사 접두 세트id(S vs S-1)를 오삭제하지 않는다", () => {
    useQuizStore.setState({ answers: { "S-exam-1": ["a"], "S-1-exam-1": ["b"] } });
    useQuizStore.getState().clearAnswers("S", "exam");
    const a = useQuizStore.getState().answers;
    expect(a["S-exam-1"]).toBeUndefined();
    expect(a["S-1-exam-1"]).toEqual(["b"]); // "S-1" 세트는 보존
  });

  it("startTimer/resetTimer는 기준 시각과 경과를 관리한다", () => {
    useQuizStore.getState().startTimer();
    const st = useQuizStore.getState();
    expect(st.startedAt).not.toBeNull();
    expect(st.lastTick).not.toBeNull();
    useQuizStore.setState({ elapsedSeconds: 42 });
    useQuizStore.getState().resetTimer();
    expect(useQuizStore.getState().elapsedSeconds).toBe(0);
  });

  it("resetToGate는 게이트로 되돌리고 모든 오버레이를 닫는다", () => {
    useQuizStore.setState({
      mode: "exam", activeProduct: "istqb",
      settingsOpen: true, statsOpen: true, wrongNoteOpen: true, resultOpen: true,
      paletteOpen: true, confirmGradeOpen: true, drawerOpen: true,
      resumeNotice: true, resumePrompt: true,
    });
    useQuizStore.getState().resetToGate();
    const st = useQuizStore.getState();
    expect(st.mode).toBe("home");
    expect(st.activeProduct).toBeNull();
    for (const k of [
      "settingsOpen", "statsOpen", "wrongNoteOpen", "resultOpen",
      "paletteOpen", "confirmGradeOpen", "drawerOpen", "resumeNotice", "resumePrompt",
    ] as const) expect(st[k]).toBe(false);
  });

  it("setMode는 모드가 바뀔 때만 챕터 필터를 해제한다(같은 모드 재확정은 보존)", () => {
    // 복원 직후 App이 저장된 모드를 그대로 재확정하는 경로에서 필터가 지워지면
    // 미니 시험(랜덤+챕터) 복원이 무효화된다.
    useQuizStore.setState({ mode: "random", chapterFilter: "테스트 기법" });
    useQuizStore.getState().setMode("random"); // 같은 모드 재확정
    expect(useQuizStore.getState().chapterFilter).toBe("테스트 기법");

    useQuizStore.getState().setMode("practice"); // 실제 모드 전환
    expect(useQuizStore.getState().chapterFilter).toBeNull();
  });

  it("hydrate는 부분 상태를 병합하고 나머지는 보존한다", () => {
    useQuizStore.setState({ setId: "S", index: 3 });
    useQuizStore.getState().hydrate({ index: 9, elapsedSeconds: 100 });
    const st = useQuizStore.getState();
    expect(st.index).toBe(9);
    expect(st.elapsedSeconds).toBe(100);
    expect(st.setId).toBe("S"); // 미지정 필드 보존
  });
});
