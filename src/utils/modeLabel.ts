// 풀이 모드 표시 라벨의 단일 원천 — 종전에는 AppModals·StatsDashboard·MobileTopBar·App이
// 각자 같은 표를 들고 있어, 모드를 추가·개명할 때 네 곳을 함께 고쳐야 했다.
// 게이트 모드('home')는 사용자에게 보여줄 라벨이 없으므로 의도적으로 비워 둔다.
/**
 * 채점(회차 기록)이 있는 모드인지. 연습·오답·퀵은 즉시 피드백이라 채점 개념이 없다.
 * 사이드바의 채점 섹션 노출과 useQuizSession의 canGrade가 같은 규칙을 각자 들고 있었다 —
 * 한쪽만 고치면 '채점하기'가 보이는데 눌러도 안 되거나 그 반대가 된다. 여기로 모은다.
 *
 * 퀵이 빠진 이유: 퀵은 한 문항씩 풀고 즉시 정답·해설을 보는 무한 모드가 됐다(랜덤 흡수).
 * 회차라는 단위가 없어져 채점할 대상 자체가 없다 — 기록도 남기지 않는다.
 * 랜덤이 빠진 이유: 모드 자체가 없어졌다(퀵으로 흡수).
 */
export const GRADED_MODES = ['exam'] as const;
export function isGradedMode(mode: string): boolean {
  return (GRADED_MODES as readonly string[]).includes(mode);
}

export const MODE_LABEL: Record<string, string> = {
  practice: '연습',
  exam: '시험',
  review: '오답',
  quick: '퀵',
  // 레거시 — 이력에만 남아 있는 모드(신규 생성 없음). 과거 회차를 통계·오답노트에서
  // 이름 없이 표시하지 않도록 라벨은 유지한다.
  random: '랜덤',
};

// 사이드바 모드 세그먼트 아래에 상시 노출하는 한 줄 설명 — 잠금 힌트(examLocked)와
// 별개로, 지금 고른 모드가 무엇을 하는지 그 자리에서 안내한다.
export const MODE_CAPTION: Record<string, string> = {
  practice: '즉시 정답·해설이 보여요. 기록되지 않습니다.',
  exam: '채점 후 정답이 공개돼요. 응시 중에는 세트·모드 변경이 잠깁니다.',
  review: '틀린 문항만 모아 즉시 피드백으로 다시 풉니다.',
  quick: '전 세트에서 한 문항씩 무한으로 풉니다. 기록되지 않습니다.',
};
