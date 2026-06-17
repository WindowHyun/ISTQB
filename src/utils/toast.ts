// 비차단(non-blocking) 토스트 알림. alert() 대체용.
type ToastType = 'success' | 'error' | 'info';

function getHost(): HTMLElement {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
  }
  return host;
}

export function showToast(message: string, type: ToastType = 'info', duration = 3000): void {
  if (typeof document === 'undefined') return;
  const host = getHost();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.setAttribute('data-testid', 'toast');
  el.textContent = message;
  host.appendChild(el);

  // 진입 애니메이션
  requestAnimationFrame(() => el.classList.add('show'));

  const remove = () => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    // 전환 미발생 환경(테스트) 폴백
    setTimeout(() => el.remove(), 250);
  };
  el.addEventListener('click', remove);
  setTimeout(remove, duration);
}
