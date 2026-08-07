import { describe, it, expect, beforeEach, afterEach } from "vitest";
import middleware, { __test } from "./middleware";

const { base64Utf8, safeEqual } = __test;

// 운영 사이트 전체의 접근을 결정하는 파일인데 종전에는 타입 검사도 유닛도 없었다.
// 이 파일이 틀리면 증상은 둘 중 하나다 — 아무나 들어오거나(보호 실패), 아무도 못
// 들어온다(가용성 실패). 둘 다 조용히 일어나므로 값으로 고정해 둔다.

const authHeader = (raw: string) => new Request("https://x/", { headers: { authorization: raw } });

describe("base64Utf8 — btoa의 Latin-1 제약을 넘긴다", () => {
  it("ASCII는 btoa와 같은 결과를 낸다", () => {
    expect(base64Utf8("user:pass")).toBe(btoa("user:pass"));
  });

  it("한글이 들어가도 던지지 않고 UTF-8 base64를 낸다", () => {
    // 종전 코드(btoa 직접 호출)는 여기서 InvalidCharacterError를 던졌고,
    // 그 예외가 미들웨어 밖으로 나가 모든 요청이 500이 됐다.
    expect(() => btoa("사용자:비밀")).toThrow();
    expect(base64Utf8("사용자:비밀")).toBe(
      Buffer.from("사용자:비밀", "utf8").toString("base64"),
    );
  });

  it("이모지도 마찬가지다(서로게이트 쌍)", () => {
    expect(base64Utf8("a:🔒")).toBe(Buffer.from("a:🔒", "utf8").toString("base64"));
  });

  it("빈 문자열", () => {
    expect(base64Utf8("")).toBe("");
  });
});

describe("safeEqual", () => {
  it("같은 문자열은 참", () => {
    expect(safeEqual("Basic abc", "Basic abc")).toBe(true);
  });

  it("한 바이트만 달라도 거짓", () => {
    expect(safeEqual("Basic abc", "Basic abd")).toBe(false);
  });

  it("길이가 다르면 거짓", () => {
    expect(safeEqual("Basic abc", "Basic abcd")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  it("빈 문자열끼리는 참 — 헤더 없음이 통과로 이어지지 않게 하는 것은 호출부 책임", () => {
    expect(safeEqual("", "")).toBe(true);
  });

  it("멀티바이트 문자를 바이트 단위로 비교한다", () => {
    expect(safeEqual("가", "가")).toBe(true);
    expect(safeEqual("가", "나")).toBe(false);
  });
});

describe("middleware — 관문 동작", () => {
  const saved = { user: process.env.SITE_USER, pass: process.env.SITE_PASS };

  beforeEach(() => {
    process.env.SITE_USER = "u";
    process.env.SITE_PASS = "p";
  });
  afterEach(() => {
    if (saved.user === undefined) delete process.env.SITE_USER;
    else process.env.SITE_USER = saved.user;
    if (saved.pass === undefined) delete process.env.SITE_PASS;
    else process.env.SITE_PASS = saved.pass;
  });

  it("올바른 자격 증명이면 통과시킨다(undefined)", () => {
    expect(middleware(authHeader("Basic " + btoa("u:p")))).toBeUndefined();
  });

  it("자격 증명이 틀리면 401과 WWW-Authenticate를 준다", () => {
    const res = middleware(authHeader("Basic " + btoa("u:wrong")));
    expect(res?.status).toBe(401);
    expect(res?.headers.get("WWW-Authenticate")).toContain("Basic realm=");
    // 401이 캐시되면 인증에 성공한 뒤에도 캐시가 끼어든다.
    expect(res?.headers.get("Cache-Control")).toBe("no-store");
  });

  it("authorization 헤더가 아예 없으면 401 — 통과하지 않는다", () => {
    const res = middleware(new Request("https://x/"));
    expect(res?.status).toBe(401);
  });

  it("환경변수가 없으면 열어 두지 않고 503으로 막는다(fail-closed)", () => {
    delete process.env.SITE_PASS;
    const res = middleware(authHeader("Basic " + btoa("u:p")));
    expect(res?.status).toBe(503);
  });

  it("비ASCII 비밀번호에서도 죽지 않고 정상 판정한다", () => {
    // 이 케이스가 종전 구현의 실제 결함이다: 던지는 순간 사이트 전체가 500이 된다.
    process.env.SITE_PASS = "비밀🔒";
    const good = "Basic " + Buffer.from("u:비밀🔒", "utf8").toString("base64");
    expect(middleware(authHeader(good))).toBeUndefined();
    expect(middleware(authHeader("Basic " + Buffer.from("u:틀림", "utf8").toString("base64")))?.status).toBe(401);
  });
});
