// 새 버전(서비스워커)을 언제 확인할지.
//
// 문제: 확인 시점이 "등록 직후"와 "1시간마다" 둘뿐이었다. 셋이 겹쳐 배너가 한참 뒤에
// 떴다.
//   ① 이 앱은 라우터가 없다 — 화면 전환이 전부 상태 변경이라 첫 로드 뒤로 탐색이
//      없고, 브라우저가 탐색 때 하는 sw.js 재확인이 걸리지 않는다.
//   ② standalone PWA는 백그라운드에서 타이머가 얼어붙는다(iOS는 아예 정지). 그래서
//      "1시간마다"가 실제로는 **누적 포그라운드 1시간마다**가 된다 — 하루 몇 분씩
//      쓰는 사용자에게는 배포 며칠 뒤에야 배너가 떴다.
//   ③ 정작 사람이 앱으로 돌아오는 순간에는 아무것도 확인하지 않았다.
//
// 해결: 돌아오는 순간을 전부 확인 시점으로 삼는다 — 화면이 보이게 될 때
// (visibilitychange), 창이 포커스를 되찾을 때(focus), 네트워크가 돌아올 때(online).
// focus를 따로 다는 이유는 데스크톱에서 탭을 바꾸지 않고 다른 앱을 다녀오면
// visibilitychange가 오지 않기 때문이다. 주기 확인은 15분으로 좁혀 앱을 계속 켜 둔
// 세션을 받친다.
//
// 확인 한 번은 sw.js GET 하나다(vercel.json이 no-cache로 내보낸다). 값은 싸지만
// 탭을 연타하면 그마저 쌓이므로 최소 간격을 두고 그 사이 요청은 건너뛴다.

/** 앱을 계속 켜 둔 세션을 위한 주기 확인 간격. */
export const SW_UPDATE_PERIOD_MS = 15 * 60 * 1000;
/** 이 간격 안에 겹쳐 들어온 확인은 건너뛴다(탭 전환 연타 방지). */
export const SW_UPDATE_MIN_INTERVAL_MS = 60 * 1000;

/** ServiceWorkerRegistration 중 이 모듈이 쓰는 부분만. 테스트가 흉내내기 쉽다. */
interface UpdateTarget {
  update: () => Promise<unknown>;
}

/**
 * 새 버전 확인을 걸어 둔다. 반환한 함수를 부르면 리스너와 타이머가 모두 걷힌다.
 *
 * 등록은 방금 sw.js를 받아 온 참이므로 첫 확인은 최소 간격 뒤부터다.
 */
export function startUpdateChecks(
  registration: UpdateTarget,
  periodMs: number = SW_UPDATE_PERIOD_MS,
  minIntervalMs: number = SW_UPDATE_MIN_INTERVAL_MS,
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let lastCheckedAt = Date.now();

  const check = (): void => {
    const elapsed = Date.now() - lastCheckedAt;
    // 기기 시각이 뒤로 조정되면 elapsed가 음수가 된다. 그대로 두면 되감긴 만큼 확인이
    // 얼어붙으므로(시각을 하루 되돌리면 하루 동안), 어긋난 시점은 한 번 확인하고
    // 기준을 다시 잡는다.
    if (elapsed >= 0 && elapsed < minIntervalMs) return;
    lastCheckedAt = Date.now();
    // 오프라인·서버 오류로 실패하는 것은 정상이다 — 다음 시점에 다시 묻는다.
    registration.update().catch(() => {});
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') check();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  const timer = setInterval(check, periodMs);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', check);
    window.removeEventListener('online', check);
    clearInterval(timer);
  };
}
