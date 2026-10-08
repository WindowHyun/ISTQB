import { useMemo } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { Modal } from '../common/Modal';
import type { AppData } from '../../hooks/useQuestions';
import { useSetCounts } from '../../hooks/useSetCounts';
import { requestSetChange } from '../../hooks/useSetChange';
import { groupSets, setProgressPercent, setProgressText, solvedCountForSet } from '../../utils/setSheet';

/**
 * 세트 선택 바텀 시트(모바일) — 시스템 `<select>`를 대신한다.
 *
 * 드롭다운은 원제목(`(공개답안) CSTS 2402FL`)이 그대로 나열되고 높이가 40px라 터치 타깃(44px)에도
 * 못 미쳤다. 여기서는 세트를 종류별로 묶고(공개답안 · FL / 일반등급 예제), 짧은 이름과 풀이 진행을
 * 함께 보여 준다. 이름·묶음은 index.json의 title에서 규칙으로 파생한다(utils/setSheet — 데이터는 그대로).
 *
 * 현재 제품의 세트만 보인다. 제품 전환은 저장 키가 갈리는 지점이라 종전처럼 '처음 화면으로'를
 * 거친다(이 시트가 대신하지 않는다).
 *
 * 세트를 고르는 길은 사이드바의 select와 같다(requestSetChange) — 랜덤 진행 중 확인 가드도 거기 있다.
 */
export const SetSheet = ({ appData, onClose }: { appData: AppData | null; onClose: () => void }) => {
  const activeProduct = useQuizStore((s) => s.activeProduct);
  const setId = useQuizStore((s) => s.setId);
  const answers = useQuizStore((s) => s.answers);

  const sets = useMemo(
    () => (appData ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct) : []),
    [appData, activeProduct],
  );
  const counts = useSetCounts(sets);
  const groups = useMemo(() => groupSets(sets), [sets]);

  const choose = (id: string) => {
    // 이미 보고 있는 세트를 다시 고르면 닫기만 한다 — commitSetChange는 위치·타이머를 처음으로 되돌린다.
    if (id === setId) { onClose(); return; }
    requestSetChange(id);
    // 바로 바뀌었으면 commitSetChange가 시트를 닫는다. 랜덤 진행 중 확인을 거치는 경우에는 열어 둔다 —
    // 취소하면 이 시트로 돌아와 다른 세트를 고를 수 있다.
  };

  return (
    <Modal title="세트 선택" variant="sheet" onClose={onClose}>
      <div className="modal-body sset" data-testid="set-sheet">
        {groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h4 className="sgrp">{g.label}</h4>
            <ul className="slist">
              {g.rows.map(({ set, display }) => {
                const total = counts[set.id];
                const solved = solvedCountForSet(answers, set.id, total);
                const current = set.id === setId;
                return (
                  <li key={set.id}>
                    <button
                      type="button"
                      className="srow"
                      data-testid="set-row"
                      data-set-id={set.id}
                      aria-current={current ? 'true' : undefined}
                      onClick={() => choose(set.id)}
                    >
                      <span className="srow-main">
                        <span className="srow-top">
                          <b>{display.name}</b>
                          <small>{setProgressText(solved, total)}</small>
                        </span>
                        <span className="sbar" aria-hidden="true">
                          <i style={{ width: `${setProgressPercent(solved, total)}%` }} />
                        </span>
                      </span>
                      {current && <span className="srow-cur">✓ 선택됨</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
};
