import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../store/useQuizStore';
import { loadIndex, loadSetQuestions, subscribeLoads } from '../utils/questionLoader';
import { makeCanonicalIdResolver } from '../utils/chapterStats';
import { gradeKeyFor } from '../utils/answerKey';

// Fisher–Yates shuffle: 균일 분포를 보장한다. (sort 비교자에 Math.random을 쓰면 편향됨)
// 경계가 한 칸만 어긋나도(`* i` 또는 `i >= 0`) 조용히 편향된다 — 눈으로는 여전히
// "섞인 것처럼" 보이므로 분포 테스트로 고정한다(useQuestions.draw.test.ts).
export function shuffleQuestions<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// stem/explanation은 ContentBlock[] 또는 문자열일 수 있다(RichText가 둘 다 처리).
export interface Question {
  id?: string;
  number: number;
  type?: string;
  stem: unknown;
  options: { key: string; text: string }[];
  answer: string[];
  // 다답형 서답형(서로 다른 답을 여러 칸에서 요구, 예 "동등분할 4개·경계값 7개").
  // 있으면 QuestionCard가 라벨별 입력 칸을 렌더하고 채점은 모든 칸 일치를 요구한다.
  // answer(단일 문자열)는 PDF 대조·폴백용으로 유지한다.
  answerParts?: { label: string; answer: string[] }[];
  explanation?: unknown;
  figure?: string | null;
  // 대단원 분류(Phase 0, 약점 분석용). taxonomy.json의 챕터명 또는 null(미태깅).
  chapter?: string | null;
  // 세부 주제 태그(향후 확장). 현재는 비어 있을 수 있음.
  tags?: string[];
  difficulty?: string;
  // 퀵에서만 채워진다 — 전 세트 혼합이라 문항만 봐서는 어느 세트 것인지 알 수 없다.
  // 화면에 그 문항의 출처 세트를 밝히고, 복원 시 어떤 세트를 로드할지 정하는 데 쓴다.
  sourceSetId?: string;
}

// index.json의 세트 요약(평면 배열, certification 포함).
export interface SetSummary {
  id: string;
  certification: string;
  title: string;
  path: string;
  legacySetId?: string;
  /** 세트의 문항 수(빌드 타임 생성). 없으면 useSetCounts가 세트를 읽어 폴백한다. */
  questionCount?: number;
}

export interface AppData {
  schemaVersion?: number;
  sets: SetSummary[];
  // 세트 간 재수록 문항 그룹(빌드 타임 생성, scripts/build-duplicate-groups.js).
  // 같은 문제가 여러 세트에 실려 있고 id는 세트마다 달라, 이 표가 없으면 챕터 통계가
  // 같은 문제를 두 번 센다. 각 그룹은 문항 id 배열이며 첫 원소가 대표다.
  duplicateGroups?: string[][];
  // 재수록 그룹의 대표 챕터 — 같은 문제가 세트마다 다른 챕터로 태깅된 경우를 결정론적으로
  // 통일한다(원본 데이터는 그대로 두고 집계에서만 맞춘다). 갈리는 그룹만 실린다.
  duplicateChapters?: Record<string, string>;
}

// 퀵 출제 순서의 단일 원천은 스토어의 quickDraw(섞인 문항 id 목록)다.
// 여기서는 스토어만 읽고, 필요한 문항 객체는 로드된 문항에서 id로 되살린다
// (같은 tick 내 zustand set/get은 동기라 훅 인스턴스 간에도 일관).
// - quickNonce는 상태가 아니라 "다시 섞으라"는 이벤트 트리거다(순서를 구독하지 않으므로
//   effect를 다시 돌리는 신호가 별도로 필요하다).

/**
 * 퀵 출제 풀을 만든다 — 제품의 전 세트에서 뽑되 같은 문제를 두 번 넣지 않는다.
 *
 * 중복 제거를 문항 id로 하면 안 된다. 같은 문제가 여러 세트에 재수록돼 있는데 id에는
 * 세트 접두가 붙어 있어(CSTS-FL-2404-001 vs CSTS-FL-2405-001) 서로 다른 id다.
 * index.json의 duplicateGroups(빌드 타임 생성)로 대표 id를 구해 그룹당 하나만 남긴다.
 * 챕터 통계도 같은 표를 쓰므로 "퀵에서는 안 겹치는데 통계 분모는 두 번 센다"가 생기지 않는다.
 *
 * 유형을 가리지 않는다. 종전에는 서답형이 한 회차를 점령하지 않도록 추첨 단계에서 30%
 * 상한을 뒀는데, 회차라는 단위가 없어진(무한) 지금은 상한이 오히려 해롭다 — 상한을 두면
 * 앞쪽 문항이 선택형으로만 채워져 서답형은 한참 뒤에야 나오거나 영영 안 나온다.
 */
export function buildQuickPool(
  perSet: { setId: string; questions: Question[] }[],
  canonicalIdOf: (id: string) => string,
): QuickCandidate[] {
  const pool: QuickCandidate[] = [];
  const seen = new Set<string>();
  for (const { setId, questions } of perSet) {
    for (const q of questions) {
      const id = q.id || `legacy-${q.number}`;
      const key = canonicalIdOf(id);
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({ question: q, setId, id });
    }
  }
  return pool;
}

