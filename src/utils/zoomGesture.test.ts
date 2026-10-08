import { describe, it, expect } from 'vitest';
import {
  DOUBLE_TAP_SCALE,
  IDENTITY,
  MAX_SCALE,
  clampOffset,
  clampScale,
  isDoubleTap,
  isTap,
  isZoomed,
  panBy,
  pinch,
  scaleLabel,
  toggleZoom,
  wheelScale,
  zoomAt,
  zoomHint,
} from './zoomGesture';

/**
 * 확대 제스처 계산. 무대(stage) 390×700, 그림(content) 358×200이 가운데에 놓인 상황을 기본으로 한다.
 * 좌표는 무대 왼쪽 위 기준, 변환의 기준점은 무대 중앙이다.
 */
const stage = { w: 390, h: 700 };
const content = { w: 358, h: 200 };
const center = { x: stage.w / 2, y: stage.h / 2 };

describe('clampScale · isZoomed', () => {
  it('1~MAX 안으로 자른다', () => {
    expect(clampScale(0.3)).toBe(1);
    expect(clampScale(2.2)).toBe(2.2);
    expect(clampScale(99)).toBe(MAX_SCALE);
  });

  it('NaN·Infinity는 원래 크기로 되돌린다(그림이 사라지는 것을 막는다)', () => {
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Infinity)).toBe(1);
  });

  it('부동소수 오차 수준의 1.0x는 확대로 보지 않는다', () => {
    expect(isZoomed(1)).toBe(false);
    expect(isZoomed(1.01)).toBe(false);
    expect(isZoomed(1.5)).toBe(true);
  });
});

