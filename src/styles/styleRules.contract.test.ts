import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * 스타일 규칙이 없는 버튼 — 화면이 브라우저 기본 모양으로 나간다.
 *
 * `<button className="sc-minitest">`에 대응하는 CSS 규칙이 한 줄도 없어서 학습 통계의 '미니 시험'이 한동안
 * 브라우저 기본 회색 버튼으로 나갔다. 옆의 '연습'은 규칙이 있어 둘이 서로 다른 앱의 버튼처럼 보였고, 모바일
 * 그리드가 3칸인데 자식이 4개라 혼자 아랫줄로 떨어지기까지 했다. 눌러지고 동작하므로 기능 검사는 모두 통과한다 —
 * 눈으로 보지 않으면 걸러 낼 길이 없던 결함 유형이다.
 *
 * 검사: className을 가진 `<button>`의 클래스 중 **하나라도** globals.css에 `.클래스` 규칙이 있어야 한다
 * (`className="primary"`처럼 변형 클래스만 단 버튼도 그 클래스를 쓰는 규칙이 있으면 통과한다).
 * 새 버튼을 만들면 같은 커밋에 규칙을 넣는다.
 *
 * 범위: **정적으로 읽히는 클래스만** 본다 — 문자열·삼항·`&&`·템플릿의 정적 조각·`clsx({ on: x })`의 키.
 * `className={변수}`·`classes.join(' ')`처럼 값이 실행 때 정해지는 버튼은 읽을 수 없어 건너뛴다
 * (`btn-${kind}`의 `btn-`처럼 보간에 붙은 조각도 이름의 일부일 뿐이라 건너뛴다).
 */

type Usage = { line: number; tokens: string[] };

/** className 식에서 정적으로 읽히는 클래스 이름 후보. 식 안에 보이는 문자열은 모두 후보로 본다(과대 추정은 통과 쪽으로만 기운다). */
function classTokens(node: ts.Node): string[] {
  const out: string[] = [];
  const add = (text: string) => out.push(...text.split(/\s+/).filter(Boolean));
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      add(n.text);
    } else if (ts.isTemplateExpression(n)) {
      // `btn-${kind} on` — 보간 옆에 붙은 조각('btn-')은 이름의 일부라 버린다. 센티널로 이어 붙인 뒤 센티널이 든 토큰을 거른다.
      let text = n.head.text;
      for (const span of n.templateSpans) text += `\u0000${span.literal.text}`;
      add(text);
      n.templateSpans.forEach((span) => visit(span.expression));
      return;
    } else if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
      // clsx({ active: on }) — 키가 클래스 이름이다.
      if (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) add(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out.filter((t) => !t.includes('\u0000'));
}

/** 소스에서 className이 달린 `<button>`의 (줄 번호, 클래스 토큰들). 읽을 수 있는 토큰이 없는 버튼은 건너뛴다. */
export function buttonClassUsages(source: string, fileName = 'x.tsx'): Usage[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Usage[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(sf) === 'button') {
      for (const attr of n.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || attr.name.getText(sf) !== 'className' || !attr.initializer) continue;
        const tokens = classTokens(attr.initializer);
        if (tokens.length) out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, tokens });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** CSS에 규칙으로 등장하는 클래스 이름. 주석과 url(...)(데이터 URI 안의 `.org` 같은 것)은 먼저 걷어 낸다. */
export function cssClasses(css: string): Set<string> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/url\([^)]*\)/g, ' ');
  return new Set([...bare.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
}

/** 규칙이 없는 클래스만 단 버튼. */
export function unstyledButtons(source: string, known: Set<string>, fileName?: string) {
  return buttonClassUsages(source, fileName).filter((u) => !u.tokens.some((t) => known.has(t)));
}

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.name.endsWith('.tsx') ? [p] : [];
  });
}

describe('스타일 규칙이 없는 버튼 (src/**/*.tsx ↔ src/styles/globals.css)', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');
  const known = cssClasses(css);
  const root = path.resolve(process.cwd(), 'src');

  it('className을 단 모든 버튼은 그 클래스 중 하나 이상의 CSS 규칙이 있다', () => {
    const violations = tsxFiles(root).flatMap((file) =>
      unstyledButtons(fs.readFileSync(file, 'utf8'), known, file).map(
        (u) => `${path.relative(process.cwd(), file)}:${u.line} className="${u.tokens.join(' ')}"`,
      ),
    );
    expect(violations, '규칙이 없는 버튼 — globals.css에 규칙을 추가하세요(브라우저 기본 버튼으로 나갑니다)').toEqual([]);
  });

  it('검사 대상을 실제로 읽는다(버튼도 클래스도 0개면 위 검사가 늘 통과한다)', () => {
    const total = tsxFiles(root).reduce((n, f) => n + buttonClassUsages(fs.readFileSync(f, 'utf8'), f).length, 0);
    expect(total).toBeGreaterThan(30);
    expect(known.has('sc-minitest')).toBe(true);
    expect(known.has('mtb-wrong')).toBe(true);
  });
});

