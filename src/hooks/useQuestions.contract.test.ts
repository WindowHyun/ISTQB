import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// useQuestions(#56)가 의존하는 실제 데이터 스키마 계약을 검증한다.
// 데이터가 드리프트하면(예: index.json 형태 변경) 이 테스트가 실패해 회귀를 알린다.
const dataRoot = path.resolve(process.cwd(), "public/data");

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
