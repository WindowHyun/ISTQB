// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { lockBodyScroll } from './scrollLock';

/**
 * 배경 스크롤 잠금은 참조 카운트다 — 모달 위에 라이트박스가 겹치는 조합이 실재한다.
 * 여기서 고정하는 것은 두 가지: 겹쳐 잠갔을 때 **마지막 해제에서만** 복원한다는 것과,
 * 같은 해제 함수를 두 번 불러도(리액트 effect cleanup 중복) 카운트가 음수로 새지 않는다는 것.
 * 어느 쪽이 깨져도 증상은 "배경이 영영 안 움직인다" 또는 "모달 뒤가 스크롤된다"로 나타난다.
 */
describe('lockBodyScroll', () => {
  beforeEach(() => { document.body.style.overflow = ''; });

  it('겹쳐 잠그면 마지막 해제에서만 원래 값으로 되돌린다', () => {
    document.body.style.overflow = 'auto';
    const release1 = lockBodyScroll();
    const release2 = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');

    release1(); // 아직 하나 남았다
    expect(document.body.style.overflow).toBe('hidden');
    release2();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('같은 해제를 두 번 불러도 다음 잠금이 망가지지 않는다', () => {
    const release = lockBodyScroll();
    release();
    release(); // 중복 호출 — 카운트가 -1이 되면 아래 잠금이 복원 시점을 놓친다
    expect(document.body.style.overflow).toBe('');

    const again = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    again();
    expect(document.body.style.overflow).toBe('');
  });
});
