import { describe, it, expect, beforeEach } from "vitest";
import { useQuizStore, freshQuickRounds, QUICK_ROUND_TTL_MS, ExamHistory } from "./useQuizStore";

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
  it("commitSetChange는 세트 교체와 새 세션 개시를 함께 처리한다", () => {
    useQuizStore.setState({
      mode: "practice", setId: "A", index: 7, elapsedSeconds: 120,
      chapterFilter: "테스트 기법", drawerOpen: true, pendingSetChange: "B",
    });
    useQuizStore.getState().commitSetChange("B");
    const st = useQuizStore.getState();
    expect(st.setId).toBe("B");
    expect(st.index).toBe(0);
    expect(st.elapsedSeconds).toBe(0);
    expect(st.chapterFilter).toBeNull();
    expect(st.drawerOpen).toBe(false);
    expect(st.pendingSetChange).toBeNull(); // 보류 해제
  });

  it("commitSetChange는 랜덤 모드에서 바꾼 세트의 답안을 비운다(이어풀기 없음, F4)", () => {
    useQuizStore.setState({
      mode: "random", setId: "A",
      answers: { "A-random-q1": ["a"], "B-random-q9": ["c"], "B-exam-q1": ["b"] },
      graded: { "B-random": true },
      pendingSetChange: "B",
    });
    useQuizStore.getState().commitSetChange("B");
    const st = useQuizStore.getState();
    expect(st.answers["B-random-q9"]).toBeUndefined(); // 바꾼 세트의 랜덤 답안은 초기화
    expect(st.answers["B-exam-q1"]).toEqual(["b"]);    // 다른 모드는 건드리지 않는다
    expect(st.graded["B-random"]).toBe(false);
    expect(st.resumePrompt).toBe(false);               // 랜덤은 이어풀기를 묻지 않는다
  });

  it("commitSetChange는 시험 모드에서 이전 답안이 있으면 이어풀기를 묻는다", () => {
    useQuizStore.setState({
      mode: "exam", setId: "A", resumePrompt: false,
      answers: { "B-exam-q1": ["a"] },
    });
    useQuizStore.getState().commitSetChange("B");
    expect(useQuizStore.getState().resumePrompt).toBe(true);
  });

  it("commitSetChange는 시험 모드라도 이전 답안이 없으면 묻지 않는다", () => {
    useQuizStore.setState({ mode: "exam", setId: "A", resumePrompt: false, answers: {} });
    useQuizStore.getState().commitSetChange("B");
    expect(useQuizStore.getState().resumePrompt).toBe(false);
  });
  it("시험 시작 시각은 세트별로 기록되고 재응시 시 초기화된다", () => {
    // 제한시간의 기준점 — 경과 누계만 쓰면 앱을 껐다 켠 시간이 빠져 제한이 무력화된다.
    useQuizStore.setState({ examStartedAt: {}, answers: {}, graded: {}, examStarted: {} });
    useQuizStore.getState().setExamStartedAt("A", 1_700_000_000_000);
    useQuizStore.getState().setExamStartedAt("B", 1_700_000_111_000);
    expect(useQuizStore.getState().examStartedAt).toEqual({ A: 1_700_000_000_000, B: 1_700_000_111_000 });

    // 재응시(답안 초기화)는 그 세트의 기준점만 비운다 — 다음 '시험 시작'이 새로 찍는다.
    useQuizStore.getState().clearAnswers("A", "exam");
    expect(useQuizStore.getState().examStartedAt).toEqual({ B: 1_700_000_111_000 });

    // 명시적 해제도 가능.
    useQuizStore.getState().setExamStartedAt("B", null);
    expect(useQuizStore.getState().examStartedAt).toEqual({});
  });

  it("랜덤 모드 초기화는 시험 기준점을 건드리지 않는다", () => {
    useQuizStore.setState({ examStartedAt: { A: 111 }, answers: {}, graded: {} });
    useQuizStore.getState().clearAnswers("A", "random");
    expect(useQuizStore.getState().examStartedAt).toEqual({ A: 111 });
  });
});

