import { afterEach, describe, expect, it, vi } from "vitest";
import { safeGetItem, safeSetItem } from "./safeStorage";

// safeStorage: localStorage 접근이 예외를 던지는 환경에서도 앱이 죽지 않아야 한다.
describe("safeStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubStorage(impl: Partial<Storage>) {
    vi.stubGlobal("localStorage", impl as Storage);
  }

  it("정상 환경에서는 getItem 값을 그대로 반환한다", () => {
    stubStorage({ getItem: (k: string) => (k === "a" ? "1" : null) });
    expect(safeGetItem("a")).toBe("1");
    expect(safeGetItem("b")).toBeNull();
  });

  it("getItem이 예외를 던지면 null을 반환한다", () => {
    stubStorage({
      getItem: () => {
        throw new Error("접근 불가");
      },
    });
    expect(safeGetItem("a")).toBeNull();
  });

  it("정상 환경에서는 setItem을 위임 호출한다", () => {
    const setItem = vi.fn();
    stubStorage({ setItem });
    safeSetItem("k", "v");
    expect(setItem).toHaveBeenCalledWith("k", "v");
  });

  it("setItem이 예외를 던져도 삼키고 throw하지 않는다", () => {
    stubStorage({
      setItem: () => {
        throw new Error("저장 불가");
      },
    });
    expect(() => safeSetItem("k", "v")).not.toThrow();
  });
});
