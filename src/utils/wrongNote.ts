import type { ExamHistory } from '../store/useQuizStore';
import { overcomeNumbers } from './attemptStats';

/**
 * 오답노트 세트 그룹 — 여러 회차의 오답 합집합이라 특정 회차(ExamHistory)가 아니다.
 * 렌더에 필요한 필드만 담아 도메인 객체를 가짜 id로 위조하지 않는다.
 */
export interface WrongNoteSetView {
  setId: string;
  setTitle?: string;
  /** 이 세트를 푼 회차 수 — **만점 회차 포함**(아래 buildWrongNoteBySet 주석 참고). */
  attemptCount: number;
  /** 최근 회차 시각(정렬·표기). 역시 만점 회차 포함. */
  latestCreatedAt?: number;
  wrongItems: NonNullable<ExamHistory['wrongItems']>;
  /** '극복'(최근 시험 2회 연속 정답) 판정된 문항 번호. */
  overcome: Set<number>;
}

/** 이 회차가 해당 세트를 푼 회차인가 — 오답이 하나도 없는 만점 회차도 포함된다. */
function roundTouchesSet(h: ExamHistory, sid: string): boolean {
  // 일반 회차는 회차의 setId가 곧 출처다(만점이어도 성립).
  if (h.setId === sid) return true;
  // 퀵처럼 회차 setId가 센티넬인 경우에만 문항별 출처(wrongItems[].setId)로 판별한다.
  return (h.wrongItems ?? []).some((it) => it.setId === sid);
}

/**
 * 세트별 "전 회차 오답의 합집합"을 만든다.
 *
 * 최신 회차만 보여주면 같은 세트를 랜덤으로 재채점했을 때 이전 시험 회차의 오답이
 * 노트에서 사라진다. 같은 문항이 여러 회차에서 틀렸으면 가장 최근 회차의 내 답을 대표로 쓴다.
 *
 * 묶는 기준은 회차가 아니라 **문항의 출처 세트**다. 퀵 회차는 setId가 센티넬(QUICK)이고
 * 문항이 여러 세트에서 왔으므로, 회차 단위로 묶으면 서로 다른 세트의 오답이 '퀵 랜덤'
 * 한 덩어리가 된다 — 지문을 불러올 경로가 없어 번호만 뜨고, 번호가 겹치면 유실된다.
 *
 * ■ attemptCount·latestCreatedAt는 '오답이 있는 회차'가 아니라 **전 회차**로 센다
 *
 * 종전에는 오답을 모으는 목록(bySet)의 길이를 그대로 썼는데, 그 목록은 wrongItems가
 * 0건인 회차를 걸러낸 것이다. 그래서 세 번 응시하고 그중 한 번을 만점 맞으면
 * 통계 화면은 "응시 3회", 오답노트는 "전 회차 합산 2회"가 되어 같은 세트를 두고 두 화면이
 * 다른 숫자를 말했다. 라벨이 '전 회차'라고 말하는 이상 만점 회차도 세는 것이 맞다.
 * (바로 옆 overcome은 같은 함정을 이미 피하고 있었다 — 전 이력을 넘겨 판정한다.)
 *
 * 만점인 **퀵** 회차만은 셀 수 없다: 오답이 없으면 어느 세트에서 뽑았는지 기록이 남지
 * 않는다(회차 setId가 센티넬이라). 이건 데이터의 한계이지 이 함수의 판단이 아니다.
 */
