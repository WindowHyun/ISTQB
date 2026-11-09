import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `vercel.json` 계약 — 이 설정은 운영 배포에서만 효력이 있어(`vite preview`에는 헤더가 없다) 로컬 E2E가 못 본다.
 * 지워지거나 어긋나면 조용히 사라지므로 값으로 고정한다.
 */

interface HeaderRule { source: string; headers: { key: string; value: string }[] }
const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers: HeaderRule[] };
const rule = (source: string) => config.headers.find((h) => h.source === source);
const header = (source: string, key: string) => rule(source)?.headers.find((h) => h.key === key)?.value;

describe('vercel.json 헤더', () => {
  // 서비스워커 자신이 캐시되면 갱신 경로가 막혀 사용자가 새 버전을 영영 못 받는다(release-playbook).
  it.each(['/sw.js', '/service-worker.js', '/registerSW.js'])('%s는 no-cache다', (source) => {
    expect(header(source, 'Cache-Control')).toBe('no-cache');
  });

  it('매니페스트는 manifest+json으로 내보낸다', () => {
    expect(header('/manifest.webmanifest', 'Content-Type')).toMatch(/^application\/manifest\+json/);
  });

  // R-19(D-02 A): 앱 동작에 영향이 거의 없는 보안 헤더. script-src CSP는 허용 목록(GA 등)을 실측한 뒤
  // Report-Only로 먼저 넣는 별도 단계다 — 여기서는 깨질 위험이 작은 것만 건다.
  describe('전 경로 보안 헤더', () => {
    const ALL = '/(.*)';
    it('MIME 추측을 막는다', () => expect(header(ALL, 'X-Content-Type-Options')).toBe('nosniff'));
    it('Referer는 출처만 넘긴다', () => expect(header(ALL, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin'));
    it('쓰지 않는 기기 권한을 끈다', () => {
      const v = header(ALL, 'Permissions-Policy') ?? '';
      for (const f of ['camera', 'microphone', 'geolocation']) expect(v, f).toContain(`${f}=()`);
    });
    it('다른 사이트가 이 앱을 프레임에 넣지 못한다', () => {
      expect(header(ALL, 'Content-Security-Policy')).toBe("frame-ancestors 'none'");
      expect(header(ALL, 'X-Frame-Options')).toBe('DENY');
    });
    it('이 단계의 CSP는 frame-ancestors뿐이다 — script-src를 섞으면 허용 목록 누락 시 앱이 통째로 깨진다', () => {
      expect(header(ALL, 'Content-Security-Policy')).not.toMatch(/script-src|default-src/);
    });
  });
});