/** 퀵 출제 후보 — 문항과 그 출처 세트. 출처가 있어야 복원 시 어느 세트를 여는지 알 수 있다. */
export interface QuickCandidate {
  question: Question;
  setId: string;
  id: string;
}

/**
 * 오답 모드가 다시 낼 문항 id — 이 세트의 시험 오답 + 폐지된 랜덤 모드의 오답(+구버전 단독 키).
 *
 * 'random' 키를 계속 읽는 이유: 랜덤 모드는 퀵에 흡수돼 사라졌지만 기존 사용자가 랜덤으로
 * 채점해 쌓아 둔 오답은 보존한다. 읽기를 빼면 그 오답이 오답 노트에는 보이는데 오답 모드에는
 * 안 나오는 상태가 된다 — 새 키가 더는 생기지 않을 뿐, 읽기는 남겨야 한다.
 *
 * 퀵은 여기 들어오지 않는다. 이제 퀵은 채점 자체가 없어(한 문항씩 즉시 확인) 오답 버킷에
 * 넣을 시점이 존재하지 않는다. 사양상으로도 퀵은 기록을 남기지 않는 모드다.
 */
export function reviewTargetIds(
  reviewIds: Record<string, string[]>,
  setId: string,
): Set<string> {
  return new Set([
    ...(reviewIds[gradeKeyFor(setId, 'exam')] || []),
    // 레거시 — 폐지된 랜덤 모드가 남긴 오답(신규 생성 없음).
    ...(reviewIds[gradeKeyFor(setId, 'random')] || []),
    // 구버전 데이터 호환 — 모드가 붙기 전의 단독 키.
    ...(reviewIds[setId] || []),
  ]);
}

