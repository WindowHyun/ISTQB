import { useQuizStore } from '../store/useQuizStore';
import { answerKeyPrefix, gradeKeyFor } from '../utils/answerKey';

/**
 * 랜덤 진행 중 판정 — 현재 세트에 답한 문항이 있고 아직 채점하지 않은 상태.
 * 채점 후에는 결과를 이미 봤으므로 세트 변경을 막을 이유가 없다.
 */
function hasRandomProgress(): boolean {
  const s = useQuizStore.getState();
  if (s.graded[gradeKeyFor(s.setId, 'random')]) return false;
  return Object.keys(s.answers).some((k) => k.startsWith(answerKeyPrefix(s.setId, 'random')));
}

/**
 * 세트를 바꿔 달라는 요청 — 사이드바의 세트 select와 모바일 세트 선택 시트가 **같은 길**을 쓴다.
 *
 * 세트를 바꿔도 현재 모드는 유지한다(연습으로 초기화하지 않음, #2). 랜덤은 세트별로 추첨을
 * 보관하지 않아(F4) 세트를 바꾸면 지금 푸는 문항이 통째로 사라진다. 진행이 있는데 아직 채점
 * 전이면 소리 없이 버리지 않고 한 번 묻는다(확인 모달 pendingSetChange).
 *
 * 이 가드는 147a9f0에서 사이드바를 줄이며 함께 빠졌던 적이 있다. 확인 모달은 남아 있었지만
 * 띄우는 쪽이 없어져, 랜덤 진행 중 세트를 바꾸면 경고 없이 진행이 사라졌다. 입구가 둘이 된 지금
 * 한쪽에만 가드가 있으면 같은 결함이 시트 쪽에서 되살아나므로, 가드를 입구가 아닌 이 함수에 둔다.
 *
 * 확인을 물을 때는 세트 선택 시트를 먼저 닫는다. 모달은 모두 같은 z-index라 앞뒤를 DOM 순서가
 * 정하는데, 시트가 확인 모달 뒤에 그려지면 시트의 배경이 확인을 덮고 탭을 삼켜 — 가드는 켜졌는데
 * 사용자는 그것을 볼 수도 답할 수도 없다. 시트를 닫아 두면 겹칠 일이 없고, '계속 풀기'가 풀던
 * 문제로 돌아간다는 이름의 뜻과도 맞는다. (사이드바에서 들어올 때는 이미 닫혀 있어 영향이 없다.)
 */
export function requestSetChange(newSetId: string): void {
  const s = useQuizStore.getState();
  if (s.mode === 'random' && hasRandomProgress()) {
    s.setSetSheetOpen(false);
    s.setPendingSetChange(newSetId);
    return;
  }
  s.commitSetChange(newSetId);
}
