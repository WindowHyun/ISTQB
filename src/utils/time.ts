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
