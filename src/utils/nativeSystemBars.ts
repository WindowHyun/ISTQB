// 웹의 테마를 안드로이드 시스템 바(상태바·내비게이션 바)에 잇는다.
//
// APK는 edge-to-edge다 — WebView가 시스템 바 뒤까지 그리고, 바 자체의 배경색은
// 네이티브가 정한다. 그 색이 onCreate에서 흰색으로 한 번 박히고 끝이었다. 그래서
// 다크 테마에서는 어두운 앱 위아래에 **흰 띠 두 줄**이 남았다. 웹에는 시스템 바가
// 없으므로 이 결함은 APK에서만 보인다.
//
// 색은 여기서 정하지 않고 CSS 토큰(--surface)에서 읽어 넘긴다 — 팔레트의 진실은
// globals.css 하나이며, 여기에 값을 복제하면 토큰이 바뀔 때 조용히 어긋난다.
// 상단바(.mobile-topbar)와 하단 액션바가 쓰는 색이 --surface라, 바를 그 색에 맞추면
// 경계가 보이지 않는다.

/** 현재 body에 적용된 테마를 네이티브 시스템 바에 반영한다. 웹에서는 no-op. */
export function syncNativeSystemBars(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const bridge = window.AndroidTheme;
  if (!bridge?.setSystemBars) return;

  const surface = getComputedStyle(document.body).getPropertyValue('--surface').trim();
  // 스타일시트가 아직 안 붙었으면 빈 문자열이다 — 이전 색을 유지하는 편이 낫다
  // (파싱 실패로 검은 바가 되는 것보다).
  if (!surface) return;

  // data-theme은 프리페인트 스크립트가 React보다 먼저 심는다. 'dark'가 아니면 라이트로
  // 본다 — 손상된 값("purple")이 들어와도 흰 바탕에 흰 아이콘이 되지는 않는다.
  const lightBar = document.body.dataset.theme !== 'dark';
  try {
    bridge.setSystemBars(surface, lightBar);
  } catch {
    /* 브리지가 반쯤 주입된 상태 — 색만 못 맞출 뿐이라 앱을 멈추지 않는다. */
  }
}

/**
 * body[data-theme] 변화를 따라가며 시스템 바를 계속 맞춘다. 해제 함수를 반환한다.
 *
 * useTheme의 effect가 아니라 여기서 감시하는 이유: useTheme은 앱 셸(AppModals) 안에서만
 * 돌고, **제품 선택 게이트 화면은 그 셸 밖**이다. effect에 걸면 사용자가 처음 보는 화면
 * — 게이트 — 에서만 바가 흰 채로 남는다. 속성을 보면 누가 테마를 바꿨든(프리페인트
 * 스크립트·설정·OS 선호 변경) 한 자리에서 잡힌다.
 */
export function watchNativeSystemBars(): () => void {
  if (typeof document === 'undefined') return () => {};
  syncNativeSystemBars();
  if (typeof MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(syncNativeSystemBars);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
