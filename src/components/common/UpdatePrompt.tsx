import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { startUpdateChecks } from '../../utils/swUpdateCheck';

// 새 버전(서비스워커) 감지 시 하단 배너로 알리고, 사용자가 1탭으로 갱신한다.
// registerType: 'prompt' + injectRegister: false 와 함께 동작한다.
export const UpdatePrompt = () => {
  const stopChecksRef = useRef<(() => void) | undefined>(undefined);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // 확인 시점은 swUpdateCheck가 정한다(복귀·포커스·네트워크 복구·주기).
      // 재등록(StrictMode 이중 실행 포함) 시 기존 감시를 먼저 걷어 중복을 막는다.
      if (registration) {
        stopChecksRef.current?.();
        stopChecksRef.current = startUpdateChecks(registration);
      }
    },
  });
  useEffect(() => () => {
    stopChecksRef.current?.();
    stopChecksRef.current = undefined;
  }, []);

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
