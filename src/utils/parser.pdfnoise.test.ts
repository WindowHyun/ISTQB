import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDF_JOIN_RULES } from './parser';

/**
 * PDF 낱말 결합 규칙 — 626문항 전수 대조.
 *
 * `stripPdfNoise`의 결합 규칙은 조건 없는 전역 치환이라, 의도한 아티팩트만이 아니라
 * **정상 문장의 낱말 경계까지 붙일 수 있다.** 실제로 그랬다: `/할\s+인/`이
 * "참여할 인력" · "진행할 인력과" · "수행할 인적"을 붙여 4문항의 지문이 화면에서
 * 깨져 보였다(데이터는 멀쩡했고 렌더러가 깨뜨렸다).
 *
 * 이 결함은 어떤 게이트에도 걸리지 않았다:
 *   - `verify-pdf-data.py`의 `norm()`은 비교 전에 공백을 전부 제거한다 → 원리적으로 못 본다.
 *   - E2E는 이 문자열들을 단언하지 않는다.
 *   - 유닛은 규칙표에 닿은 적이 없었다(함수 안에 체이닝으로 묻혀 있었다).
 *
 * 그래서 여기서 **규칙이 실제 데이터의 어디에 발동하는지를 값으로 고정한다.**
 * 규칙을 추가하거나 넓히면 이 검사가 먼저 답한다 — 새 발동 지점은 전부
 * ALLOWED에 근거와 함께 적어야 통과한다.
 */

const dataRoot = path.resolve(process.cwd(), 'www/data');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dataRoot, rel), 'utf8'));
const index = readJson('index.json');

interface Q {
  number: number;
  stem?: unknown;
  explanation?: unknown;
  options?: { text?: string }[];
}

/** 문항에서 사용자에게 보이는 문자열을 전부 모은다(중첩 블록 포함). */
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
  const questions = readJson(set.path.replace(/^\.\//, '')).questions as Q[];
  for (const q of questions) {
    for (const text of textsOf(q)) corpus.push({ setId: set.id, number: q.number, text });
  }
}

/**
 * 결합 규칙이 발동해도 되는 지점 — 전부 원본 PDF 추출 아티팩트다.
 * `"세트:번호:붙인결과"` 형식. 새 항목을 넣을 때는 **데이터가 아니라 PDF가 깨뜨린 것**임을
 * 확인하고 넣는다(데이터가 정상이면 규칙을 좁히는 것이 맞다).
 */
const ALLOWED = new Set([
  'ISTQB-FL-V4-B:1:시간',        // "테스트에 시 간을 쓴다면"
  'ISTQB-FL-V4-C:3:실무',        // "다음 중 실 무에서"
  'ISTQB-FL-V4-D:2:시간',        // "엄청난 시 간적 압박"
  'ISTQB-FL-V4-D:20:할인',       // "다음과 같이 할 인 유형을 계산한다"
  'ISTQB-FL-V4-D:31:실행하는',   // "한 명의 테스터가 실행 하는 데"
  'ISTQB-FL-V4-D:31:시간',       // "필요한 시 간의 최종 추정치"
  'ISTQB-FL-V4-EXTRA:22:할인',   // "너무 높은 할 인을 허용할 수 있다"
  'CSTS-FL-2404:25:테스트 케이스', // "최소 테스트 케이 스 수는?"
  'ISTQB-FL-V4-C:4:두(2)개',     // "<u>두(2) 개를</u> 고르시오" — 밑줄 구간 안에서 갈라진 조각
]);

/** /g 정규식은 lastIndex를 들고 다니므로 검사마다 새로 만든다. */
const fresh = (re: RegExp) => new RegExp(re.source, re.flags);

describe('PDF 낱말 결합 규칙 — 전수 발동 지점', () => {
  it('626문항의 모든 텍스트를 대상으로 검사한다(표본이 비면 검사가 헛돈다)', () => {
    expect(corpus.length).toBeGreaterThan(3000);
    expect(PDF_JOIN_RULES.length).toBeGreaterThan(20);
  });

  it('허용 목록 밖에서는 어떤 규칙도 발동하지 않는다', () => {
    const unexpected: string[] = [];
    for (const { setId, number, text } of corpus) {
      for (const [pattern, replacement] of PDF_JOIN_RULES) {
        const hits = text.match(fresh(pattern));
        if (!hits) continue;
        for (const hit of hits) {
          // 공백이 끼지 않은 매치는 '붙이는' 동작이 아니다(이미 붙어 있는 낱말).
          if (!/\s/.test(hit)) continue;
          const joined = hit.replace(fresh(pattern), replacement);
          const key = `${setId}:${number}:${joined}`;
          if (ALLOWED.has(key)) continue;
          const at = text.indexOf(hit);
          unexpected.push(
            `${key}  …${text.slice(Math.max(0, at - 24), at + hit.length + 24).replace(/\s+/g, ' ')}…`,
          );
        }
      }
    }
    expect(unexpected, `허용되지 않은 결합 ${unexpected.length}건:\n${unexpected.join('\n')}`)
      .toEqual([]);
  });

  it('허용 목록의 항목은 실제로 데이터에 존재한다(죽은 예외를 남기지 않는다)', () => {
    const fired = new Set<string>();
    for (const { setId, number, text } of corpus) {
      for (const [pattern, replacement] of PDF_JOIN_RULES) {
        for (const hit of text.match(fresh(pattern)) ?? []) {
          if (!/\s/.test(hit)) continue;
          fired.add(`${setId}:${number}:${hit.replace(fresh(pattern), replacement)}`);
        }
      }
    }
    expect([...ALLOWED].filter((k) => !fired.has(k))).toEqual([]);
  });
});

/**
 * `할 인` 규칙의 경계 — 오작동 4건이 실제로 사라졌는지 문자열로 못 박는다.
 * 위 전수 검사가 이미 이것을 포함하지만, 회귀했을 때 **무엇이 왜 깨졌는지**를
 * 실패 메시지가 바로 말해 주도록 따로 둔다.
 */
describe("'할 인' 규칙 — 정상 낱말은 붙이지 않는다", () => {
  const join = (text: string) => {
    let out = text;
    for (const [pattern, replacement] of PDF_JOIN_RULES) out = out.replace(fresh(pattern), replacement);
    return out;
  };

  it.each([
    ['리뷰 대상을 결정하고 리뷰에 참여할 인력, 리뷰 시간 등', '참여할 인력'],
    ['테스트를 진행할 인력과 조직 및 수행 일정을 정의한다.', '진행할 인력'],
    ['테스트를 수행할 인적 자원에 대한 역량 및 역할을 결정한다', '수행할 인적'],
  ])('정상 문장을 그대로 둔다: %s', (text, keep) => {
    expect(join(text)).toContain(keep);
  });

  it.each([
    ['현재 연도(CY)를 기준으로 다음과 같이 할 인 유형을 계산한다', '할인 유형'],
    ['시스템이 고객에게 너무 높은 할 인을 허용할 수 있다.', '할인을'],
  ])('진짜 PDF 아티팩트는 계속 고친다: %s', (text, fixed) => {
    expect(join(text)).toContain(fixed);
  });
});