export function buildWrongNoteBySet(
  histories: ExamHistory[],
  titleOf: (setId: string) => string | undefined,
): WrongNoteSetView[] {
  const bySet = new Map<string, ExamHistory[]>();
  for (const h of histories) {
    if ((h.wrongItems?.length ?? 0) === 0) continue;
    for (const sid of new Set((h.wrongItems ?? []).map((it) => it.setId ?? h.setId))) {
      const list = bySet.get(sid) ?? [];
      list.push(h);
      bySet.set(sid, list);
    }
  }

  const merged: WrongNoteSetView[] = [];
  for (const [sid, withWrongs] of bySet) {
    withWrongs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); // 최신 우선
    const items = new Map<number, NonNullable<ExamHistory['wrongItems']>[number]>();
    for (const h of withWrongs) {
      // 이 회차의 오답 중 지금 보고 있는 세트에서 온 것만 취한다.
      for (const it of (h.wrongItems ?? []).filter((x) => (x.setId ?? h.setId) === sid)) {
        if (!items.has(it.number)) items.set(it.number, it); // 최신 회차 기록이 대표
      }
    }
    const wrongList = Array.from(items.values()).sort((a, b) => a.number - b.number);

    // 만점 회차까지 포함한 모집단(위 주석 참고).
    const allRounds = histories.filter((h) => roundTouchesSet(h, sid));
    const latestCreatedAt = allRounds.reduce<number | undefined>(
      (acc, h) => (h.createdAt != null && (acc == null || h.createdAt > acc) ? h.createdAt : acc),
      undefined,
    );

    merged.push({
      setId: sid,
      // 제목은 index.json을 먼저 본다 — 퀵 회차의 setTitle('퀵 랜덤')을 그대로 쓰면
      // 출처 세트로 갈라 놓고도 그룹 이름이 전부 '퀵 랜덤'이 된다.
      // 세트가 index.json에서 빠진 경우를 위해 회차에 저장된 제목을 폴백으로 둔다.
      setTitle: titleOf(sid) ?? withWrongs.find((h) => h.setId === sid)?.setTitle,
      attemptCount: allRounds.length,
      latestCreatedAt,
      wrongItems: wrongList,
      // 극복 판정은 오답이 있는 회차만이 아니라 전 이력(만점 회차 포함) 기준이어야 한다.
      overcome: overcomeNumbers(histories, sid, wrongList.map((it) => it.number)),
    });
  }
  return merged.sort((a, b) => (b.latestCreatedAt || 0) - (a.latestCreatedAt || 0));
}

/**
 * 현재 제품(ISTQB/CSTS)의 이력만 고른다.
 *
 * IndexedDB 이력 저장소는 두 제품이 공유하므로 필터 없이는 다른 제품의 기록이 섞여 보인다.
 * 신규 기록은 certification 필드로 판별하고, 필드가 없는 과거 기록만 setId로 추론한다 —
 * 세트가 index.json에서 빠지거나 개명돼도 이력이 실종되지 않게 하려는 폴백이다.
 *
 * 종전에는 AppModals의 useMemo 안에 있었다. 모바일 상태 줄의 '오답 노트' 배지가 같은 모집단을
 * 세야 해서(배지 숫자와 노트에 실제로 나열되는 문항 수가 달라지면 버튼이 거짓말을 한다)
 * 한 곳으로 꺼냈다.
 */
export function selectProductHistories(
  histories: Record<string, ExamHistory>,
  productSetIds: ReadonlySet<string>,
  activeProduct: string | null,
): Record<string, ExamHistory> {
  const out: Record<string, ExamHistory> = {};
  for (const [id, h] of Object.entries(histories)) {
    const owns = h.certification ? h.certification === activeProduct : productSetIds.has(h.setId);
    if (owns) out[id] = h;
  }
  return out;
}

export type WrongItem = NonNullable<ExamHistory['wrongItems']>[number];

/** 오답 노트의 '최근 퀵 오답' 한 줄 — 세트 그룹과 섞이지 않는 별도 목록이다. */
export interface QuickWrongEntry {
  setId: string;
  setTitle: string;
  item: WrongItem;
}