describe('버튼 스캐너', () => {
  const known = new Set(['primary', 'btn', 'on']);

  it('규칙이 없는 클래스만 단 버튼을 줄 번호와 함께 돌려준다', () => {
    const src = '<div>\n  <button type="button" className="ghost-btn">x</button>\n</div>';
    expect(unstyledButtons(src, known)).toEqual([{ line: 2, tokens: ['ghost-btn'] }]);
  });

  it('클래스 중 하나라도 규칙이 있으면 통과한다', () => {
    expect(unstyledButtons('<button className="primary extra">x</button>', known)).toEqual([]);
  });

  it('className이 없는 버튼은 보지 않는다(전역 button 스타일에 맡긴 것)', () => {
    expect(unstyledButtons('<button type="button" onClick={go}>x</button>', known)).toEqual([]);
  });

  it('속성의 `=>`와 문자열 속 `>`를 태그 끝으로 읽지 않는다(그 뒤의 className까지 읽는다)', () => {
    const arrow = '<button onClick={() => a > b} className="zzz">x</button>';
    expect(unstyledButtons(arrow, known).map((u) => u.tokens)).toEqual([['zzz']]);
    const inString = '<button title="a > b" className="zzz">x</button>';
    expect(unstyledButtons(inString, known).map((u) => u.tokens)).toEqual([['zzz']]);
  });

  it('여러 줄로 쪼갠 속성에서도 className을 찾는다', () => {
    const src = '<button\n  type="button"\n  disabled={locked}\n  className="zzz"\n  onClick={() => go()}\n>x</button>';
    expect(unstyledButtons(src, known)).toHaveLength(1);
  });

  it('삼항·논리식·함수 호출 안의 문자열도 읽는다 — 어느 갈래든 규칙이 없으면 걸린다', () => {
    expect(unstyledButtons('<button className={on ? "zzz" : "yyy"}>x</button>', known).map((u) => u.tokens)).toEqual([['zzz', 'yyy']]);
    expect(unstyledButtons('<button className={on ? "primary" : undefined}>x</button>', known)).toEqual([]);
    expect(unstyledButtons('<button className={clsx("zzz", on && "yyy")}>x</button>', known)).toHaveLength(1);
    expect(unstyledButtons('<button className={clsx({ zzz: on })}>x</button>', known)).toHaveLength(1);
    expect(unstyledButtons('<button className={clsx({ on })}>x</button>', known)).toEqual([]);
  });

  it('템플릿 리터럴은 정적인 토큰만 본다 — 보간에 붙은 조각은 이름의 일부라 버린다', () => {
    expect(unstyledButtons('<button className={`btn ${on ? "x" : ""}`}>x</button>', known)).toEqual([]);
    expect(unstyledButtons('<button className={`ghost ${on ? "x" : ""}`}>x</button>', known)).toHaveLength(1);
    // `btn-${kind}`의 'btn-'은 '.btn-primary'·'.btn-secondary'의 앞부분이다 — 규칙이 없다고 걸면 거짓 경보다.
    expect(unstyledButtons('<button className={`btn-${kind}`}>x</button>', known)).toEqual([]);
    expect(unstyledButtons('<button className={`${kind}-btn`}>x</button>', known)).toEqual([]);
  });

  it('값을 알 수 없는 className(변수·join 결과)은 건너뛴다', () => {
    expect(unstyledButtons('<button className={className}>x</button>', known)).toEqual([]);
    expect(unstyledButtons('<button className={classes.join(" ")}>x</button>', known)).toEqual([]);
  });

  it('<buttonGroup>·<button-group>·<motion.button> 같은 다른 태그는 버튼이 아니다', () => {
    expect(unstyledButtons('<buttonGroup className="zzz" />', known)).toEqual([]);
    expect(unstyledButtons('<button-group className="zzz" />', known)).toEqual([]);
    expect(unstyledButtons('<motion.button className="zzz" />', known)).toEqual([]);
  });

  it('자기 닫는 `<button />`도 읽는다', () => {
    expect(unstyledButtons('<button className="zzz" />', known)).toHaveLength(1);
  });

  it('CSS의 주석·url() 안에 적힌 이름은 규칙으로 치지 않는다', () => {
    const css = '/* .ghost-btn */ .a { background: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'%3E") }';
    const classes = cssClasses(css);
    expect(classes.has('ghost-btn')).toBe(false);
    expect(classes.has('org')).toBe(false);
    expect(classes.has('a')).toBe(true);
  });
});
