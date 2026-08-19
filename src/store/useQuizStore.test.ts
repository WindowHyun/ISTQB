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

// 불변식: mode === 'quick' ⇒ setId === QUICK_SET_ID.
//
// 답안·채점 키가 `${setId}-${mode}-...`라, 퀵에서 setId가 실재 세트로 남으면 퀵 답안이
// 그 세트의 네임스페이스에 쌓인다. 그러면 startQuick의 잔재 정리(QUICK-quick-* 삭제)가
// 통째로 빗나가 위 describe의 보장이 그 경로에서만 조용히 무너진다.
// 종전에는 startQuick만 이 못을 박았고, 모드 세그먼트(setMode)로 들어온 퀵은 직전 세트
// id를 그대로 달고 있었다 — 사이드바 제목이 풀지도 않는 세트명을 말한 것도 같은 원인이다.
describe('퀵의 setId 불변식', () => {
  beforeEach(reset);

  it('setMode로 퀵에 들어가도 setId가 센티넬로 바뀐다', () => {
    useQuizStore.setState({ mode: 'practice', setId: 'CSTS-2402FL' });
    useQuizStore.getState().setMode('quick');
    expect(useQuizStore.getState().setId).toBe('QUICK');
  });

  it('퀵에서 나오면 들어가기 직전 세트로 돌아간다', () => {
    useQuizStore.setState({ mode: 'practice', setId: 'CSTS-2402FL', preQuickSetId: null });
    useQuizStore.getState().setMode('quick');
    useQuizStore.getState().setMode('exam');
    const s = useQuizStore.getState();
    expect(s.setId).toBe('CSTS-2402FL');
    // 돌아왔으면 기억은 비운다 — 남겨 두면 다음 이탈이 옛 세트로 되돌린다.
    expect(s.preQuickSetId).toBeNull();
  });

  it("퀵 안에서 '다시 섞어 시작'을 눌러도 돌아갈 세트를 잊지 않는다", () => {
    useQuizStore.setState({ mode: 'practice', setId: 'CSTS-2402FL', preQuickSetId: null });
    useQuizStore.getState().setMode('quick');
    useQuizStore.getState().startQuick(10); // setId가 이미 센티넬 — 기억을 덮어쓰면 안 된다
    expect(useQuizStore.getState().preQuickSetId).toBe('CSTS-2402FL');
    useQuizStore.getState().setMode('practice');
    expect(useQuizStore.getState().setId).toBe('CSTS-2402FL');
  });

  it('복원(hydrate)이 mode·setId 조합을 깨뜨려도 불변식이 선다', () => {
    // 저장소는 mode와 setId를 각각 담으므로, 이 규칙이 서기 전에 퀵으로 종료한 세션은
    // 실재 세트 id를 달고 돌아온다.
    useQuizStore.getState().hydrate({ mode: 'quick', setId: 'CSTS-2402FL' });
    expect(useQuizStore.getState().setId).toBe('QUICK');
  });

  it('퀵이 아닌 모드의 복원은 저장된 세트를 그대로 쓴다', () => {
    useQuizStore.getState().hydrate({ mode: 'exam', setId: 'CSTS-2402FL' });
    expect(useQuizStore.getState().setId).toBe('CSTS-2402FL');
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
    quickGraded: { 'QUICK-quick-Q1': true, 'OTHER-quick-Q9': true },
    reviewIds: {
      'A-exam': ['1', '2'],
      'A-random#테스트 기초': ['m1'],   // 챕터 미니 회차 키 — base로 되돌려 지워야 한다
      'QUICK-quick': ['Q1'],
      'B-exam': ['9'],
      'B-random#테스트 기초': ['keep'], // 다른 세트의 미니 키 — 남아야 한다
    },
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
    // 챕터 미니 회차 키(`#챕터`)도 함께 — base 키만 지우면 미니 오답이 유령으로 남는다.
    expect(s.reviewIds['A-random#테스트 기초']).toBeUndefined();
    // 답안만 지우고 퀵 채점 표시를 남기면, 그 문항이 선택은 빈 채로 '오답'이 펼쳐지고
    // 보기가 잠겨 다시 풀 수 없다(점수판은 0으로 돌아가 화면 안에서 값이 어긋난다).
    expect(s.quickGraded['QUICK-quick-Q1']).toBeUndefined();
  });

  it('목록에 없는 세트는 손대지 않는다(다른 제품 기록 보호)', () => {
    seed();
    useQuizStore.getState().resetProgressForSets(['A', 'QUICK']);
    const s = useQuizStore.getState();
    expect(s.answers['B-exam-1']).toEqual(['keep']);
    expect(s.graded['B-exam']).toBe(true);
    expect(s.reviewIds['B-exam']).toEqual(['9']);
    expect(s.reviewIds['B-random#테스트 기초']).toEqual(['keep']);
    expect(s.reviewedOk.B).toEqual([3]);
    expect(s.examStartedAt.B).toBe(222);
    // 다른 네임스페이스의 퀵 채점 표시는 남는다(답안과 같은 접두 규칙).
    expect(s.quickGraded['OTHER-quick-Q9']).toBe(true);
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

/**
 * 답안을 지울 때 퀵의 문항별 채점 표시(quickGraded)도 같은 범위로 지운다.
 *
 * 퀵의 정답 공개·잠금은 quickGraded 하나로 판정한다(QuestionCard). 답안만 지우면 그 문항은
 * 선택이 빈 채로 "❌ 오답입니다"가 펼쳐지고 보기·입력이 disabled로 굳어 **다시 풀 수 없다.**
 * 반면 점수판(computeQuickStats)은 확정된 답이 있어야 세므로 0으로 돌아간다 — 같은 화면
 * 안에서 문항 상태와 숫자가 어긋난다. 탈출구는 '다시 섞어 시작'뿐이었다.
 *
 * startQuick은 처음부터 둘을 함께 비웠는데 초기화 경로만 규칙이 갈려 있었다.
 */
describe('clearAnswers — 퀵 채점 표시도 같은 범위로 비운다', () => {
  beforeEach(reset);

  it('지운 답안과 같은 접두의 quickGraded를 함께 지운다', () => {
    useQuizStore.setState({
      answers: { 'QUICK-quick-Q1': ['a'], 'QUICK-quick-Q2': ['b'], 'A-exam-Q1': ['c'] },
      quickGraded: { 'QUICK-quick-Q1': true, 'QUICK-quick-Q2': true },
    });
    useQuizStore.getState().clearAnswers('QUICK', 'quick');
    const s = useQuizStore.getState();
    expect(s.answers).toEqual({ 'A-exam-Q1': ['c'] });
    expect(s.quickGraded).toEqual({});
  });

  it('다른 네임스페이스의 채점 표시는 남긴다', () => {
    useQuizStore.setState({
      answers: { 'A-exam-Q1': ['a'] },
      quickGraded: { 'QUICK-quick-Q1': true },
    });
    useQuizStore.getState().clearAnswers('A', 'exam');
    expect(useQuizStore.getState().quickGraded).toEqual({ 'QUICK-quick-Q1': true });
  });
});

/**
 * 오답 대상 비우기 — 챕터 미니 회차 키까지.
 *
 * setReviewIds(gradeKey, [])는 base 키 하나만 비운다. 미니 회차는 `#챕터`가 붙은 별도
 * 키라(answerKey.reviewKeyFor) 그대로 남아, '현재 모드 답안 초기화' 뒤에도 오답 모드가
 * 지워진 회차의 문항을 계속 출제했다.
 */
describe('clearReviewTargets — 세트·모드의 오답 대상 전부', () => {
  beforeEach(reset);

  it('base 키와 챕터 키를 함께 비우고, 다른 모드·세트는 남긴다', () => {
    useQuizStore.setState({
      reviewIds: {
        'A-random': ['r1'],
        'A-random#테스트 기초': ['m1'],
        'A-random#정적 테스팅': ['m2'],
        'A-exam': ['e1'],
        'AB-random': ['other'],
      },
    });
    useQuizStore.getState().clearReviewTargets('A', 'random');
    expect(useQuizStore.getState().reviewIds).toEqual({
      'A-exam': ['e1'],
      'AB-random': ['other'],
    });
  });

  it('지울 것이 없으면 상태 참조를 바꾸지 않는다(불필요한 저장·리렌더 방지)', () => {
    useQuizStore.setState({ reviewIds: { 'A-exam': ['e1'] } });
    const before = useQuizStore.getState().reviewIds;
    useQuizStore.getState().clearReviewTargets('A', 'random');
    expect(useQuizStore.getState().reviewIds).toBe(before);
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
