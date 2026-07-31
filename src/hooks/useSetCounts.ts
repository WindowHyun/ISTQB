import { useEffect, useState } from 'react';
import { SetSummary } from './useQuestions';
import { loadSetQuestions } from '../utils/questionLoader';

// 세트별 문항 수 캐시(모듈 스코프 — 재마운트/제품 전환 간 유지). 데이터는 변형하지 않는다.
const setCountCache: Record<string, number> = {};

/**
 * 주어진 세트 목록의 문항 수를 반환한다(드롭다운에 "(N문항)" 표시용).
 *
 * 값의 출처는 index.json의 sets[].questionCount다(빌드 타임 생성, --check로 낡음 방지).
 * 종전에는 이 숫자 하나를 얻자고 제품의 전 세트 JSON을 내려받아 파싱했다 — CSTS 기준
 * 7파일 526KB, 그것도 '자격증을 고르는 순간'에. 세트 하나만 필요한 연습·시험 모드에서도
 * 그 비용을 전부 치렀고, Safari/WebKit에서는 그 파싱 구간 동안 메인 스레드가 붙들려
 * 문항 화면 프레임이 400ms당 2까지 떨어졌다(Chromium은 여유가 있어 드러나지 않았다).
 *
 * 폴백은 남겨 둔다: questionCount가 없는 매니페스트(구버전 배포본·부분 갱신)에서도
 * 라벨이 비지 않아야 한다. 그때만 종전처럼 세트를 읽는다.
 */
export function useSetCounts(sets: SetSummary[]): Record<string, number> {
  const fromManifest = (s: SetSummary) =>
    (typeof s.questionCount === 'number' && s.questionCount >= 0 ? s.questionCount : undefined);

  const seed = () => {
    const out: Record<string, number> = { ...setCountCache };
    for (const s of sets) {
      const n = fromManifest(s);
      if (n !== undefined) out[s.id] = n;
    }
    return out;
  };

  const [counts, setCounts] = useState<Record<string, number>>(seed);
  const key = sets.map((s) => s.id).join(',');

  useEffect(() => {
    let cancelled = false;
    // 매니페스트에 있는 값은 즉시 반영한다 — 네트워크 없이 첫 렌더부터 라벨이 채워진다.
    for (const s of sets) {
      const n = fromManifest(s);
      if (n !== undefined) setCountCache[s.id] = n;
    }
    const missing = sets.filter((s) => setCountCache[s.id] === undefined);
    if (!missing.length) {
      setCounts({ ...setCountCache });
      return;
    }
    Promise.all(
      missing.map((s) =>
        loadSetQuestions(s.path)
          .then((questions) => { setCountCache[s.id] = questions.length; })
          .catch(() => { /* 카운트는 부가 정보 — 실패 시 제목만 표시 */ }),
      ),
    ).then(() => {
      if (!cancelled) setCounts({ ...setCountCache });
    });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return counts;
}
