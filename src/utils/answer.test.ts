import { describe, it, expect } from "vitest";
import { isAnswerCorrect, isQuestionCorrect, isAnswered, shortAnswerCandidates } from "./answer";

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

  const parts = [
    { label: "동등 분할", answer: ["4", "4개"] },
    { label: "경계값 분석", answer: ["7", "7개"] },
  ];
  it("다답형: 모든 칸이 각 파트 정답과 일치해야 정답", () => {
    expect(isQuestionCorrect([], ["4", "7"], "short_answer", parts)).toBe(true);
    expect(isQuestionCorrect([], ["4개", "7개"], "short_answer", parts)).toBe(true);
  });
  it("다답형: 반쪽만 맞으면 오답", () => {
    expect(isQuestionCorrect([], ["4", ""], "short_answer", parts)).toBe(false); // 두번째 미입력
    expect(isQuestionCorrect([], ["4", "9"], "short_answer", parts)).toBe(false); // 두번째 오답
    expect(isQuestionCorrect([], ["4"], "short_answer", parts)).toBe(false); // 칸 수 부족
    expect(isQuestionCorrect([], [], "short_answer", parts)).toBe(false); // 미입력
  });
  it("다답형: 칸 순서가 뒤바뀌면 오답(파트별 위치 고정)", () => {
    expect(isQuestionCorrect([], ["7", "4"], "short_answer", parts)).toBe(false);
  });
});

describe("isAnswered", () => {
  const parts = [
    { label: "동등 분할", answer: ["4"] },
    { label: "경계값 분석", answer: ["7"] },
  ];
  it("일반 문항은 선택이 하나라도 있으면 답함", () => {
    expect(isAnswered(["a"])).toBe(true);
    expect(isAnswered(["a", "b"])).toBe(true);
    expect(isAnswered([])).toBe(false);
  });
  it("다답형은 모든 칸이 채워져야 답함(부분 입력은 미응답)", () => {
    expect(isAnswered(["4", "7"], parts)).toBe(true);
    expect(isAnswered(["4", ""], parts)).toBe(false); // 반쪽
    expect(isAnswered(["4"], parts)).toBe(false); // 칸 부족
    expect(isAnswered([], parts)).toBe(false);
    expect(isAnswered([" ", "7"], parts)).toBe(false); // 공백만 입력은 미응답
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

// 서답형 허용답 전개 — 이 함수가 정하는 것은 "무엇을 정답으로 인정하는가"다.
// isQuestionCorrect를 통해서만 보면 후보가 하나 더 늘어도 기존 검사는 전부 통과한다:
// 맞던 입력은 여전히 맞기 때문이다(뮤테이션에서 엉뚱한 후보를 끼워 넣는 변이가 살아남았다).
// 그래서 전개 결과를 그대로 고정한다 — 과다 인정은 오답을 정답으로 세는 방향의 결함이다.
describe("shortAnswerCandidates — 허용답 전개 고정", () => {
  it("괄호 병기는 원문·본문·괄호안을 모두 후보로 낸다", () => {
    expect(shortAnswerCandidates(["로그(Log)"])).toEqual(["로그(Log)", "로그(Log)", "로그", "Log"]);
  });

  it("콤마로 묶인 동의어를 개별 후보로 펼친다", () => {
    expect(shortAnswerCandidates(["동등 분할(클래스), 동치 분할"])).toEqual([
      "동등 분할(클래스), 동치 분할", "동등 분할(클래스)", "동등 분할", "클래스", "동치 분할", "동치 분할",
    ]);
  });

  it("공백을 낀 슬래시·'또는'으로 나눈다", () => {
    expect(shortAnswerCandidates(["재테스팅 / retesting / 재테스트"])).toEqual([
      "재테스팅 / retesting / 재테스트", "재테스팅", "재테스팅", "retesting", "retesting", "재테스트", "재테스트",
    ]);
    expect(shortAnswerCandidates(["가 또는 나"])).toEqual(["가 또는 나", "가", "가", "나", "나"]);
  });

  // 용어 내부의 슬래시("조건/결정")까지 쪼개면 "조건"만 써도 정답이 된다 — 과다 인정.
  it("공백 없는 슬래시는 용어 내부 구분이므로 나누지 않는다", () => {
    expect(shortAnswerCandidates(["조건/결정"])).toEqual(["조건/결정", "조건/결정", "조건/결정"]);
  });

  // 빈 조각이 후보로 새면 빈 입력이 정답이 될 수 있다.
  it("빈 조각과 괄호만 남는 조각을 후보로 내지 않는다", () => {
    expect(shortAnswerCandidates(["로그,  , Log"])).toEqual(["로그,  , Log", "로그", "로그", "Log", "Log"]);
    expect(shortAnswerCandidates(["(Log)"])).toEqual(["(Log)", "(Log)", "Log"]);
    expect(shortAnswerCandidates([""])).toEqual([""]);
  });
});

describe("서답형 — 과다 인정 방어", () => {
  it("용어 내부 슬래시의 한쪽만 써서는 정답이 아니다", () => {
    expect(isQuestionCorrect(["조건/결정"], ["조건/결정"], "short_answer")).toBe(true);
    expect(isQuestionCorrect(["조건/결정"], ["조건"], "short_answer")).toBe(false);
    expect(isQuestionCorrect(["조건/결정"], ["결정"], "short_answer")).toBe(false);
  });

  it("허용답과 무관한 입력은 정답이 아니다", () => {
    expect(isQuestionCorrect(["로그(Log)"], ["로그"], "short_answer")).toBe(true);
    expect(isQuestionCorrect(["로그(Log)"], ["로그인"], "short_answer")).toBe(false);
    expect(isQuestionCorrect(["로그(Log)"], ["Stryker was here"], "short_answer")).toBe(false);
  });

  // 정답키가 손상돼 배열이 아니면 판정 불가다. 정답으로 세면 그 문항은 무조건 맞는다.
  it("정답키가 배열이 아니면 오답으로 처리한다", () => {
    expect(isQuestionCorrect(undefined as unknown as string[], ["아무 답"], "short_answer")).toBe(false);
    expect(isQuestionCorrect("로그" as unknown as string[], ["로그"], "short_answer")).toBe(false);
  });

  it("다답형에서 한 칸이라도 비면 오답이다", () => {
    const p = [{ label: "가", answer: ["4"] }, { label: "나", answer: ["7"] }];
    expect(isQuestionCorrect([], ["4", "7"], "short_answer", p)).toBe(true);
    expect(isQuestionCorrect([], ["4", " "], "short_answer", p)).toBe(false);
    expect(isQuestionCorrect([], ["4"], "short_answer", p)).toBe(false);
  });
});
