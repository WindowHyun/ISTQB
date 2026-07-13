// Vercel Edge Middleware — 사이트 전체 Basic Auth 잠금.
//
// 목적: 기출 콘텐츠 저작권 보호를 위해 아는 사람(비밀번호 공유자)만 접근 가능하게 한다.
// 페이지·번들·이미지·문제 데이터(/data/*.json)까지 모든 요청이 이 관문을 지난다 —
// 앱 안에 비밀번호 화면을 두는 방식은 데이터 파일이 URL로 그대로 노출되므로 쓰지 않는다.
//
// 동작: 브라우저 기본 인증 창(HTTP Basic Auth). 최초 1회 입력하면 브라우저가 세션 동안
// 기억해 이후 요청에 자동으로 실어 보낸다. 최초 인증 후에는 서비스워커 캐시로 PWA
// 오프라인 사용도 그대로 동작한다.
//
// 설정: Vercel 대시보드 → Settings → Environment Variables 에 SITE_USER / SITE_PASS 등록
// 후 재배포. 이 파일은 Vite 빌드(dist)와 무관하게 Vercel이 별도로 번들하므로
// 로컬 개발(vite preview)·E2E·CI에는 아무 영향이 없다.
//
// 주의: 환경변수가 없으면 잠그지 않고 통과시키는 대신, 명시적 안내와 함께 차단한다
// (조용히 열려 있으면 보호가 풀린 것을 알아챌 수 없다 — fail-closed).

declare const process: { env: Record<string, string | undefined> };

export const config = {
  // 전 경로 보호. Vercel 내부 경로(_vercel)는 제외한다.
  matcher: '/((?!_vercel).*)',
};

export default function middleware(request: Request): Response | undefined {
  const user = process.env.SITE_USER;
  const pass = process.env.SITE_PASS;

  if (!user || !pass) {
    return new Response(
      'Site is locked: SITE_USER / SITE_PASS environment variables are not configured.',
      { status: 503 },
    );
  }

  const expected = 'Basic ' + btoa(`${user}:${pass}`);
  if (request.headers.get('authorization') === expected) {
    return undefined; // 통과 — 정적 자산 서빙 계속.
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="ISTQB/CSTS CBT", charset="UTF-8"',
      // 401 응답이 캐시되면 인증 후에도 캐시가 끼어들 수 있다.
      'Cache-Control': 'no-store',
    },
  });
}