/**
 * 최근 퀵 오답 — 세트 그룹과 섞지 않는다(퀵은 세트를 다 푼 것이 아니다).
 *
 * 같은 문항(출처 세트 + 번호)이 여러 회차에서 틀렸으면 **가장 최근 회차**의 기록이 대표다.
 * 정렬은 세트 이름(가나다) → 문항 번호. 보기 전용 목록이라 상세 진입을 두지 않는다:
 * 퀵은 여러 세트에서 뽑히므로 문항 번호가 겹치는데(A세트 3번·B세트 3번) 번호로 상세를
 * 찾는 기존 경로로는 구분할 수 없다.
 */
export function buildQuickWrongs(
  rounds: ExamHistory[],
  titleOf: (setId: string) => string | undefined,
): QuickWrongEntry[] {
  const newestFirst = [...rounds].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const seen = new Map<string, QuickWrongEntry>();
  for (const r of newestFirst) {
    for (const it of r.wrongItems ?? []) {
      const sid = it.setId ?? r.setId;
      const key = `${sid}:${it.number}`;
      if (seen.has(key)) continue;
      seen.set(key, { setId: sid, setTitle: titleOf(sid) ?? sid, item: it });
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.setTitle.localeCompare(b.setTitle, 'ko') || a.item.number - b.item.number);
}

/**
 * 오답 노트가 나열하는 문항의 총수 — 퀵 오답 + 세트별 오답.
 *
 * 상태 줄의 '오답 노트 N' 배지는 이 값이다. 배지는 누르면 열리는 화면의 크기를 예고하므로
 * 다른 모집단(예: 현재 세트의 오답만)을 세면 "4라더니 열어 보니 17개"가 된다.
 * '극복' 표시가 붙은 문항도 노트에는 남아 있으므로(흐리게 표시) 세는 데 포함한다.
 */
export function countWrongNote(sets: WrongNoteSetView[], quick: QuickWrongEntry[]): number {
  return quick.length + sets.reduce((n, s) => n + (s.wrongItems?.length ?? 0), 0);
}

/** 오답 보기 화면이 이동에 쓰는 최소 형태(스토어 wrongView의 부분집합). */
export interface WrongViewSibling {
  number: number;
  qid?: string;
  myAnswer: string[];
  correctAnswer: string[];
}

/**
 * 형제 목록에서 지금 보고 있는 문항의 자리를 찾는다. 없으면 -1.
 *
 * **id를 번호보다 먼저 본다.** 문항 번호는 세트마다 겹치고, 한 세트 안에서도 재수록·개편으로
 * 같은 번호가 둘일 수 있다. 번호로만 찾으면 3번을 눌렀는데 다른 3번이 잡힌다 —
 * `WrongViewScreen`이 문항 자체를 찾을 때 쓰는 규칙과 같다(qid 우선, 없으면 번호).
 *
 * 양쪽 다 qid가 있을 때만 qid로 비교한다. 옛 기록에는 qid가 없어(번호만 남았다) 그때는
 * 번호로 내려가야 하고, 한쪽만 있는 상태에서 qid를 강요하면 옛 기록이 통째로 -1이 된다.
 */
export function wrongViewIndex(
  siblings: WrongViewSibling[],
  current: { number: number; qid?: string },
): number {
  return siblings.findIndex((s) =>
    (current.qid && s.qid ? s.qid === current.qid : s.number === current.number));
}

/**
 * 이전/다음 오답 문항으로 옮긴 결과를 돌려준다. 끝을 넘어가면 null(이동 없음).
 *
 * 경계에서 null을 주는 것이 이 함수의 계약이다 — 호출부가 버튼 비활성만으로 막으면
 * 키보드·프로그램 호출 경로가 열린 채로 남아 목록 밖으로 걸어 나간다.
 */
export function wrongViewStep(
  siblings: WrongViewSibling[],
  current: { number: number; qid?: string },
  delta: number,
): WrongViewSibling | null {
  const at = wrongViewIndex(siblings, current);
  if (at < 0) return null;
  return siblings[at + delta] ?? null;
}
