import { describe, it, expect } from "vitest";
import { sanitizeAnswers, sanitizeUiState, sanitizeHistory } from "./storage";
import type { ExamHistory } from "../store/useQuizStore";

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
  it("폐지된 랜덤 모드는 연습으로 내려받는다(진입할 수 없는 모드로 복원하지 않는다)", () => {
    // 버리기만 하면 mode 필드가 없는 복원본이 되어, 메모리에 남아 있던 직전 모드가
    // 그대로 쓰인다 — 그 값은 진입 경로에 따라 달라져 복원 결과가 흔들린다.
    expect(sanitizeUiState({ mode: "random" }).mode).toBe("practice");
  });
  it("폐지된 randomDraw는 통과시키지 않는다", () => {
    expect(
      (sanitizeUiState({ randomDraw: { setId: "S", chapter: null, ids: ["S-1"] } }) as Record<string, unknown>).randomDraw,
    ).toBeUndefined();
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

// HISTORY_MODES에 'quick'이 빠지면 mode가 'exam'으로 보정돼, 10~20문항짜리 퀵 회차가
// 세트 전체 실전으로 집계되면서 최고 정답률·평균을 부풀린다.
describe('sanitizeHistory — 퀵 모드 보존', () => {
  it("mode 'quick'을 'exam'으로 바꾸지 않는다", () => {
    const h = sanitizeHistory({
      id: 'q1', setId: 'QUICK', mode: 'quick', answers: {}, correct: 7, total: 10,
    });
    expect(h?.mode).toBe('quick');
  });

  it('알 수 없는 모드는 여전히 exam으로 보정한다(구버전 기록 보존)', () => {
    expect(sanitizeHistory({ id: 'x', setId: 'A', mode: 'nonsense', answers: {} })?.mode).toBe('exam');
  });

  // 퀵 회차의 setId는 'QUICK'이라는 가짜 세트다 — 오답이 어느 세트에서 나왔는지는
  // wrongItems[].setId에만 남는다. 이걸 잃으면 오답노트가 전부 '퀵 랜덤' 한 덩어리로
  // 뭉치고, 세트가 달라 같은 번호가 여럿인 문항들이 서로를 덮어쓴다.
  // sanitizeHistory는 allowlist 재구축이라 목록에 없는 필드는 조용히 사라지는데,
  // loadHistoriesFromDB가 읽을 때마다 정제하므로 새로고침 한 번이면 그렇게 된다.
  it('wrongItems의 출처 세트(setId)를 보존한다', () => {
    const h = sanitizeHistory({
      id: 'q2', setId: 'QUICK', mode: 'quick', answers: {}, correct: 8, total: 10,
      wrongItems: [
        { number: 3, myAnswer: ['a'], correctAnswer: ['b'], setId: 'ISTQB-FL-V4-A' },
        { number: 3, myAnswer: ['c'], correctAnswer: ['d'], setId: 'ISTQB-FL-V4-B' },
      ],
    });
    expect(h!.wrongItems).toEqual([
      { number: 3, myAnswer: ['a'], correctAnswer: ['b'], setId: 'ISTQB-FL-V4-A' },
      { number: 3, myAnswer: ['c'], correctAnswer: ['d'], setId: 'ISTQB-FL-V4-B' },
    ]);
  });

  // 일반 회차(시험·랜덤)는 출처가 회차의 setId 하나뿐이라 항목에 setId가 없다.
  // 없는 걸 빈 문자열 등으로 채우면 AppModals의 `it.setId ?? h.setId` 폴백이 깨진다.
  it('출처 세트가 없는 항목에는 setId를 만들어 붙이지 않는다', () => {
    const h = sanitizeHistory({
      id: 'e1', setId: 'ISTQB-FL-V4-A', mode: 'exam', answers: {},
      wrongItems: [{ number: 1, myAnswer: ['a'], correctAnswer: ['b'] }],
    });
    expect(h!.wrongItems![0]).not.toHaveProperty('setId');
  });

  // CSTS 회차의 표시 %는 채점 시점 가중 점수 스냅샷을 쓴다(attemptStats:71, chapterStats:160).
  // 이 필드를 정제가 흘리면 새로고침 후 통계가 단순 정답률로 떨어져, 결과 모달의 합격
  // 판정과 통계의 %가 어긋난다 — 예전에 고친 "결과 모달만 가중, 통계는 단순"과 같은 결함이
  // 저장 계층에서 되살아나는 셈이다.
  it('CSTS 가중 점수 스냅샷(cstsWeighted)을 보존한다', () => {
    const h = sanitizeHistory({
      id: 'c1', setId: 'CSTS-EL-2018', mode: 'exam', answers: {},
      correct: 30, total: 40, cstsWeighted: { score: 42, maxScore: 55 },
    });
    expect(h!.cstsWeighted).toEqual({ score: 42, maxScore: 55 });
  });

  it('손상된 가중 점수는 버린다(음수·비유한·maxScore 0)', () => {
    const bad = (cstsWeighted: unknown) =>
      sanitizeHistory({ id: 'c', setId: 'S', mode: 'exam', answers: {}, cstsWeighted })?.cstsWeighted;
    expect(bad({ score: NaN, maxScore: 10 })).toBeUndefined();
    expect(bad({ score: -1, maxScore: 10 })).toBeUndefined();
    expect(bad({ score: 5, maxScore: 0 })).toBeUndefined();   // 0으로 나누면 NaN%가 화면에 뜬다
    expect(bad({ score: 5 })).toBeUndefined();
    expect(bad('oops')).toBeUndefined();
    // correct/total과 같은 규칙 — 얻은 점수는 만점을 넘지 못한다(손상 백업의 300% 차단).
    expect(bad({ score: 99, maxScore: 10 })).toEqual({ score: 10, maxScore: 10 });
  });

  it('문자열이 아닌 setId는 버린다(조작 백업 방어)', () => {
    const h = sanitizeHistory({
      id: 'e2', setId: 'A', mode: 'quick', answers: {},
      wrongItems: [{ number: 1, myAnswer: [], correctAnswer: [], setId: 42 }],
    });
    expect(h!.wrongItems![0]).not.toHaveProperty('setId');
  });
});

describe('sanitizeUiState — quickDraw', () => {
  it('제품과 (문항 id, 출처 세트)가 온전하면 통과한다', () => {
    const ui = sanitizeUiState({
      quickDraw: { certification: 'csts', items: [{ id: 'Q1', setId: 'S1' }] },
    });
    expect(ui.quickDraw).toEqual({ certification: 'csts', items: [{ id: 'Q1', setId: 'S1' }] });
  });

  // 출처 세트가 없으면 오답 귀속도 복원도 성립하지 않는다 — 조용히 통과시키면
  // 채점 때 오답이 어느 세트로도 가지 못하고 사라진다.
  it('출처 세트가 없는 항목은 버린다', () => {
    const ui = sanitizeUiState({
      quickDraw: { certification: 'csts', items: [{ id: 'Q1' }, { id: 'Q2', setId: 'S2' }] },
    });
    expect(ui.quickDraw?.items).toEqual([{ id: 'Q2', setId: 'S2' }]);
  });

  it('남는 항목이 없거나 제품이 없으면 통째로 버린다', () => {
    expect(sanitizeUiState({ quickDraw: { certification: 'csts', items: [{ id: 'Q1' }] } }).quickDraw).toBeUndefined();
    expect(sanitizeUiState({ quickDraw: { items: [{ id: 'Q1', setId: 'S1' }] } }).quickDraw).toBeUndefined();
    expect(sanitizeUiState({ quickDraw: 'oops' }).quickDraw).toBeUndefined();
  });
});

// ── 결함 클래스 가드 ────────────────────────────────────────────────────────
// sanitizeHistory는 allowlist 재구축이고 loadHistoriesFromDB가 읽을 때마다 통과시키므로,
// 목록에 빠진 필드는 "채점 직후엔 맞다가 새로고침하면 사라지는" 형태로 조용히 새어 나간다.
// 실제로 두 번 났다 — wrongItems[].setId(오답노트가 '퀵 랜덤' 한 덩어리로 뭉침)와
// cstsWeighted(통계 %가 결과 모달의 합격 판정과 어긋남).
//
// 그래서 개별 필드 테스트가 아니라 클래스를 막는다: 아래 fixture는 Required<ExamHistory>라
// 인터페이스에 필드가 하나 추가되면 타입 검사가 먼저 깨져 여기를 고치게 되고, 채우고 나면
// 왕복 동등성이 정제 누락을 잡는다.
describe('sanitizeHistory — 필드 유실 가드(전 필드 왕복)', () => {
  it('저장되는 모든 필드가 정제를 통과해 그대로 돌아온다', () => {
    const full: Required<ExamHistory> = {
      id: 'h-full',
      setId: 'CSTS-EL-2018',
      mode: 'quick',
      certification: 'csts',
      answers: { 'QUICK-quick-CSTS-EL-2018-003': ['b'] },
      correct: 8,
      total: 10,
      elapsedSeconds: 421,
      createdAt: 1_770_000_000_000,
      setTitle: 'CSTS 실전 2018',
      wrongItems: [
        { number: 3, myAnswer: ['a'], correctAnswer: ['b'], setId: 'CSTS-EL-2018' },
        { number: 7, myAnswer: ['c'], correctAnswer: ['d'], setId: 'CSTS-EL-2019' },
      ],
      chapterStats: { 테스트설계: { c: 4, t: 6 } },
      chapterQuestions: { 테스트설계: { ok: ['Q1', 'Q2'], no: ['Q3'] } },
      cstsWeighted: { score: 11.5, maxScore: 14 },
      chapter: '테스트설계',
    };
    expect(sanitizeHistory(full)).toEqual(full);
  });
});
