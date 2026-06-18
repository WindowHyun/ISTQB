import { useRegisterSW } from 'virtual:pwa-register/react';

// 새 버전(서비스워커) 감지 시 하단 배너로 알리고, 사용자가 1탭으로 갱신한다.
// registerType: 'prompt' + injectRegister: false 와 함께 동작한다.
export const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // 1시간마다 백그라운드로 새 버전 확인.
      if (registration) {
        setInterval(() => { registration.update().catch(() => {}); }, 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="update-prompt" role="alert" data-testid="update-prompt">
      <span className="up-text">새 버전이 있습니다.</span>
      <button
        type="button"
        className="up-reload"
        data-testid="update-reload"
        onClick={() => updateServiceWorker(true)}
      >
        새로고침
      </button>
      <button
        type="button"
        className="up-dismiss"
        aria-label="닫기"
        onClick={() => setNeedRefresh(false)}
      >
        ✕
      </button>
    </div>
  );
};