export function useQuestions() {
  const [appData, setAppData] = useState<AppData | null>(null);
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([]);
  // 로드 실패 사용자 노출용(무한 스켈레톤 방지). retryLoad로 재시도한다.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 슬라이스 구독(O1) — 타이머 틱·답안 변경에 이 훅이 리렌더를 유발하지 않는다.
  const { setId, mode, reviewIds, chapterFilter, reviewedOk, activeProduct, quickNonce } =
    useQuizStore(useShallow((s) => ({
      setId: s.setId, mode: s.mode, reviewIds: s.reviewIds, chapterFilter: s.chapterFilter,
      reviewedOk: s.reviewedOk[s.setId],
      activeProduct: s.activeProduct,
      // 퀵 재추첨 트리거 — 순서 자체를 구독하지 않으므로 effect를 다시 돌릴 신호가 따로 필요하다.
      quickNonce: s.quickNonce,
    })));

  // 다른 인스턴스의 "다시 시도"가 성공하면 이 인스턴스도 캐시에서 다시 읽어 복구한다 —
  // 없으면 재시도 버튼이 있는 워크스페이스만 살아나고 사이드바·상단바는 빈 채로 남는다.
  useEffect(() => subscribeLoads(() => setReloadKey((k) => k + 1)), []);

  useEffect(() => {
    let cancelled = false;
    // 공용 로더(Promise 캐시) — 여러 훅 인스턴스가 동시에 마운트돼도 요청은 1회다.
    loadIndex()
      .then((data) => {
        if (cancelled) return;
        setLoadError(null);
        setAppData(data);
      })
      .catch((err) => {
        console.error('Failed to load index.json', err);
        if (!cancelled) setLoadError('문제 목록을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // 퀵 — 제품의 전 세트에서 뽑으므로 세트 하나를 여는 아래 effect와 경로가 다르다.
  // 세트별 JSON은 questionLoader가 Promise 캐시로 들고 있어, 이미 연 세트는 재요청하지 않는다.
  useEffect(() => {
    if (!appData || mode !== 'quick' || !activeProduct) return;
    let cancelled = false;

    const sets = appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct);
    if (!sets.length) return;

    // allSettled — 세트 하나가 실패해도 나머지로 출제한다. Promise.all이면 12세트 중
    // 1개만 404·타임아웃이어도 퀵 전체가 에러 화면이 됐다. 다른 모드는 세트 하나만
    // 열므로 이 취약성이 없다 — 퀵만 전 세트를 동시에 여는 유일한 경로다.
    // 오프라인(서비스워커 캐시 부분 적중)에서 특히 실재하는 조건이다.
    Promise.allSettled(
      sets.map((s) => loadSetQuestions(s.path).then((questions) => ({ setId: s.id, questions }))),
    )
      .then((results) => {
        if (cancelled) return;
        const perSet = results
          .filter((r): r is PromiseFulfilledResult<{ setId: string; questions: Question[] }> =>
            r.status === 'fulfilled')
          .map((r) => r.value);
        const failed = results.length - perSet.length;
        if (failed) {
          console.warn(`[data] 퀵: 세트 ${failed}/${results.length}개를 불러오지 못해 나머지로 출제합니다.`);
        }
        // 전부 실패했을 때만 에러로 전환한다(아래 catch와 같은 처리).
        if (!perSet.length) {
          setLoadError('문제 세트를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
          setCurrentQuestions([]);
          return;
        }
        setLoadError(null);
        const canonicalIdOf = makeCanonicalIdResolver(appData.duplicateGroups);
        const pool = buildQuickPool(perSet, canonicalIdOf);
        // 출처 세트를 문항에 실어 둔다 — 채점 때 오답을 각 세트의 오답노트로 보내려면
        // 문항만으로 어느 세트에서 왔는지 알 수 있어야 한다. 로더 캐시의 원본을 변이하지
        // 않도록 얕은 복사본에 붙인다(캐시는 다른 모드와 공유된다).
        const withSource = new Map<string, Question>(
          pool.map((c) => [c.id, { ...c.question, sourceSetId: c.setId }]),
        );

        // 저장된 순서가 현재 제품과 맞으면 그대로 이어푼다 — 새로고침 이어풀기.
        // 일부 id만 풀려도 되살린다: 무한 모드라 목록이 제품 전체(수백 문항)인데,
        // 데이터가 한 문항만 바뀌어도 전부 버리면 진행 중인 커서가 통째로 날아간다.
        const saved = useQuizStore.getState().quickDraw;
        if (saved && saved.certification === activeProduct && saved.items.length) {
          const restored = saved.items
            .map((it) => withSource.get(it.id))
            .filter((q): q is Question => !!q);
          if (restored.length) {
            setCurrentQuestions(restored);
            return;
          }
        }

        // 풀 전체를 섞어 그대로 출제 순서로 쓴다. 앞에서 잘라 내지 않는 이유는
        // quickDraw 주석 참고 — 커서 하나로 "같은 문제 두 번 안 나옴"을 보장하기 위해서다.
        const order = shuffleQuestions(pool);
        useQuizStore.getState().setQuickDraw({
          certification: activeProduct,
          items: order.map((c) => ({ id: c.id, setId: c.setId })),
        });
        setCurrentQuestions(order.map((c) => withSource.get(c.id)).filter((q): q is Question => !!q));
      })
      .catch((err) => {
        console.error('Failed to load sets for quick', err);
        if (cancelled) return;
        setLoadError('문제 세트를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
        setCurrentQuestions([]);
      });
    return () => { cancelled = true; };
  }, [appData, mode, activeProduct, quickNonce, reloadKey]);

  useEffect(() => {
    if (!appData || !setId) return;
    // 퀵은 위 effect가 담당한다 — setId가 센티넬이라 아래 세트 조회는 성립하지 않는다.
    if (mode === 'quick') return;

    const targetSet = appData.sets.find((s) => s.id === setId);
    if (!targetSet) return;

    // 세트를 빠르게 전환하면 이전 요청이 늦게 도착해 현재 세트의 문항을
    // 덮어쓸 수 있다 — cleanup으로 이전 effect의 응답 반영을 취소한다.
    let cancelled = false;

    function applyMode(questions: Question[]) {
      if (mode === 'review') {
        // 복습 대상 산정은 reviewTargetIds가 단일 원천이다(퀵 제외 사양은 그쪽 주석 참고).
        const ids = reviewTargetIds(reviewIds, setId);
        // 이미 다시 풀어 맞힌 문항은 뺀다 — 아무리 맞혀도 목록이 줄지 않으면
        // "오답 발견 → 보완 → 재측정" 루프의 마지막 단계가 없는 것과 같다.
        const done = new Set(useQuizStore.getState().reviewedOk[setId] ?? []);
        const reviews = questions.filter(
          (q) => ids.has(q.id || `legacy-${q.number}`) && !done.has(q.number),
        );
        setCurrentQuestions(reviews);
      } else {
        // 챕터 집중 연습(Phase 3): 연습 모드에서 필터가 있으면 해당 챕터 문항만 노출.
        // 답안 키는 문항 id 기준이라 필터를 걸거나 풀어도 기존 답안이 오염되지 않는다.
        const filtered =
          mode === 'practice' && chapterFilter
            ? questions.filter((q) => q.chapter === chapterFilter)
            : questions;
        setCurrentQuestions(filtered);
      }
    }

    loadSetQuestions(targetSet.path)
      .then((questions) => {
        if (cancelled) return;
        setLoadError(null);
        applyMode(questions);
      })
      .catch((err) => {
        console.error('Failed to load set', err);
        if (cancelled) return;
        setLoadError('문제 세트를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
        // 이전 세트의 문항을 남기면 새 setId 아래 옛 문항이 표시되고
        // 답안이 새 세트 키로 저장돼 데이터가 오염된다 — 비워서 에러 UI로 전환한다.
        setCurrentQuestions([]);
      });
    return () => { cancelled = true; };
  }, [appData, setId, mode, reviewIds, chapterFilter, reloadKey, reviewedOk]);

  // 실패 배너의 "다시 시도" — 에러를 지우고 두 로드 effect를 재실행한다.
  const retryLoad = () => {
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  return { appData, currentQuestions, loadError, retryLoad };
}
