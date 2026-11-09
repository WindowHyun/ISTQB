/**
 * 키보드 좌우 화살표로 문항을 옮길 때의 판정 — 순수 계층.
 *
 * 핸들러가 컴포넌트 안에 있는 동안 이 판정은 유닛이 닿지 못했고, 실제로 네 가지가 틀렸다: 퀵을 다시 섞은 뒤에도
 * 이전 목록을 봤고(effect가 길이만 의존성으로 두어 오래된 목록을 붙잡았다), `select`에서 화살표가 문항을 넘겼고,
 * 확인 창 뒤에서 문항이 넘어갔고, 빈 목록에서 index가 -1이 됐다. 여기서는 입력 요소·오버레이·빈 목록·퀵 규칙을
 * 값으로 고정한다. 목록과 오버레이 상태는 호출 시점의 값을 인자로 받는다 — 캡처하지 않는다.
 */

export interface KeyNavInput {
  key: string;
  /** 이벤트 대상. 입력 요소에서는 화살표가 그 요소의 것이다. */
  target: { tagName?: string; isContentEditable?: boolean } | null;
  /** 모달·드로어·확인 창·라이트박스가 열려 있는가(`hasOpenOverlay`). */
  overlayOpen: boolean;
  total: number;
  /** 현재 index — 저장된 값이 범위를 벗어났어도 안에서 보정해 쓴다. */
  index: number;
  /** 퀵에서 지금 문항을 채점하기 전이면 앞으로 갈 수 없다(버튼 ›를 없앤 것과 같은 규칙). */
  forwardBlocked: boolean;
}

/** 화살표가 자기 일을 하는 요소 — `select`는 방향키로 선택지를 바꾼다(세트 셀렉트가 그 예). */
const OWN_ARROW_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** 이동할 index. 아무것도 하지 말아야 하면 null. */
export function keyNavTarget(input: KeyNavInput): number | null {
  const { key, target, overlayOpen, total, index, forwardBlocked } = input;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  if (target && (OWN_ARROW_TAGS.has(target.tagName ?? '') || target.isContentEditable)) return null;
  if (overlayOpen) return null;
  if (total <= 0) return null; // 빈 목록에서 total - 1 = -1이 index가 되지 않게
  const cur = Math.min(Math.max(index, 0), total - 1);
  if (key === 'ArrowLeft') return Math.max(0, cur - 1);
  if (forwardBlocked) return null;
  return Math.min(total - 1, cur + 1);
}
