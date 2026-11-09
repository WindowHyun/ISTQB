import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveQuickRestore } from "./useQuestions";
import type { Question } from "./useQuestions";

// useQuestions(#56)가 의존하는 실제 데이터 스키마 계약을 검증한다.
// 데이터가 드리프트하면(예: index.json 형태 변경) 이 테스트가 실패해 회귀를 알린다.
// 정본(www/data)을 읽는다 — public/data는 sync-assets가 www/에서 생성하는 사본(비커밋)이라
// 동기화 여부와 무관하게 소스를 검증한다.
const dataRoot = path.resolve(process.cwd(), "www/data");

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.join(dataRoot, rel), "utf8"));
}

describe("question data contract (#56)", () => {
  const index = readJson("index.json");

  it("index.json은 평면 sets[] 배열이다", () => {
    expect(Array.isArray(index.sets)).toBe(true);
    expect(index.sets.length).toBeGreaterThan(0);
  });

  it("각 세트 요약은 id/certification/title/path를 가진다", () => {
    for (const set of index.sets) {
      expect(typeof set.id).toBe("string");
      expect(["ISTQB", "CSTS"]).toContain(set.certification);
      expect(typeof set.title).toBe("string");
      expect(typeof set.path).toBe("string");
    }
  });

  it("세트 파일은 { questions: [...] } 형태이고 문항 필드가 유효하다", () => {
    for (const set of index.sets) {
      const payload = readJson(set.path.replace(/^\.\//, ""));
      expect(Array.isArray(payload.questions)).toBe(true);
      expect(payload.questions.length).toBeGreaterThan(0);
      const q = payload.questions[0];
      expect(typeof q.id).toBe("string");
      expect(Array.isArray(q.answer)).toBe(true);
      expect(Array.isArray(q.options)).toBe(true);
      // stem은 ContentBlock[] 또는 문자열(RichText가 둘 다 처리)
      expect(Array.isArray(q.stem) || typeof q.stem === "string").toBe(true);
    }
  });
});

describe("resolveQuickRestore — 저장된 퀵 추첨의 복원 (R-09e)", () => {
  const q = (id: string) => ({ id, number: 1, options: [], answer: [], stem: "" }) as unknown as Question;
  const pool = (...ids: string[]) => new Map(ids.map((id) => [id, q(id)]));
  const saved = { certification: "istqb", items: [{ id: "a" }, { id: "b" }, { id: "c" }] };

  it("전부 풀리면 그대로 복원한다", () => {
    const r = resolveQuickRestore(saved, "istqb", pool("a", "b", "c", "z"), 0);
    expect(r.kind).toBe("full");
    expect(r.kind === "full" && r.questions.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("세트 로드가 실패해 일부만 풀리면 보이는 만큼만 내고 추첨은 덮어쓰지 않는다", () => {
    const r = resolveQuickRestore(saved, "istqb", pool("a", "c"), 1);
    expect(r.kind).toBe("partial");
    expect(r.kind === "partial" && r.questions.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("로드 실패가 없는데 id가 안 풀리면(데이터 변경) 새로 추첨한다", () => {
    expect(resolveQuickRestore(saved, "istqb", pool("a", "c"), 0).kind).toBe("redraw");
  });

  it("실패한 세트가 있어도 하나도 못 풀면 새로 추첨한다", () => {
    expect(resolveQuickRestore(saved, "istqb", pool("z"), 2).kind).toBe("redraw");
  });

  it("다른 제품의 추첨이거나 비어 있으면 새로 추첨한다", () => {
    expect(resolveQuickRestore(saved, "csts", pool("a", "b", "c"), 0).kind).toBe("redraw");
    expect(resolveQuickRestore({ certification: "istqb", items: [] }, "istqb", pool("a"), 0).kind).toBe("redraw");
    expect(resolveQuickRestore(null, "istqb", pool("a"), 0).kind).toBe("redraw");
  });
});
