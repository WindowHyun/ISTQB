import { useEffect, useRef } from 'react';
import { registerBackGuard } from '../utils/backGuard';

/**
 * 오버레이가 열려 있는 동안 뒤로가기(브라우저·안드로이드 하드웨어)로 닫히게 한다.
 *
 * close는 렌더마다 새 함수여도 되도록 ref로 최신 값을 읽는다 — 의존성에 넣으면
 * 인라인 화살표 함수 때문에 매 렌더 등록/해제가 반복되고, 그때마다 history 가드가
 * 흔들린다.
 */
export function useBackDismiss(open: boolean, close: () => void, priority: number): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    return registerBackGuard({ priority, close: () => closeRef.current() });
  }, [open, priority]);
}
