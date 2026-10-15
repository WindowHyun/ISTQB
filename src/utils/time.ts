// 경과/남은 초를 시계 표기로 포맷. 사이드바 통계·워크스페이스·결과 모달이 공유.
// 1시간 미만은 mm:ss, 1시간 이상은 h:mm:ss로 표기한다 — mm:ss 고정이면 90분이 "90:00"으로
// 나와 "90초"로 오독된다(CSTS 70문항 세트는 60분을 넘기기 쉽다).
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// 회차 날짜 표기 — 로케일을 ko-KR로 고정한다. toLocaleDateString()을 인자 없이 쓰면
// 브라우저 로케일을 따라가, 한국어 앱인데 기기에 따라 "6/15/2025"(미국식)로 나온다.
// 포매터를 모듈 상수로 재사용한다: 이력이 수천 건 쌓이면 행마다 Intl 객체를 새로
// 만드는 비용이 통계 렌더 시간에 그대로 실린다(NF12는 1,000건 렌더를 예산으로 잰다).
const ROUND_DATE_FMT = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' });
const ROUND_TIME_FMT = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * 회차 응시 시각 표기. 날짜만 찍으면 하루에 여러 번 응시했을 때 세 줄이 모두 같은 값이라 방금 친 회차를
 * 가려낼 수 없다 — 오늘 회차는 시각만(`오늘 14:05`), 이전 회차는 날짜+시각(`10월 28일 14:05`)으로 보여준다.
 *
 * 시각이 없거나(옛·가져온 이력은 createdAt이 없다) 읽을 수 없는 값이면 빈 문자열이고, 호출부는 칸을 그리지 않는다.
 * 저장소는 createdAt이 유한한 수인지만 보므로(`sanitizeHistory`) 가져온 백업의 1e20 같은 값이 그대로 들어온다.
 * `Date`는 ±8.64e15ms 밖을 Invalid Date로 만들고 `Intl.DateTimeFormat#format`은 그것에 RangeError를 던진다 —
 * 이 함수는 통계 화면의 렌더 안에서 불려, 한 줄 때문에 화면 전체가 오류 경계 뒤로 사라졌고 '이력 비우기'도 그 안에 있어
 * 손상된 기록을 지울 길이 없었다. `now`는 결정적인 검사를 위한 주입점이다.
 */
export function formatRoundDate(ms: number | undefined, now: Date = new Date()): string {
  if (typeof ms !== 'number' || !(ms > 0)) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  const time = ROUND_TIME_FMT.format(d);
  return sameDay ? `오늘 ${time}` : `${ROUND_DATE_FMT.format(d)} ${time}`;
}
