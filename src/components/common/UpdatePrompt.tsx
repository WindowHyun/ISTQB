import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { startUpdateChecks } from '../../utils/swUpdateCheck';
import { isAtProductGate } from '../../utils/sessionDerive';
import { flushPersist } from '../../utils/storage';

// 새 버전(서비스워커) 감지 시 하단 배너로 알리고, 사용자가 1탭으로 갱신한다.
// registerType: 'prompt' + injectRegister: false 와 함께 동작한다.
//
// 다만 **제품 선택 게이트에서는 묻지 않고 바로 적용한다.** 이유는 둘이다.
//   ① 배너를 한 번 닫으면 그 세션에서는 다시 뜨지 않는다 — 사용자가 새로고침을 누를
//      때까지 계속 옛 코드로 돈다. 앱을 열 때마다 게이트를 지나므로, 그 자리에서
//      적용하면 대부분의 사용자는 아무것도 누르지 않아도 다음 실행에 최신이 된다.
//   ② 게이트는 아직 아무것도 시작하지 않은 화면이라 리로드로 잃을 화면 상태가 없다.
//
// 반대로 **풀이 중에는 절대 자동 적용하지 않는다.** 시험에는 제한시간이 있고, 경고 없는
// 리로드는 그 자체로 사고다. 그 구간에서는 지금처럼 배너만 띄우고 사용자가 고른다.
export const UpdatePrompt = () => {
  const stopChecksRef = useRef<(() => void) | undefined>(undefined);
  /** 자동 적용은 한 번만 — 리로드가 막히는 환경에서 호출이 반복되지 않게 한다. */
  const autoAppliedRef = useRef(false);
  const { mode, activeProduct } = useQuizStore(useShallow((s) => ({
    mode: s.mode, activeProduct: s.activeProduct,
  })));
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

  const atGate = isAtProductGate({ mode, activeProduct });
  useEffect(() => {
    if (!needRefresh || !atGate || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    // 리로드는 디바운스 저장을 기다려 주지 않는다 — 대기 중인 답안·UI 상태를 먼저 내린다.
    // 게이트에서는 대개 이미 비어 있지만, 다른 탭이 방금 쓴 값이 남아 있을 수 있다.
    flushPersist();
    updateServiceWorker(true);
  }, [needRefresh, atGate, updateServiceWorker]);

  // 게이트에서는 위 effect가 곧바로 적용하므로 배너를 그리지 않는다(깜빡임 방지).
  if (!needRefresh || atGate) return null;

  return (
    <div className="update-prompt" role="alert" data-testid="update-prompt">
      <span className="up-text">새 버전이 있습니다.</span>
      <button
        type="button"
        className="up-reload"
        data-testid="update-reload"
        onClick={() => { flushPersist(); updateServiceWorker(true); }}
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
