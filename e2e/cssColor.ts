/**
 * 계산된 색(getComputedStyle) 문자열을 읽는 순수 모듈 — E2E 단언이 "경고색으로 칠했는가"를 값이 아니라 관계로 잴 때 쓴다.
 *
 * 읽는 형식은 Chromium이 sRGB 색의 계산값으로 돌려주는 둘뿐이다: `rgb(r, g, b)`·`rgba(r, g, b, a)`(채널 0~255)와
 * `color(srgb r g b)`(채널 0~1 — `color-mix()`의 직렬화). 그 밖의 형식(`oklch`·`lab`·`color(display-p3 …)`)은 **던진다**.
 * 숫자만 뽑아 읽으면 색 공간 이름 속 숫자('p3')를 첫 채널로 읽거나 다른 공간의 값을 sRGB로 착각해서, 회색이 붉다고 답하고
 * 붉은 색이 아니라고 답한다 — `.toBe(false)` 단언은 아무것도 재지 못한 채 통과한다. 모르는 형식은 조용히 틀리느니 크게 실패한다.
 * 투명도는 보지 않는다(경고색을 '썼는가'를 재는 것이지 보이는 정도를 재는 것이 아니다).
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
// rgb(200, 30, 30) · rgba(200, 30, 30, 0.5) · rgb(200 30 30 / 50%)
const RGB_FN = new RegExp(
  String.raw`^rgba?\(\s*(${NUM})\s*[,\s]\s*(${NUM})\s*[,\s]\s*(${NUM})\s*(?:[,/]\s*${NUM}%?\s*)?\)$`,
  "i",
);
// color(srgb 0.78 0.12 0.12) · color(srgb 1 0 0 / 0.4)
const COLOR_SRGB = new RegExp(
  String.raw`^color\(\s*srgb\s+(${NUM})\s+(${NUM})\s+(${NUM})\s*(?:/\s*${NUM}%?\s*)?\)$`,
  "i",
);

/** sRGB 채널(0~255)로 읽는다. 읽을 수 없는 형식이면 던진다. */
export function parseCssColor(css: string): Rgb {
  const text = css.trim();
  const fn = RGB_FN.exec(text);
  if (fn) return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) };
  const srgb = COLOR_SRGB.exec(text);
  if (srgb) return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255 };
  throw new Error(
    `읽을 수 없는 색 형식이다: "${css}" — rgb()·rgba()·color(srgb …)만 읽는다. 다른 색 공간은 sRGB로 바꿔 주는 변환이 먼저 필요하다.`,
  );
}

/** 붉은 기가 도는가 — 빨강이 초록·파랑보다 뚜렷이(40/255) 크다. 회색·파랑·초록은 아니다. */
export function isReddish(css: string): boolean {
  const { r, g, b } = parseCssColor(css);
  return r > g + 40 && r > b + 40;
}