// 퀵의 setId·mode는 항상 같아서 채점 키(QUICK-quick)도 늘 같다. 이전 회차의 채점 상태를
// 비우지 않으면 두 번째 세션이 '이미 채점됨'으로 시작해 보기가 잠기고 채점 버튼도 안 뜬다.
// (유저 관점 전수 시나리오에서 실제로 두 번째 퀵의 보기 클릭이 먹지 않아 발견됐다)
describe('startQuick — 이전 회차 잔재 정리', () => {
  it('이전 퀵의 채점 상태를 해제한다', () => {
    useQuizStore.setState({ graded: { 'QUICK-quick': true, 'A-exam': true } });
    useQuizStore.getState().startQuick(10);
    expect(useQuizStore.getState().graded['QUICK-quick']).toBe(false);
    // 다른 세트·모드의 채점 상태는 건드리지 않는다.
    expect(useQuizStore.getState().graded['A-exam']).toBe(true);
  });

  it('이전 퀵의 답안만 지운다 — 재수록 문항이 다시 뽑혀도 옛 답이 남지 않는다', () => {
    useQuizStore.setState({
      answers: {
        'QUICK-quick-Q1': ['a'],
        'QUICK-quick-Q2': ['b'],
        'A-exam-Q1': ['c'],
      },
    });
    useQuizStore.getState().startQuick(15);
    expect(useQuizStore.getState().answers).toEqual({ 'A-exam-Q1': ['c'] });
  });

  it('추첨을 비우고 문항 수를 반영하며 재추첨 신호를 올린다', () => {
    useQuizStore.setState({
      quickDraw: { certification: 'csts', items: [{ id: 'X', setId: 'S' }] },
      quickNonce: 3,
      index: 7,
    });
    useQuizStore.getState().startQuick(20);
    const s = useQuizStore.getState();
    expect(s.quickDraw).toBeNull();
    expect(s.quickSize).toBe(20);
    expect(s.quickNonce).toBe(4);
    expect(s.index).toBe(0);
    expect(s.mode).toBe('quick');
    expect(s.setId).toBe('QUICK');
  });
});

// 이력만 지우고 답안·채점 상태·오답 대상을 남기면, 오답노트에는 없는 오답이 오답 모드에
// 계속 출제되고 그 세트를 다시 채점하면 같은 기록이 되살아난다("초기화했는데 이전 기록이
// 재생성됨"). 실제로 '이력 비우기'가 그 상태였다.
describe('resetProgressForSets — 이력 삭제와 짝이 되는 상태 정리', () => {
  const seed = () => useQuizStore.setState({
    answers: {
      'A-exam-1': ['a'], 'A-practice-2': ['b'], 'A-review-3': ['c'],
      'QUICK-quick-Q1': ['d'],
      'B-exam-1': ['keep'],           // 다른 제품 세트 — 건드리면 안 된다
    },
    graded: { 'A-exam': true, 'QUICK-quick': true, 'B-exam': true },
    reviewIds: { 'A-exam': ['1', '2'], 'QUICK-quick': ['Q1'], 'B-exam': ['9'] },
    reviewedOk: { A: [1, 2], B: [3] },
    examStarted: { A: true, B: true },
    examStartedAt: { A: 111, B: 222 },
  });

  it('지정한 세트의 답안·채점·오답 대상·재풀이 진척을 한 번에 비운다', () => {
    seed();
    useQuizStore.getState().resetProgressForSets(['A', 'QUICK']);
    const s = useQuizStore.getState();
    expect(Object.keys(s.answers)).toEqual(['B-exam-1']);
    expect(s.graded['A-exam']).toBeUndefined();
    expect(s.graded['QUICK-quick']).toBeUndefined();
    // 남기면 삭제한 회차의 오답이 오답 모드에 유령처럼 출제된다.
    expect(s.reviewIds['A-exam']).toBeUndefined();
    expect(s.reviewIds['QUICK-quick']).toBeUndefined();
    expect(s.reviewedOk.A).toBeUndefined();
    expect(s.examStarted.A).toBeUndefined();
    expect(s.examStartedAt.A).toBeUndefined();
  });

  it('목록에 없는 세트는 손대지 않는다(다른 제품 기록 보호)', () => {
    seed();
    useQuizStore.getState().resetProgressForSets(['A', 'QUICK']);
    const s = useQuizStore.getState();
    expect(s.answers['B-exam-1']).toEqual(['keep']);
    expect(s.graded['B-exam']).toBe(true);
    expect(s.reviewIds['B-exam']).toEqual(['9']);
    expect(s.reviewedOk.B).toEqual([3]);
    expect(s.examStartedAt.B).toBe(222);
  });

  // 접두 일치로 지우면 이름이 겹치는 다른 세트까지 함께 날아간다.
  it('이름이 접두로 겹치는 세트를 함께 지우지 않는다', () => {
    useQuizStore.setState({
      answers: { 'A-exam-1': ['x'], 'A-B-exam-1': ['y'] },
      graded: { 'A-exam': true, 'A-B-exam': true },
      reviewIds: {}, reviewedOk: {}, examStarted: {}, examStartedAt: {},
    });
    useQuizStore.getState().resetProgressForSets(['A']);
    const s = useQuizStore.getState();
    expect(s.answers['A-exam-1']).toBeUndefined();
    expect(s.answers['A-B-exam-1']).toEqual(['y']);
    expect(s.graded['A-B-exam']).toBe(true);
  });

  it('빈 목록이면 상태를 바꾸지 않는다', () => {
    seed();
    const before = useQuizStore.getState().answers;
    useQuizStore.getState().resetProgressForSets([]);
    expect(useQuizStore.getState().answers).toBe(before);
  });
});

