// localStorage 안전 래퍼.
// 프라이빗 모드·저장 비활성·쿼터 초과 등에서 localStorage 접근이 예외를 던져도
// 앱이 죽지 않도록 감싼다(저장은 조용히 실패, 읽기는 null 반환).
// storage.ts의 저장 함수들은 자체 try/catch가 있으나, 컴포넌트/훅의 직접 접근은 이 헬퍼를 쓴다.

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 저장 불가 환경 — 무시(앱은 저장 없이 계속 동작) */
  }
}
