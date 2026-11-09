import { describe, it, expect } from 'vitest';
import { keyNavTarget, type KeyNavInput } from './keyNav';

const base: KeyNavInput = {
  key: 'ArrowRight', target: { tagName: 'BODY' }, overlayOpen: false, total: 10, index: 4, forwardBlocked: false,
};
const nav = (over: Partial<KeyNavInput> = {}) => keyNavTarget({ ...base, ...over });

describe('keyNavTarget — 좌우 화살표 문항 이동', () => {
  it('오른쪽은 다음, 왼쪽은 이전으로 한 칸 간다', () => {
    expect(nav()).toBe(5);
    expect(nav({ key: 'ArrowLeft' })).toBe(3);
  });

  it('양 끝에서는 넘지 않는다', () => {
    expect(nav({ index: 9 })).toBe(9);
    expect(nav({ key: 'ArrowLeft', index: 0 })).toBe(0);
  });

  it('다른 키는 무시한다', () => {
    expect(nav({ key: 'Enter' })).toBeNull();
    expect(nav({ key: 'ArrowUp' })).toBeNull();
  });

  it('입력 요소에서는 무시한다 — select 포함(세트 셀렉트가 방향키를 쓴다)', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) expect(nav({ target: { tagName } }), tagName).toBeNull();
    expect(nav({ target: { tagName: 'DIV', isContentEditable: true } })).toBeNull();
    expect(nav({ target: { tagName: 'BUTTON' } }), '버튼 포커스에서는 이동한다').toBe(5);
    expect(nav({ target: null }), '대상이 없어도 이동한다').toBe(5);
  });

  it('오버레이가 열려 있으면 무시한다', () => {
    expect(nav({ overlayOpen: true })).toBeNull();
    expect(nav({ key: 'ArrowLeft', overlayOpen: true })).toBeNull();
  });

  it('빈 목록에서는 index를 만들지 않는다(-1 방지)', () => {
    expect(nav({ total: 0, index: 0 })).toBeNull();
    expect(nav({ key: 'ArrowLeft', total: 0, index: 0 })).toBeNull();
  });

  it('퀵에서 채점 전 문항은 앞으로 못 가고 뒤로는 간다', () => {
    expect(nav({ forwardBlocked: true })).toBeNull();
    expect(nav({ key: 'ArrowLeft', forwardBlocked: true })).toBe(3);
  });

  it('저장된 index가 범위 밖이어도 안으로 보정해 이동한다', () => {
    expect(nav({ index: 99 })).toBe(9);
    expect(nav({ key: 'ArrowLeft', index: 99 })).toBe(8);
    expect(nav({ index: -5 })).toBe(1);
  });
});
