/**
 * 그림 확대 화면의 제스처 계산 — 순수 계층.
 *
 * 라이트박스는 DOM을 직접 만지는 바닐라 코드(lightbox.ts)라 유닛이 닿기 어렵다. 포인터 이벤트를
 * 읽어 변환을 정하는 **계산**만 여기로 꺼내, 손가락 두 개로 늘리거나 끌 때 그림이 화면 밖으로
 * 사라지는 류의 결함을 숫자로 고정한다(sessionDerive·roundHistory를 꺼낸 것과 같은 이유).
 *
 * 좌표계: 변환은 `translate(x, y) scale(s)`이고 기준점은 **무대 중앙**이다. x·y는 화면 픽셀,
 * 점(Point)은 무대 왼쪽 위를 원점으로 한다. 그림은 배율 1에서 무대 한가운데에 맞춰 놓이고
 * (content), 무대(stage)보다 커진 만큼만 움직일 수 있다.
 */

export interface Point { x: number; y: number }
export interface Size { w: number; h: number }
export interface ViewTransform { scale: number; x: number; y: number }

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** 두 번 누르면 확대하는 배율. */
export const DOUBLE_TAP_SCALE = 2.5;
/** 이 값 이하는 '확대 안 됨'으로 본다 — 부동소수 오차로 100%를 영영 못 알아보지 않게. */
const ZOOMED_EPSILON = 1.02;

export const IDENTITY: ViewTransform = { scale: MIN_SCALE, x: 0, y: 0 };

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function isZoomed(scale: number): boolean {
  return scale > ZOOMED_EPSILON;
}

/** 한 축에서 움직일 수 있는 최대치. 그림이 무대보다 작으면 0(가운데에 고정). */
function maxOffset(contentLen: number, scale: number, stageLen: number): number {
  return Math.max(0, (contentLen * scale - stageLen) / 2);
}

/** 그림이 무대 밖으로 빠지지 않도록 이동량을 자른다. 배율이 1이면 늘 가운데다. */
export function clampOffset(t: ViewTransform, stage: Size, content: Size): ViewTransform {
  const scale = clampScale(t.scale);
  const mx = maxOffset(content.w, scale, stage.w);
  const my = maxOffset(content.h, scale, stage.h);
  // `|| 0`: -0을 +0으로 정리한다(translate(-0px)가 문자열·비교에서 +0과 달라 보이는 것을 막는다).
  return {
    scale,
    x: Math.min(mx, Math.max(-mx, Number.isFinite(t.x) ? t.x : 0)) || 0,
    y: Math.min(my, Math.max(-my, Number.isFinite(t.y) ? t.y : 0)) || 0,
  };
}

function fromCenter(p: Point, stage: Size): Point {
  return { x: p.x - stage.w / 2, y: p.y - stage.h / 2 };
}

/**
 * `point` 아래의 그림 지점을 고정한 채 배율만 바꾼다(손가락 밑의 내용이 손가락을 따라간다).
 * 그림 중심 기준 좌표 u = (point − t) / scale 을 유지하도록 새 이동량을 정한다.
 */
export function zoomAt(t: ViewTransform, point: Point, nextScale: number, stage: Size, content: Size): ViewTransform {
  const s1 = clampScale(nextScale);
  const p = fromCenter(point, stage);
  const ux = (p.x - t.x) / t.scale;
  const uy = (p.y - t.y) / t.scale;
  return clampOffset({ scale: s1, x: p.x - s1 * ux, y: p.y - s1 * uy }, stage, content);
}

/** 두 번 누르기: 확대돼 있으면 원래 크기로, 아니면 누른 곳을 중심으로 확대한다. */
export function toggleZoom(t: ViewTransform, point: Point, stage: Size, content: Size): ViewTransform {
  if (isZoomed(t.scale)) return IDENTITY;
  return zoomAt(t, point, DOUBLE_TAP_SCALE, stage, content);
}

/** 한 손가락 이동. 확대돼 있지 않으면 움직이지 않는다(스크롤과 다투지 않는다). */
export function panBy(start: ViewTransform, dx: number, dy: number, stage: Size, content: Size): ViewTransform {
  if (!isZoomed(start.scale)) return IDENTITY;
  return clampOffset({ scale: start.scale, x: start.x + dx, y: start.y + dy }, stage, content);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * 두 손가락. 시작 순간의 두 점과 지금의 두 점으로 배율(거리 비)과 이동(중점 이동)을 함께 정한다.
 * 시작 거리가 0이면(두 점이 겹침) 배율을 바꾸지 않는다 — 0으로 나눠 NaN이 되면 그림이 사라진다.
 */
export function pinch(
  start: ViewTransform,
  startPoints: [Point, Point],
  nowPoints: [Point, Point],
  stage: Size,
  content: Size,
): ViewTransform {
  const d0 = distance(startPoints[0], startPoints[1]);
  const d1 = distance(nowPoints[0], nowPoints[1]);
  const ratio = d0 > 0 ? d1 / d0 : 1;
  const s1 = clampScale(start.scale * ratio);
  const m0 = fromCenter(midpoint(startPoints[0], startPoints[1]), stage);
  const m1 = fromCenter(midpoint(nowPoints[0], nowPoints[1]), stage);
  const ux = (m0.x - start.x) / start.scale;
  const uy = (m0.y - start.y) / start.scale;
  return clampOffset({ scale: s1, x: m1.x - s1 * ux, y: m1.y - s1 * uy }, stage, content);
}

/** 휠·트랙패드 핀치(ctrl+휠)의 배율 변화. 휠 한 칸(약 100)은 약 18% 변화다. */
export function wheelScale(scale: number, deltaY: number): number {
  return clampScale(scale * Math.exp(-deltaY * 0.002));
}

export interface TapRecord { t: number; x: number; y: number }

/** 직전 탭과 합쳐 두 번 누르기인가. 시간·거리 둘 다 가까워야 한다. */
export function isDoubleTap(prev: TapRecord | null, now: TapRecord, maxMs = 320, maxDist = 28): boolean {
  if (!prev) return false;
  return now.t - prev.t <= maxMs && Math.hypot(now.x - prev.x, now.y - prev.y) <= maxDist;
}

/** 손가락이 거의 움직이지 않고 짧게 닿았다 떨어졌나 — 이동(pan)이 아니라 탭. */
export function isTap(down: TapRecord, up: TapRecord, maxMs = 450, maxMove = 10): boolean {
  return up.t - down.t <= maxMs && Math.hypot(up.x - down.x, up.y - down.y) <= maxMove;
}

export function scaleLabel(scale: number): string {
  return `확대 ${Math.round(clampScale(scale) * 100)}%`;
}

/** 무대 아래 안내 줄 — 지금 두 번 누르면 무슨 일이 일어나는지를 말한다. */
export function zoomHint(scale: number): string {
  return `${scaleLabel(scale)} · ${isZoomed(scale) ? '두 번 누르면 원래 크기로' : '두 번 누르면 확대'}`;
}
