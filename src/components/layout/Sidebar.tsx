import React from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuestions } from '../../hooks/useQuestions';
import { exportUserData, importUserData } from '../../utils/storage';

export const Sidebar = () => {
  const { mode, setId, setMode, setSetId, resetTimer, clearAnswers, clearHistory, answers } = useQuizStore();
  const { appData, currentQuestions } = useQuestions();

  const handleSetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSetId(e.target.value);
    setMode('practice');
    resetTimer();
  };

  const handleModeChange = (newMode: typeof mode) => {
    setMode(newMode);
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
            {appData?.istqb.sets.map((set) => (
              <option key={set.id} value={set.id}>{set.title}</option>
            ))}
            {appData?.csts.sets.map((set) => (
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
