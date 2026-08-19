import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isGenericCodeLine } from './parser';

/**
 * 태그 없는 코드 판정 — 626문항 전수 대조.
 *
 * `normalizeGenericCodeBlocks`는 코드로 보이는 줄이 **세 줄 이상** 이어지면 그 구간을
 * 어두운 고정폭 블록으로 바꾼다. 판정이 틀리는 방향이 중요하다: 코드를 산문으로 두면
 * 읽기 조금 불편할 뿐이지만, 산문을 코드로 그리면 지문이 통째로 깨져 보인다.
 *
 * 종전 판정은 `/[;{}]/` 하나로 줄 어디에든 세미콜론·중괄호가 있으면 코드로 봤는데,
 * 테스팅 교재에서 그 둘은 산문에 흔하다(동등 분할의 집합 표기, 목록을 여는 세미콜론,
 * 표를 한 줄로 편 것). 어떤 게이트도 이 방향을 보지 않았다 — 렌더러가 만드는 모양이라
 * 데이터 검증(verify-pdf-data·validate-questions)의 사정권 밖이다.
 *
 * 그래서 **실제 데이터에서 블록이 만들어지는 구간을 값으로 고정한다.** 판정을 넓히면
 * 이 검사가 먼저 답한다.
 */

const dataRoot = path.resolve(process.cwd(), 'www/data');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dataRoot, rel), 'utf8'));
const index = readJson('index.json');

interface Q { number: number; stem?: unknown; explanation?: unknown; options?: { text?: string }[] }

function textsOf(q: Q): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (v == null) return;
    if (typeof v === 'string') { out.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') { Object.values(v as Record<string, unknown>).forEach(walk); }
  };
  walk(q.stem);
  walk(q.explanation);
  for (const o of q.options ?? []) if (typeof o.text === 'string') out.push(o.text);
  return out;
}

const corpus: { setId: string; number: number; text: string }[] = [];
for (const set of index.sets as { id: string; path: string }[]) {
  for (const q of readJson(set.path.replace(/^\.\//, '')).questions as Q[]) {
    for (const text of textsOf(q)) corpus.push({ setId: set.id, number: q.number, text });
  }
}

/** normalizeGenericCodeBlocks가 블록으로 바꾸는 조건과 같은 규칙(3줄 연속). */
function codeRuns(text: string): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const line of text.split('\n')) {
    const value = line.trim();
    if (isGenericCodeLine(value)) { run.push(value); continue; }
    if (run.length >= 3) runs.push(run);
    run = [];
  }
  if (run.length >= 3) runs.push(run);
  return runs;
}

describe('태그 없는 코드 판정 — 전수', () => {
  it('626문항의 모든 텍스트를 검사한다(표본이 비면 검사가 헛돈다)', () => {
    expect(corpus.length).toBeGreaterThan(3000);
  });

  // 지금은 태그 없는 코드가 데이터에 없다 — 진짜 코드는 전부 type:"code" 블록으로
  // 태깅돼 다른 경로로 그려진다. 그래서 이 판정이 만드는 블록은 **전부 오탐**이다.
  // 하나라도 생기면 그 문항의 지문이 화면에서 코드로 둔갑한다.
  it('산문을 코드 블록으로 만들지 않는다', () => {
    const hits: string[] = [];
    for (const { setId, number, text } of corpus) {
      for (const run of codeRuns(text)) {
        hits.push(`${setId}:${number}  ${run.slice(0, 3).join(' ⏎ ').slice(0, 140)}`);
      }
    }
    expect(hits, `산문이 코드 블록이 된 구간 ${hits.length}건:\n${hits.join('\n')}`).toEqual([]);
  });
});

/**
 * 경계 — 실제 코퍼스에서 뽑은 문자열로 양쪽을 못 박는다.
 * 위 전수 검사는 "지금 0건"만 말해 주므로, 판정을 통째로 꺼도(항상 false) 통과한다.
 * 진짜 코드까지 놓치지 않는지는 여기서 본다.
 */
describe('코드 줄 판정 — 경계', () => {
  it.each([
    ['Bool p;', 'C 선언'],
    ['puts("p is true");', 'C 호출'],
    ['If ((x>1) and (y==1)){', '의사코드 분기'],
    ['int a = 1;', '선언 + 대입'],
    ['{', '블록 여는 중괄호'],
    ['}', '블록 닫는 중괄호'],
    ['READ x', '의사코드 키워드'],
    ['x = y + 1', '대입'],
  ])('코드로 본다: %s (%s)', (line) => {
    expect(isGenericCodeLine(line)).toBe(true);
  });

  it.each([
    ['리스크 발생 가능성: 중간; 리스크 영향도: 높음', '세미콜론으로 나눈 산문'],
    ['아래와 같은 테스트웨어 유형이 주어지고;', '목록을 여는 세미콜론'],
    ['TC1: 19세, 경험이 없는 미등록 남성; 기대 결과: 분류 A', '표를 한 줄로 편 것'],
    ['세 개의 동등 분할이 있습니다: {..., -2, -1}, {0, 1, 2}, {3, 4,...}.', '집합 표기가 섞인 산문'],
    ['{26, 30, 41, 52, 55}', '집합 표기만 있는 줄'],
    ['{19, 22, 35, 57, null}', 'null이 섞인 집합 표기'],
    ['테스트 케이스가 {(x=2, y=0, z=1)}이면 조건 커버리지는 얼마인가?', '괄호가 섞인 집합 표기 산문'],
    ['다음 중 가장 적절한 것은?', '평범한 산문'],
  ])('산문으로 본다: %s (%s)', (line) => {
    expect(isGenericCodeLine(line)).toBe(false);
  });
});
