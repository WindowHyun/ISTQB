// 풀이 모드 표시 라벨의 단일 원천 — 종전에는 AppModals·StatsDashboard·MobileTopBar·App이
// 각자 같은 표를 들고 있어, 모드를 추가·개명할 때 네 곳을 함께 고쳐야 했다.
// 게이트 모드('home')는 사용자에게 보여줄 라벨이 없으므로 의도적으로 비워 둔다.
/**
 * 채점(회차 기록)이 있는 모드인지. 연습·오답은 즉시 피드백이라 채점 개념이 없다.
 * 사이드바의 채점 섹션 노출과 useQuizSession의 canGrade가 같은 규칙을 각자 들고 있었다 —
 * 한쪽만 고치면 '채점하기'가 보이는데 눌러도 안 되거나 그 반대가 된다. 여기로 모은다.
 */
export const GRADED_MODES = ['exam', 'random', 'quick'] as const;
export function isGradedMode(mode: string): boolean {
  return (GRADED_MODES as readonly string[]).includes(mode);
}

export const MODE_LABEL: Record<string, string> = {
  practice: '연습',
  exam: '시험',
  random: '랜덤',
  review: '오답',
  quick: '퀵',
};