describe('clampOffset — 그림이 무대 밖으로 빠지지 않는다', () => {
  it('배율 1에서는 늘 가운데다', () => {
    expect(clampOffset({ scale: 1, x: 80, y: -40 }, stage, content)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('그림이 무대보다 작은 축은 움직이지 않는다', () => {
    // 2배: 가로 716 > 390 이라 움직일 수 있고, 세로 400 < 700 이라 가운데에 고정이다.
    const t = clampOffset({ scale: 2, x: 9999, y: 9999 }, stage, content);
    expect(t.x).toBe((358 * 2 - 390) / 2); // 163
    expect(t.y).toBe(0);
  });

  it('음수 방향도 대칭으로 자른다', () => {
    const t = clampOffset({ scale: 2, x: -9999, y: 0 }, stage, content);
    expect(t.x).toBe(-163);
  });

  it('NaN 이동량은 0으로 정리한다', () => {
    const t = clampOffset({ scale: 2, x: Number.NaN, y: Number.NaN }, stage, content);
    expect(t).toEqual({ scale: 2, x: 0, y: 0 });
  });
});

describe('zoomAt — 손가락 밑의 내용이 고정된다', () => {
  it('무대 중앙을 누르고 확대하면 이동 없이 배율만 바뀐다', () => {
    const t = zoomAt(IDENTITY, center, 2, stage, content);
    expect(t).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it('오른쪽 가장자리를 누르고 확대하면 그 지점이 제자리에 남도록 왼쪽으로 밀린다', () => {
    const point = { x: center.x + 150, y: center.y };
    const t = zoomAt(IDENTITY, point, 2, stage, content);
    // 누른 지점의 그림 좌표 u = 150 (배율 1). 배율 2 이후에도 같은 화면 위치에 있어야 한다:
    //   point.x - center.x = t.x + 2 * u  →  t.x = 150 - 300 = -150
    expect(t.scale).toBe(2);
    expect(t.x).toBe(-150);
    expect(t.y).toBe(0);
  });

  it('이미 확대된 상태에서 다시 확대해도 같은 지점이 고정된다', () => {
    const point = { x: center.x + 40, y: center.y };
    const first = zoomAt(IDENTITY, point, 2, stage, content);
    const second = zoomAt(first, point, 3, stage, content);
    // u = (40 - first.x)/2 = (40 + 40)/2 = 40 → second.x = 40 - 3*40 = -80
    expect(first.x).toBe(-40);
    expect(second.x).toBe(-80);
  });

  it('가장자리를 넘는 확대는 무대 안으로 잘린다', () => {
    const point = { x: center.x + 190, y: center.y };
    const t = zoomAt(IDENTITY, point, 2, stage, content);
    expect(Math.abs(t.x)).toBeLessThanOrEqual((358 * 2 - 390) / 2);
  });
});

describe('toggleZoom — 두 번 누르기', () => {
  it('원래 크기에서는 누른 곳을 중심으로 확대한다', () => {
    const t = toggleZoom(IDENTITY, center, stage, content);
    expect(t.scale).toBe(DOUBLE_TAP_SCALE);
  });

  it('확대된 상태에서는 원래 크기로 돌아간다', () => {
    const zoomed = zoomAt(IDENTITY, center, 3, stage, content);
    expect(toggleZoom(zoomed, center, stage, content)).toEqual(IDENTITY);
  });
});

describe('panBy — 한 손가락 이동', () => {
  it('원래 크기에서는 움직이지 않는다', () => {
    expect(panBy(IDENTITY, 50, 50, stage, content)).toEqual(IDENTITY);
  });

  it('확대 상태에서는 이동량만큼 움직이되 가장자리에서 멈춘다', () => {
    const zoomed = { scale: 2, x: 0, y: 0 };
    expect(panBy(zoomed, -50, 30, stage, content)).toEqual({ scale: 2, x: -50, y: 0 });
    expect(panBy(zoomed, -9999, 0, stage, content).x).toBe(-163);
  });
});

describe('pinch — 두 손가락', () => {
  const a0 = { x: center.x - 50, y: center.y };
  const b0 = { x: center.x + 50, y: center.y };

  it('손가락 간격 비율만큼 배율이 바뀐다', () => {
    const a1 = { x: center.x - 100, y: center.y };
    const b1 = { x: center.x + 100, y: center.y };
    const t = pinch(IDENTITY, [a0, b0], [a1, b1], stage, content);
    expect(t.scale).toBe(2);
    expect(t.x).toBeCloseTo(0);
  });

  it('최대 배율을 넘지 않는다', () => {
    const a1 = { x: center.x - 5000, y: center.y };
    const b1 = { x: center.x + 5000, y: center.y };
    expect(pinch(IDENTITY, [a0, b0], [a1, b1], stage, content).scale).toBe(MAX_SCALE);
  });

  it('모으면 원래 크기까지 줄고 그 아래로 내려가지 않는다', () => {
    const start = { scale: 2, x: 0, y: 0 };
    const a1 = { x: center.x - 1, y: center.y };
    const b1 = { x: center.x + 1, y: center.y };
    expect(pinch(start, [a0, b0], [a1, b1], stage, content)).toEqual(IDENTITY);
  });

  it('두 손가락의 중점이 움직이면 그만큼 이동도 따라간다', () => {
    const start = { scale: 2, x: 0, y: 0 };
    const a1 = { x: a0.x - 30, y: a0.y };
    const b1 = { x: b0.x - 30, y: b0.y };
    const t = pinch(start, [a0, b0], [a1, b1], stage, content);
    expect(t.scale).toBe(2);
    expect(t.x).toBe(-30);
  });

  it('시작 거리가 0이면 배율을 건드리지 않는다(NaN으로 그림이 사라지지 않는다)', () => {
    const start = { scale: 2, x: 0, y: 0 };
    const t = pinch(start, [a0, a0], [a0, b0], stage, content);
    expect(Number.isFinite(t.scale)).toBe(true);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(t.scale).toBe(2);
  });
});

describe('탭 판정', () => {
  it('isDoubleTap: 시간과 거리가 모두 가까워야 한다', () => {
    const first = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { t: 1200, x: 105, y: 102 })).toBe(true);
    expect(isDoubleTap(first, { t: 1500, x: 100, y: 100 })).toBe(false); // 느림
    expect(isDoubleTap(first, { t: 1100, x: 200, y: 100 })).toBe(false); // 멂
  });

  it('isTap: 짧고 거의 움직이지 않아야 탭이다(끌기와 구분)', () => {
    const down = { t: 0, x: 50, y: 50 };
    expect(isTap(down, { t: 120, x: 52, y: 51 })).toBe(true);
    expect(isTap(down, { t: 120, x: 90, y: 50 })).toBe(false); // 끌었다
    expect(isTap(down, { t: 900, x: 50, y: 50 })).toBe(false); // 오래 눌렀다
  });
});

describe('wheelScale · 문구', () => {
  it('휠을 위로 굴리면 커지고 아래로 굴리면 작아진다', () => {
    expect(wheelScale(2, -100)).toBeGreaterThan(2);
    expect(wheelScale(2, 100)).toBeLessThan(2);
    expect(wheelScale(1, 500)).toBe(1);
  });

  it('scaleLabel은 백분율을 반올림한다', () => {
    expect(scaleLabel(1)).toBe('확대 100%');
    expect(scaleLabel(2.5)).toBe('확대 250%');
    expect(scaleLabel(1.234)).toBe('확대 123%');
  });

  it('zoomHint는 지금 두 번 누르면 일어날 일을 말한다', () => {
    expect(zoomHint(1)).toBe('확대 100% · 두 번 누르면 확대');
    expect(zoomHint(2.5)).toBe('확대 250% · 두 번 누르면 원래 크기로');
  });
});
