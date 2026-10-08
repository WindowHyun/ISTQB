import { answerKeyPrefix } from './answerKey';

/**
 * 세트 선택 시트가 그리는 데이터 — 순수 계층.
 *
 * 모바일의 세트 고르기는 시스템 `<select>` 대신 바텀 시트다. 시트는 세트를 종류별로 묶고
 * 짧은 이름과 풀이 진행을 보여 주는데, 이 값들은 index.json의 `title`(원제목)에서 **파생**한다.
 * 원제목은 PDF 출처 표기를 그대로 담고 있어 — `(공개답안) CSTS 2402FL`,
 * `SW 테스트 전문가(CSTS) 자격시험 예제문제_정답포함` — 한 줄에 다 들어오지 않는다.
 *
 * 이름을 데이터에 새로 적지 않고 규칙으로 파생하는 이유: 데이터 정본(`www/data/`)은 문항을
 * 고치는 도구가 다루는 영역이고, 표시 이름은 화면의 사정이다. 둘을 한 파일에 섞으면 화면을
 * 바꿀 때마다 데이터 계약(626문항·id)을 건드리게 된다. 대신 **규칙에 걸리지 않는 새 세트가
 * 들어오면 계약 테스트가 실패**하게 해(`recognized`) 이름을 정하는 순간을 놓치지 않는다.
 */

/** 표시 이름 계산에 필요한 최소 형태. */
export interface SetLike {
  certification: string;
  title: string;
}

export interface SetDisplay {
  /** 시트에서 같은 종류를 묶는 머리글 — 예: `공개답안 · FL`. */
  group: string;
  /** 행·헤더 제목에 쓰는 짧은 이름 — 예: `2402 FL`. 늘 이 이름만으로 세트를 가릴 수 있어야 한다. */
  name: string;
  /** 헤더의 작은 윗줄 — 예: `CSTS · 일반등급`. */
  context: string;
  /** 규칙에 걸렸는가. false면 원제목을 그대로 쓴 폴백이다. */
  recognized: boolean;
}

type Built = Omit<SetDisplay, 'recognized'>;

const RULES: { test: RegExp; build: (m: RegExpMatchArray, cert: string) => Built }[] = [
  {
    // `(공개답안) CSTS 2402FL`
    test: /^\(공개답안\)\s*CSTS\s+(\d{4})FL$/,
    build: (m, cert) => ({ group: '공개답안 · FL', name: `${m[1]} FL`, context: `${cert} · 공개답안` }),
  },
  {
    // `2018년도 CSTS 자격시험 예제(일반등급)`
    test: /^(\d{4})년도\s+CSTS\s+자격시험\s+예제\(일반등급\)$/,
    build: (m, cert) => ({ group: '일반등급 예제', name: `${m[1]} 일반등급 예제`, context: `${cert} · 일반등급` }),
  },
  {
    // `SW 테스트 전문가(CSTS) 자격시험 예제문제_정답포함`
    test: /^SW 테스트 전문가\(CSTS\) 자격시험 예제문제_정답포함$/,
    build: (_m, cert) => ({ group: '일반등급 예제', name: '예제문제 (정답 포함)', context: `${cert} · 일반등급` }),
  },
  {
    // `ISTQB FL v4.0 샘플문제 A` · `ISTQB FL v4.0 샘플문제 모음`
    test: /^ISTQB\s+FL\s+(v[\d.]+)\s+샘플문제\s+(\S+)$/,
    build: (m, cert) => ({
      group: `FL ${m[1]} 샘플문제`,
      name: `샘플문제 ${m[2]}`,
      context: `${cert} · FL ${m[1]}`,
    }),
  },
];

export function setDisplay(set: SetLike): SetDisplay {
  for (const rule of RULES) {
    const m = set.title.match(rule.test);
    if (m) return { ...rule.build(m, set.certification), recognized: true };
  }
  // 폴백: 원제목 그대로. 틀린 이름을 지어내느니 길더라도 정확한 이름을 보인다.
  return { group: set.certification, name: set.title, context: set.certification, recognized: false };
}

export interface SetGroup<T> {
  label: string;
  rows: { set: T; display: SetDisplay }[];
}

/** 세트를 종류별로 묶는다. 묶음·행의 순서는 입력(index.json) 순서를 그대로 따른다. */
export function groupSets<T extends SetLike>(sets: T[]): SetGroup<T>[] {
  const groups = new Map<string, SetGroup<T>>();
  for (const set of sets) {
    const display = setDisplay(set);
    let g = groups.get(display.group);
    if (!g) {
      g = { label: display.group, rows: [] };
      groups.set(display.group, g);
    }
    g.rows.push({ set, display });
  }
  return [...groups.values()];
}

/**
 * 풀이 진행으로 세는 모드. 연습과 시험만이다.
 *
 * 오답·퀵은 같은 문항을 **다시** 푸는 모드이고 랜덤은 일부를 뽑은 표본이라, 합치면 한 문항이
 * 두 번 세지거나 분모(세트 문항 수)와 맞지 않게 된다. 연습·시험은 세트 전체를 대상으로 하는
 * 모드이고 답안 네임스페이스도 모드마다 갈려 있어(answerKey), 같은 문항이 둘 다에 있어도
 * **문항 id 기준으로 한 번만** 센다.
 */
const PROGRESS_MODES = ['practice', 'exam'] as const;

/** 이 세트에서 연습·시험으로 답한 서로 다른 문항 id. */
export function solvedQuestionIds(answers: Record<string, string[]>, setId: string): Set<string> {
  const out = new Set<string>();
  for (const mode of PROGRESS_MODES) {
    const prefix = answerKeyPrefix(setId, mode);
    for (const [key, selected] of Object.entries(answers)) {
      if (!key.startsWith(prefix)) continue;
      // 빈 문자열만 든 칸(서답형 지운 뒤)은 답이 아니다.
      if (Array.isArray(selected) && selected.some((v) => String(v).trim() !== '')) {
        out.add(key.slice(prefix.length));
      }
    }
  }
  return out;
}

export function solvedCountForSet(answers: Record<string, string[]>, setId: string, total?: number): number {
  const n = solvedQuestionIds(answers, setId).size;
  // 문항 수가 줄어든 데이터가 옛 답안을 들고 있어도 분자가 분모를 넘지 않게 한다.
  return typeof total === 'number' ? Math.min(n, total) : n;
}

/** 시트 행의 진행 문구 — 예: `12 / 70 풀이` · `70문항 · 풀이 전`. */
export function setProgressText(solved: number, total: number | undefined): string {
  if (typeof total !== 'number') return solved > 0 ? `${solved}문항 풀이` : '풀이 전';
  return solved > 0 ? `${solved} / ${total} 풀이` : `${total}문항 · 풀이 전`;
}

/** 진행 막대 폭(0~100). 분모를 모르면 0. */
export function setProgressPercent(solved: number, total: number | undefined): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((solved / total) * 100)));
}
