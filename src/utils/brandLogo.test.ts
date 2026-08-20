import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND_LOGO_SRC } from './brandLogo';

/**
 * 앱 내 로고 — 커버리지 0%였다. 상수 하나짜리 모듈이라 "테스트할 게 없다"고 넘기기 쉽지만,
 * 이 파일에는 **주석으로만 지켜지던 계약**이 하나 있다:
 *
 *   "파비콘·PWA·Android 런처 아이콘(www/icons/favicon.svg 등)과 같은 디자인을 쓴다 —
 *    종전에는 두 컴포넌트가 구 브랜드색(#166064 틸) SVG를 각자 하드코딩해, 앱을 열면
 *    아이콘(블루)과 앱 내 로고(틸)의 색이 달라 보였다."
 *
 * 실제로 났던 결함이고, 지금은 사람의 주의력만이 재발을 막고 있다 — 아이콘 파일을
 * 새 색으로 바꾸면서 이 상수를 잊으면 같은 증상이 그대로 돌아온다.
 * 그래서 **두 파일의 팔레트가 같다**는 것을 검사로 고정한다.
 */

const faviconPath = path.resolve(process.cwd(), 'www/icons/favicon.svg');

/** #fff / #FFFFFF 표기 차이를 없애고 색 집합만 남긴다. */
function palette(svg: string): string[] {
  const hits = svg.match(/#[0-9A-Fa-f]{3,6}\b/g) ?? [];
  const norm = hits.map((h) => {
    const v = h.slice(1).toLowerCase();
    return v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  });
  return [...new Set(norm)].sort();
}

/** data URI에서 원본 SVG를 되돌린다 — 검사 대상은 문자열이 아니라 실제로 그려질 내용이다. */
function decodedLogo(): string {
  const prefix = 'data:image/svg+xml;charset=utf-8,';
  expect(BRAND_LOGO_SRC.startsWith(prefix), 'data URI 접두가 바뀌었다').toBe(true);
  return decodeURIComponent(BRAND_LOGO_SRC.slice(prefix.length));
}

describe('BRAND_LOGO_SRC', () => {
  it('추가 요청 없이 즉시 그려지는 인라인 data URI다', () => {
    // 외부 파일을 가리키게 바뀌면 첫 페인트에 요청이 하나 늘고, 오프라인에서 깨진다.
    expect(BRAND_LOGO_SRC).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(BRAND_LOGO_SRC).not.toMatch(/https?:\/\//);
  });

  it('디코드하면 온전한 SVG다', () => {
    const svg = decodedLogo();
    expect(svg.trimStart().startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    // 스크린리더가 읽을 이름 — 지우면 로고가 이름 없는 이미지가 된다.
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label');
  });

  // 이 검사가 이 파일의 존재 이유다 — 실제로 났던 결함의 재발 방지.
  it('폐기된 틸 브랜드색(#166064)을 쓰지 않는다', () => {
    expect(palette(decodedLogo())).not.toContain('166064');
  });

  it('파비콘과 같은 팔레트를 쓴다', () => {
    // 아이콘 파일이 없으면 조용히 통과하는 검사가 되므로 존재부터 확인한다.
    expect(fs.existsSync(faviconPath), 'www/icons/favicon.svg가 없다').toBe(true);
    const favicon = fs.readFileSync(faviconPath, 'utf8');
    expect(palette(decodedLogo()), '앱 내 로고와 파비콘의 색이 갈렸다')
      .toEqual(palette(favicon));
  });
});
