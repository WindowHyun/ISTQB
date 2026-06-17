import { useEffect, useState } from 'react';
import { SetSummary } from './useQuestions';

// 세트별 문항 수 캐시(모듈 스코프 — 재마운트/제품 전환 간 유지). 데이터는 변형하지 않는다.
const setCountCache: Record<string, number> = {};

/**
 * 주어진 세트 목록의 문항 수를 지연 로드해 반환한다(드롭다운에 "(N문항)" 표시용).
 * index.json에는 문항 수가 없으므로 세트 JSON을 한 번씩 읽어 길이만 캐시한다.
 */
export function useSetCounts(sets: SetSummary[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ ...setCountCache }));
  const key = sets.map((s) => s.id).join(',');

  useEffect(() => {
    let cancelled = false;
    const missing = sets.filter((s) => setCountCache[s.id] === undefined);
    if (!missing.length) {
      setCounts({ ...setCountCache });
      return;
    }
    Promise.all(
      missing.map((s) =>
        fetch(`data/${s.path.replace(/^\.\//, '')}`)
          .then((res) => res.json())
          .then((data) => {
            const questions = Array.isArray(data) ? data : data?.questions || [];
            setCountCache[s.id] = questions.length;
          })
          .catch(() => { /* 카운트는 부가 정보 — 실패 시 제목만 표시 */ }),
      ),
    ).then(() => {
      if (!cancelled) setCounts({ ...setCountCache });
    });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return counts;
}
