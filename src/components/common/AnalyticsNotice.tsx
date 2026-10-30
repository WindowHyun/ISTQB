import { useSyncExternalStore } from 'react';
import {
  analyticsBlockedByBrowser, analyticsConfigured, isAnalyticsEnabled, setAnalyticsOptOut, subscribeAnalytics,
} from '../../utils/analytics';

/**
 * 사용 통계(GA4) 안내와 끄기 스위치.
 *
 * 측정 ID가 없는 빌드(로컬·E2E·CI)에서는 아무것도 그리지 않는다 — 통계가 꺼져 있는데
 * "수집합니다"라고 말하는 것은 거짓이다. 제품 게이트에도 두는 이유: 게이트에는 설정 화면이
 * 없어서, 안내가 설정 안에만 있으면 처음 들어온 사람은 끌 길을 찾을 수 없다.
 */
export function AnalyticsNotice({ variant }: { variant: 'gate' | 'settings' }) {
  // 마운트 때 한 번 읽지 않고 모듈의 상태를 구독한다 — 다른 탭에서 바꾸거나 같은 탭의 다른 안내(게이트·설정)가
  // 바꿔도 문구와 버튼이 따라온다. 읽는 값은 불리언이라 스냅샷이 안정적이다.
  const on = useSyncExternalStore(subscribeAnalytics, isAnalyticsEnabled);
  if (!analyticsConfigured()) return null;

  const toggle = () => setAnalyticsOptOut(on); // 켜져 있으면 끈다(optOut=true)
  // 브라우저의 Do Not Track이 켜져 있으면 우리 스위치로는 켤 수 없다 — 눌러도 안 켜지는 버튼은 내린다.
  if (analyticsBlockedByBrowser()) {
    const msg = '브라우저의 추적 방지(Do Not Track) 설정에 따라 사용 통계를 보내지 않습니다.';
    return variant === 'settings'
      ? <section className="settings-group"><h4>사용 통계</h4><p className="settings-hint">{msg}</p></section>
      : <p className="analytics-note">{msg}</p>;
  }
  const text = on
    ? '어떤 기능을 쓰는지(모드·통계·백업 등 행동 이름)만 익명으로 집계합니다. 문항·답안·점수는 보내지 않습니다.'
    : '사용 통계를 보내지 않는 중입니다.';
  const label = on ? '사용 통계 끄기' : '사용 통계 켜기';

  if (variant === 'settings') {
    return (
      <section className="settings-group" data-testid="analytics-settings">
        <h4>사용 통계</h4>
        <p className="settings-hint">{text}</p>
        <div className="settings-actions">
          <button type="button" className="settings-action" onClick={toggle} aria-pressed={on} data-testid="analytics-toggle">
            {label}
          </button>
        </div>
      </section>
    );
  }
  return (
    <p className="analytics-note" data-testid="analytics-gate-note">
      {text}{' '}
      <button type="button" className="analytics-note-btn" onClick={toggle} aria-pressed={on}>{label}</button>
    </p>
  );
}
