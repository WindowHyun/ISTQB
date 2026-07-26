// 앱 내 로고(사이드바·모바일 상단바)의 단일 원천.
// 파비콘·PWA·Android 런처 아이콘(www/icons/favicon.svg 등)과 같은 디자인을 쓴다 —
// 종전에는 두 컴포넌트가 구 브랜드색(#166064 틸) SVG를 각자 하드코딩해, 앱을 열면
// 아이콘(블루)과 앱 내 로고(틸)의 색이 달라 보였다.
// data URI로 인라인해 추가 요청 없이 즉시 렌더한다(아이콘 파일 변경 시 함께 갱신).
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="앱 로고">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0052CC"/><stop offset="1" stop-color="#0747A6"/></linearGradient>
<linearGradient id="ck" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#36B37E"/><stop offset="1" stop-color="#008DA6"/></linearGradient>
</defs>
<rect x="32" y="32" width="448" height="448" rx="110" fill="url(#bg)"/>
<path d="M140 180C140 140 160 140 180 140" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".3"/>
<path d="M372 180C372 140 352 140 332 140" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".3"/>
<path d="M150 260 230 340 370 180" fill="none" stroke="url(#ck)" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="370" cy="180" r="28" fill="#fff"/>
<circle cx="150" cy="260" r="16" fill="#fff" opacity=".8"/>
<circle cx="230" cy="340" r="16" fill="#fff" opacity=".8"/>
</svg>`;

export const BRAND_LOGO_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;
