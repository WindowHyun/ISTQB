import React, { useEffect } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuestions } from '../../hooks/useQuestions';
import { exportUserData, importUserData } from '../../utils/storage';

export const Sidebar = () => {
  const { mode, setId, activeProduct, setMode, setSetId, setIndex, resetTimer, clearAnswers, clearHistory } = useQuizStore();
  const { appData } = useQuestions();

  // 현재 선택된 제품(ISTQB/CSTS)에 속한 세트만 노출.
  const sets = appData
    ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct)
    : [];

  // 제품 선택 후 세트가 미선택(또는 다른 제품 세트)이면 첫 세트를 자동 선택해 문항을 로드.
  useEffect(() => {
    if (sets.length && !sets.some((s) => s.id === setId)) {
      setSetId(sets[0].id);
    }
  }, [appData, activeProduct, setId, setSetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSetId(e.target.value);
    setMode('practice');
    setIndex(0); // 세트 변경 시 index 초기화(범위 밖 접근 방지, #70)
    resetTimer();
  };

  const handleModeChange = (newMode: typeof mode) => {
    setMode(newMode);
    setIndex(0); // 모드 변경 시 index 초기화(#70)
    resetTimer();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const success = await importUserData(e.target.files[0]);
    if (success) {
      alert("백업 파일이 성공적으로 복원되었습니다.");
    } else {
      alert("파일 복원에 실패했습니다.");
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>ISTQB/CSTS</h1>
      </div>

      <div className="sidebar-controls">
        <section className="panel">
          <label htmlFor="setSelect">문제 세트</label>
          <select id="setSelect" value={setId} onChange={handleSetChange}>
            {sets.map((set) => (
              <option key={set.id} value={set.id}>{set.title}</option>
            ))}
          </select>
        </section>

        <section className="panel">
          <label id="modeLabel">풀이 모드</label>
          <div className="segmented" role="group" aria-labelledby="modeLabel">
            {['practice', 'exam', 'random', 'review'].map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? 'active' : ''}
                aria-pressed={mode === m}
                onClick={() => handleModeChange(m as typeof mode)}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <button type="button" className="danger" onClick={() => {
            if (confirm("이 모드의 모든 답안을 지우시겠습니까?")) {
              clearAnswers(setId, mode);
              clearHistory(setId, mode);
            }
          }}>
            선택 답안 초기화
          </button>
          <button type="button" className="secondary" onClick={exportUserData}>기록 내보내기</button>
          <label className="file-import">
            <span>기록 가져오기</span>
            <input type="file" accept=".json" aria-label="백업 파일 가져오기" onChange={handleFileImport} />
          </label>
        </section>
      </div>
    </aside>
  );
};
