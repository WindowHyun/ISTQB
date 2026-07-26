// 풀이 모드 표시 라벨의 단일 원천 — 종전에는 AppModals·StatsDashboard·MobileTopBar·App이
// 각자 같은 표를 들고 있어, 모드를 추가·개명할 때 네 곳을 함께 고쳐야 했다.
// 게이트 모드('home')는 사용자에게 보여줄 라벨이 없으므로 의도적으로 비워 둔다.
export const MODE_LABEL: Record<string, string> = {
  practice: '연습',
  exam: '시험',
  random: '랜덤',
  review: '오답',
};
