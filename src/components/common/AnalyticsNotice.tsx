import { useSyncExternalStore } from 'react';
import { analyticsNoticeView, analyticsStatus, setAnalyticsOptOut, subscribeAnalytics } from '../../utils/analytics';

/**
 * 사용 통계(GA4) 안내와 끄기 스위치.
 *
 * 측정 ID가 없는 빌드(로컬·E2E·CI)에서는 아무것도 그리지 않는다 — 통계가 꺼져 있는데
 * "수집합니다"라고 말하는 것은 거짓이다. 제품 게이트에도 두는 이유: 게이트에는 설정 화면이
 * 없어서, 안내가 설정 안에만 있으면 처음 들어온 사람은 끌 길을 찾을 수 없다.
 *
 * 무엇을 말하고 무엇을 누르게 하는지는 `analyticsNoticeView`가 정한다(유닛이 닿는 자리).
 * 여기는 그것을 게이트·설정의 모양으로 그리기만 한다.
 */
export function AnalyticsNotice({ variant }: { variant: 'gate' | 'settings' }) {
  // 마운트 때 한 번 읽지 않고 모듈의 상태를 구독한다 — 다른 탭에서 바꾸거나 같은 탭의 다른 안내(게이트·설정)가
  // 바꿔도 문구와 버튼이 따라온다. 읽는 값은 문자열이라 스냅샷이 안정적이다.
  const status = useSyncExternalStore(subscribeAnalytics, analyticsStatus);
  const view = analyticsNoticeView(status);
  if (!view) return null;
  const { text, action } = view;

  // 버튼의 이름이 '끄기'↔'켜기'로 바뀌며 할 일을 말한다. aria-pressed를 함께 달면 켜져 있을 때
  // "사용 통계 끄기, 눌림"으로 읽혀 꺼진 것처럼 들린다 — 상태는 이름과 위 문구 한 곳에서만 말한다.
  if (variant === 'settings') {
    return (
      <section className="settings-group" data-testid="analytics-settings">
        <h4>사용 통계</h4>
        <p className="settings-hint" data-testid="analytics-settings-text">{text}</p>
        {action && (
          <div className="settings-actions">
            <button
              type="button"
              className="settings-action"
              onClick={() => setAnalyticsOptOut(action.optOut)}
              data-testid="analytics-toggle"
            >
              {action.label}
            </button>
          </div>
        )}
      </section>
    );
  }
  return (
    <p className="analytics-note" data-testid="analytics-gate-note">
      {text}
      {action && (
        <button
          type="button"
          className="analytics-note-btn"
          onClick={() => setAnalyticsOptOut(action.optOut)}
          data-testid="analytics-gate-toggle"
        >
          {action.label}
        </button>
      )}
    </p>
  );
}
