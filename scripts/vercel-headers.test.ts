import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';

/**
 * 운영 응답 헤더 — `vercel.json`.
 *
 * 헤더가 하나도 없던 때가 있었다: 인증을 통과한 페이지를 다른 사이트가 iframe에 넣을 수 있었고(클릭재킹),
 * XSS가 생기면 스크립트 출처를 제한하는 것이 없었다. 이 검사는 두 가지를 못 박는다.
 *  1. 필수 헤더가 전 경로에 걸려 있다(CSP의 frame-ancestors·object-src, nosniff, Referrer-Policy).
 *  2. CSP가 앱의 **인라인 스크립트**를 허용한다. index.vite.html의 프리페인트 테마 스크립트는 해시로만
 *     허용되므로, 스크립트를 한 글자만 고쳐도 해시가 어긋나 운영에서 모든 사용자의 첫 화면 스크립트가 막힌다 —
 *     vite preview·E2E는 vercel.json을 적용하지 않아 배포 전에는 아무도 못 본다.
 */

const read = (f: string) => fs.readFileSync(f, 'utf8');
const config = JSON.parse(read('vercel.json')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const global = config.headers.find((h) => h.source === '/(.*)');
const header = (key: string) => global?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? '';
const directive = (csp: string, name: string) =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

/** 소스 HTML의 인라인 스크립트(src 없는 <script>)의 CSP 해시. */
function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`,
  );
}

describe('vercel.json — 보안 헤더', () => {
  const csp = header('Content-Security-Policy');

  it('전 경로(/(.*))에 헤더가 걸려 있다', () => {
    expect(global, "source가 '/(.*)'인 헤더 규칙이 없다").toBeDefined();
  });

  it('클릭재킹·MIME 스니핑·리퍼러를 막는다', () => {
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBeTruthy();
  });

  it('CSP는 기본을 self로 좁히고 플러그인·base 변조를 막는다', () => {
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
  });

  it("스크립트에는 unsafe-inline·unsafe-eval을 허용하지 않는다", () => {
    const script = directive(csp, 'script-src');
    expect(script).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(script).toContain("'self'");
  });

  it('index.vite.html의 인라인 스크립트가 모두 해시로 허용돼 있다(고치면 해시도 갱신한다)', () => {
    const hashes = inlineScriptHashes(read('index.vite.html'));
    expect(hashes.length, '인라인 스크립트를 못 읽었다').toBeGreaterThan(0);
    const script = directive(csp, 'script-src');
    for (const h of hashes) expect(script, `CSP에 ${h}가 없다 — 운영에서 인라인 스크립트가 막힌다`).toContain(h);
  });

  // analytics.ts가 gtag를 이 호스트에서 내려받고 이벤트를 보낸다 — 막으면 통계가 조용히 멈춘다.
  it('사용 통계(GA4)가 쓰는 호스트를 허용한다', () => {
    expect(directive(csp, 'script-src')).toContain('https://www.googletagmanager.com');
    expect(directive(csp, 'connect-src')).toMatch(/google-analytics\.com/);
  });

  it('서비스워커 갱신용 no-cache 규칙이 남아 있다(전 경로 규칙이 덮지 않는다)', () => {
    const sw = config.headers.find((h) => h.source === '/sw.js');
    expect(sw?.headers.find((x) => x.key === 'Cache-Control')?.value).toBe('no-cache');
    expect(global?.headers.some((h) => h.key.toLowerCase() === 'cache-control')).toBe(false);
  });
});