// 퀵 회차는 이력(histories)이 아니라 별도 보관이라, 만료·삭제 규칙이 이력과 다르다.
// 이 규칙이 깨지면 "기록을 남기지 않는다"는 약속이나 "이력 비우기"가 조용히 무력화된다.
describe('퀵 임시 회차(quickRounds)', () => {
  const round = (id: string, cert: ExamHistory['certification'], createdAt: number): ExamHistory => ({
    id, setId: 'QUICK', mode: 'quick', answers: {}, certification: cert, createdAt,
  });

  beforeEach(() => {
    useQuizStore.setState({ quickRounds: [] });
  });

  it('freshQuickRounds는 24시간이 지난 회차를 버린다', () => {
    const now = 1_700_000_000_000;
    const kept = round('new', 'istqb', now - QUICK_ROUND_TTL_MS + 1_000);
    const gone = round('old', 'istqb', now - QUICK_ROUND_TTL_MS - 1_000);
    expect(freshQuickRounds([kept, gone], now).map((r) => r.id)).toEqual(['new']);
  });

  it('createdAt이 없는 회차는 즉시 만료로 본다(무기한 잔존 방지)', () => {
    expect(freshQuickRounds([round('x', 'istqb', undefined as unknown as number)], 1_700_000_000_000)).toEqual([]);
  });

  it('addQuickRound는 넣으면서 만료분을 함께 버린다', () => {
    useQuizStore.setState({ quickRounds: [round('old', 'istqb', 0)] });
    useQuizStore.getState().addQuickRound(round('new', 'istqb', Date.now()));
    expect(useQuizStore.getState().quickRounds.map((r) => r.id)).toEqual(['new']);
  });

  it('clearQuickRounds는 해당 자격증 회차만 지운다', () => {
    const now = Date.now();
    useQuizStore.setState({
      quickRounds: [round('i', 'istqb', now), round('c', 'csts', now)],
    });
    useQuizStore.getState().clearQuickRounds('istqb');
    expect(useQuizStore.getState().quickRounds.map((r) => r.id)).toEqual(['c']);
  });

  // 자격증을 모르는 회차를 남기면 어느 제품의 '이력 비우기'로도 지워지지 않는다.
  it('clearQuickRounds는 자격증 미상 회차도 함께 지운다', () => {
    const now = Date.now();
    useQuizStore.setState({
      quickRounds: [round('legacy', undefined, now), round('c', 'csts', now)],
    });
    useQuizStore.getState().clearQuickRounds('istqb');
    expect(useQuizStore.getState().quickRounds.map((r) => r.id)).toEqual(['c']);
  });

  it('clearQuickRounds()에 자격증을 주지 않으면 전부 지운다', () => {
    const now = Date.now();
    useQuizStore.setState({ quickRounds: [round('i', 'istqb', now), round('c', 'csts', now)] });
    useQuizStore.getState().clearQuickRounds();
    expect(useQuizStore.getState().quickRounds).toEqual([]);
  });
});
