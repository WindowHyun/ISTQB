# 문제 데이터 ↔ 원본 PDF 정합성 게이트 (CI: pdf-data job / 로컬: python3 scripts/verify-pdf-data.py)
#
# 배포 전 수동 전수 검수(2026-07)에서 쓴 대조 로직을 상시 게이트로 옮긴 것.
# 여섯 축을 검사하며, 하나라도 어긋나면 종료 코드 1로 실패한다:
#   [1] 텍스트 — JSON의 모든 스템·보기·해설 조각이 원본 PDF 텍스트에 존재하는가
#   [2] 정답  — PDF에서 독립 추출한 정답(626문항)과 JSON answer가 일치하는가
#   [3] 밑줄  — PDF 밑줄 선분에서 역산한 강조 위치가 해당 문항 JSON에 <u>로 존재하는가
#   [4] 역방향 — PDF 본문의 문장 줄이 해당 문항 JSON에 남아 있는가(지문이 잘리지 않았는가)
#   [5] 해설  — ISTQB 해설이 정답과 해설 PDF의 행과 글자 단위로 같은가, CSTS 2018 해설이 빠지지 않았는가
#   [6] 줄바꿈 공백 — PDF 줄바꿈 자리의 공백(낱말 중간 공백·빠진 띄어쓰기)이 JSON과 같은가
#
# [1]은 "JSON에 있는 것이 PDF에 있는가"만 본다 — 지문이 중간에서 끊겨도 남은 앞부분은 PDF에
# 있으니 통과한다(CSTS 2404FL 70번이 첫 문장 중간에서 잘려 있었다). [4]가 그 반대 방향이다.
#
# 의도적 예외(원문 재구성 등)는 ALLOW에 문서화한다 — 몰래 지나가는 예외 금지.
# 요구사항: pip install pymupdf
import json, re, sys, unicodedata
from pathlib import Path

try:
    import fitz  # pymupdf
except ImportError:
    print("pymupdf가 필요합니다: pip install pymupdf", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "DATA"
WWW = ROOT / "www" / "data"
CS = DATA / "(공개답안) CSTS 2404FL"

# 의도적 불일치 허용 목록: (검사축, 세트파일, 문항번호, 사유)
ALLOW = {
    ("text", "istqb/sample-b.json", 25): "분기 커버리지 계산식 문단 — 원문 수식·문장을 읽기 좋게 재구성(검수 승인)",
}

# 해설 축 예외: 원본 PDF 해설의 오탈자를 JSON이 바로잡아 둔 곳(PDF를 눈으로 확인). 데이터가 맞고 PDF가 틀렸다.
# 문항 전체를 면제하지 않는다 — 비교 전에 JSON 쪽의 이 앞뒤 글만 PDF의 오탈자 모양으로 되돌려 놓고,
# 나머지 글자는 그대로 맞춘다. (세트, 문항): (JSON 글, PDF 글, 사유) — 공백·문장부호는 비교 때 지워진다.
EXPL_TYPO = {
    ("istqb/sample-b.json", 6): ("있어야 하기 때문입니다", "있어야 k기 때문입니다", "PDF 글리프 깨짐"),
    ("istqb/sample-c.json", 4): ("모니터링은 테스트 기법의", "모니터링은은 테스트 기법의", "PDF 조사 중복 오탈자"),
    ("istqb/sample-extra.json", 7): ("초기에 테스트 계획을", "초기에 태스트 계획을", "PDF 오탈자"),
}


def with_pdf_typo(rel, number, text):
    """JSON 해설 글을 PDF의 알려진 오탈자 모양으로 되돌린다(비교용). 앞뒤 글이 없으면 그대로 둔다."""
    typo = EXPL_TYPO.get((rel, number))
    if not typo:
        return text
    good, bad, _ = typo
    return text.replace(norm(good), norm(bad), 1)


FAILS = []


def fail(msg):
    FAILS.append(msg)


def raw(p):
    return re.sub(r"[\x00-\x1f\x7f]", " ", "".join(pg.get_text() for pg in fitz.open(p)))


def norm(s):
    s = re.sub(r"</?(u|b|i|em|strong|br|sub|sup)\s*/?>", "", s, flags=re.I)
    s = re.sub(r"[\x00-\x1f\x7f]", "", s)
    s = re.sub(r"[\ue000-\uf8ff]", "", s)  # 기호 글꼴(Symbol)의 글머리 기호 등 사용자 정의 영역 글리프
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"[*_`|#<>≤≥≦≧~∼〜～\-—–―·•∙‧ㆍ→⇒➔⟶↔=＝+±×÷※√°%‰&]", "", s)
    s = re.sub(r"[“”\"'‘’′″˝]", "", s)
    s = re.sub(r"[()\[\]{}〈〉《》「」『』【】]", "", s)
    s = re.sub(r"[.,:;?!…⋯]", "", s)
    s = re.sub(r"\s+", "", s)
    return s.lower()


ISTQB_PDF = {
    "A": ("ISTQB_FL_v4.0_샘플문제_A_v1.7_한글_v1.0.pdf", "ISTQB_FL_v4.0_샘플문제_A_v1.7_정답과_해설_한글_v1.0.pdf"),
    "B": ("ISTQB_FL_v4.0_샘플문제_B_v1.7_한글_v1.0.pdf", "ISTQB_FL_v4.0_샘플문제_B_v1.7_정답과_해설_한글_v1.0.pdf"),
    "C": ("ISTQB_FL_v4.0_샘플문제_C_v1.6_한글_v1.0.pdf", "ISTQB_FL_v4.0_샘플문제_C_v1.6_정답과_해설_한글_v1.0.pdf"),
    "D": ("ISTQB_FL_v4.0_샘플문제_D_v1.5_한글_v1.0.1.pdf", "ISTQB_FL_v4.0_샘플문제_D_v1.5_정답과_해설_한글_v1.0.pdf"),
}
CSTS_SETS = [
    ("csts-2402-fl.json", "(공개답안) CSTS 2402FL.pdf", 70),
    ("csts-2403-fl.json", "(공개답안) CSTS 2403FL.pdf", 70),
    ("csts-2404-fl.json", "(공개답안) CSTS 2404FL.pdf", 70),
    ("csts-2405-fl.json", "(공개답안) CSTS 2405FL.pdf", 70),
    ("csts-2018-general.json", "2018년도 CSTS 자격시험 예제(일반등급).pdf", 20),
    ("csts-2019-general.json", "2019년도 CSTS 자격시험 예제(일반등급).pdf", 70),
    ("csts-example-answer-included.json", "SW 테스트 전문가(CSTS) 자격시험 예제문제_정답포함.pdf", 70),
]


def load(rel):
    return json.loads((WWW / rel).read_text())


PLACEHOLDER = "원본 공개답안 PDF 기준 정답입니다."  # PDF에 해설이 없는 CSTS 세트의 자리표시 문구


def expl_fragments(q):
    """해설의 글 조각 목록(자리표시 문구 제외, 표 칸 포함)."""
    ex = q.get("explanation")
    if isinstance(ex, str):
        return [] if ex == PLACEHOLDER else [ex]
    out = []
    for b in ex if isinstance(ex, list) else []:
        if b.get("type") == "list":
            for it in b.get("items", []):
                out.append(it if isinstance(it, str) else " ".join(filter(None, [it.get("marker"), it.get("text")])))
        elif b.get("type") == "table":
            out.extend(c for r in b.get("rows", []) for c in r if isinstance(c, str))
        elif isinstance(b.get("text"), str) and b["text"] != PLACEHOLDER:
            out.append(b["text"])
    return out


# ───────────────────── 코드 줄·표 칸 (연산자·위치를 지키는 대조) ─────────────────────
# norm()은 + - = 같은 기호를 지워서 "Z = X + Y"와 "Z = X - Y"를 구분하지 못한다. 코드 줄은 공백만 지운 글로,
# 표는 PDF의 표 격자(find_tables)와 칸 단위로 맞춘다.
def canon(s):
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = re.sub(r"[\x00-\x1f\x7f\ue000-\uf8ff]", "", s)
    s = re.sub(r"[–—−‐]", "-", s)
    s = re.sub(r"[“”‘’]", '"', s)
    return re.sub(r"\s+", "", s)


def fold_rows(grid):
    """첫 칸이 비어 있는 행은 앞 행의 이어짐이다 — 앞 행에 접는다."""
    out = []
    for r in grid:
        if out and not (r[0] or "").strip() and any((c or "").strip() for c in r[1:]):
            out[-1] = [(a or "") + (b or "") for a, b in zip(out[-1], r)]
        else:
            out.append(list(r))
    return out


def code_block_ok(lines, qlines, other):
    """코드 블록이 그 문항의 PDF 줄을 이은 글(공백 무시)에 들어 있고, 그 구간의 경계가 맞는가.
    포함만 보면 프로그램의 앞뒤 문장을 지우거나 "Z = X + Y"를 "Z = X"로 잘라도 통과한다. 그래서
      ① 일치 구간은 PDF 줄의 처음에서 시작해 줄의 끝에서 끝나야 하고(데이터가 한 줄을 나눈 것은 허용),
      ② 구간 바로 앞뒤의 PDF 줄은 없거나 지문의 다른 글(other = 코드를 뺀 그 문항 JSON 글)에 있어야 한다.
    코드 옆에 표가 나란히 놓인 쪽은 같은 열(x가 가까운 줄)끼리 이은 글도 후보로 쓴다. 줄 번호 "3   "는 PDF에서
    따로 떨어져 나올 수 있다."""
    texts = [ln if isinstance(ln, str) else ln.get("text", "") for ln in lines]
    with_num = "".join(canon(t) for t in texts)
    no_num = "".join(canon(re.sub(r"^\s*\d+\s{2,}", "", t)) for t in texts)
    if not no_num:
        return False
    xs = sorted({round(l["x0"]) for l in qlines})
    cut, cols = None, {}
    for x in xs:
        cut = x if cut is None or x - cut > 15 else cut
        cols[x] = cut
    streams = [qlines] + [[l for l in qlines if cols[round(l["x0"])] == c] for c in sorted(set(cols.values()))]

    def bounded(st, want):
        cl = [canon(l["text"]) for l in st]
        # 이웃 줄은 보기 표지("① ", "a. ")를 뗀 글로 지문의 다른 글에서 찾는다(JSON 보기 글에는 표지가 없다).
        bare = [canon(LEAD_MARK.sub("", l["text"])) for l in st]
        flat, starts = "", []
        for c in cl:
            starts.append(len(flat))
            flat += c
        pos = flat.find(want)
        while pos >= 0:
            end = pos + len(want)
            first = next((i for i, o in enumerate(starts) if o == pos), None)
            last = next((i for i in range(len(cl)) if starts[i] + len(cl[i]) == end), None)
            if first is not None and last is not None and last >= first:
                near = [bare[i] for i in (first - 1, last + 1) if 0 <= i < len(cl)]
                if all(len(n) < 3 or n in other for n in near):
                    return True
            pos = flat.find(want, pos + 1)
        return False

    for st in streams:
        nonum = [l for l in st if not re.fullmatch(r"\s*\d+\s*", l["text"])]
        if bounded(st, with_num) or bounded(nonum, no_num) or bounded(st, no_num):
            return True
    return False


OPS = re.compile(r"[+\-*/=<>≤≥×÷%]")
TAGS = re.compile(r"</?(?:u|b|i|em|strong|br|sub|sup)\s*/?>", re.I)


def canon_op(s):
    """연산자를 지키는 비교 글: 서식 태그·글머리 기호를 떼고 canon 한다(PDF의 글머리 기호는 기호 글꼴 글리프라 빠진다)."""
    return canon(re.sub(r"[•·●▪○◦]", "", TAGS.sub("", str(s or ""))))


def ops_seq(s):
    """글 속 연산자(+ - * / = < > ≤ ≥ × ÷ %)를 순서대로 모은 것. norm()이 지우는 기호가 같은지 본다."""
    return OPS.findall(canon_op(s))


GRID_CACHE = {}


def pdf_grids(path):
    """PDF의 표 격자 목록 [(쪽, y0, y1, 칸 격자, 접은 행)]. 테두리 선이 있는 표만 잡힌다."""
    if path not in GRID_CACHE:
        out = []
        with fitz.open(path) as doc:
            for pg in doc:
                try:
                    for t in pg.find_tables().tables:
                        raw = t.extract()
                        out.append((pg.number, t.bbox[1], t.bbox[3], [[canon(c) for c in r] for r in raw], fold_rows(raw)))
                except Exception:
                    pass
        GRID_CACHE[path] = out
    return GRID_CACHE[path]


def scope_grids(entries, lines):
    """그 문항(줄 목록)이 놓인 쪽·세로 범위와 겹치는 표 격자만 남긴다 — 다른 문항의 표를 가져다 붙여도 걸리게."""
    span = {}
    for l in lines:
        lo, hi = span.get(l["page"], (l["y0"], l["y0"]))
        span[l["page"]] = (min(lo, l["y0"]), max(hi, l["y0"]))
    return [e for e in entries if e[0] in span and e[2] >= span[e[0]][0] - 3 and e[1] <= span[e[0]][1] + 3]


def table_ok(rows, entries, used=None):
    """JSON 표 칸이 PDF 표 격자와 같은 자리에서 같은가. 맞으면 그 격자를 used에 올려 둔다 — 한 문항에 표가 여럿일 때
    JSON 표 하나가 이미 다른 표가 맞춘 격자를 또 쓰지 못하게(표를 다른 표로 바꿔 놓아도 통과하는 것을 막는다).
    ① 칸이 정확히 같다. ② 병합 칸 때문에 PDF가 행을 쪼갰거나 가로로 합친 표는 행을 접어 행 단위로 맞춘다.
    ③ 병합 머리글·병합 첫 열 표: 머리글 앞 두 칸·위층 머리글+아래층 머리글·비어 있는 첫 열(위 값을 이어받음)·
    본문 행을 순서대로 빠짐없이 맞춘다."""
    used = used if used is not None else set()
    cand = [e for e in entries if id(e) not in used]
    want = [[canon(c) for c in r] for r in rows]

    def hit(e):
        used.add(id(e))
        return True

    for e in cand:
        if e[3] == want:
            return hit(e)
    # 비교 글은 canon(연산자 보존)이고 쉼표·마침표 같은 구분 부호만 느슨하게 본다 — norm()은 < > =를 지워 "X>10"과 "X<10"을 구분하지 못한다.
    loose = lambda c: re.sub(r"[,，、.·]", "", canon(c))
    folded = [loose("".join(r)) for r in rows]
    for e in cand:
        if [loose("".join(c or "" for c in r)) for r in e[4]] == folded:
            return hit(e)
    if len(want) < 2 or any(len(r) < 3 for r in want):
        return False
    for e in cand:
        g = e[3]
        filled, last = [], ""
        for r in g:
            last = r[0] or last
            filled.append([last] + list(r[1:]))
        for h, r in enumerate(g):
            # 머리글 줄: 앞 두 칸이 같고, 셋째 칸부터는 (위층 머리글 글) + (이 줄의 글)과 정확히 같다("규칙" + "1" = "규칙 1").
            if len(r) != len(want[0]) or want[0][:2] != r[:2]:
                continue
            above = g[:h]
            if any(row[0] or row[1] for row in above):
                continue
            prefix = "".join(c for row in above for c in row[2:] if c)
            if not all(a == prefix + b for a, b in zip(want[0][2:], r[2:])):
                continue
            body = filled[h + 1:]
            if len(body) == len(want) - 1 and all(
                len(x) == len(w) and x[0] == w[0] and x[1] == w[1] and x[2:] == w[2:] for x, w in zip(body, want[1:])
            ):
                return hit(e)
    return False


def struct_blocks(q):
    """문항 지문(stem)의 코드(lines)·표(rows) 블록. 해설 표는 [5]가 본다."""
    v = q.get("stem")
    for b in v if isinstance(v, list) else []:
        if b.get("type") in ("code", "table"):
            yield b


# ─────────────────────────── [1] 텍스트 전수 대조 ───────────────────────────
def check_text():
    sets = [
        ("istqb/sample-a.json", [DATA / ISTQB_PDF["A"][0], DATA / ISTQB_PDF["A"][1]]),
        ("istqb/sample-b.json", [DATA / ISTQB_PDF["B"][0], DATA / ISTQB_PDF["B"][1]]),
        ("istqb/sample-c.json", [DATA / ISTQB_PDF["C"][0], DATA / ISTQB_PDF["C"][1]]),
        ("istqb/sample-d.json", [DATA / ISTQB_PDF["D"][0], DATA / ISTQB_PDF["D"][1]]),
        ("istqb/sample-extra.json", [DATA / p for pair in ISTQB_PDF.values() for p in pair]),
    ] + [(f"csts/{jf}", [CS / pdf]) for jf, pdf, _ in CSTS_SETS]
    cache = {}

    def pdftext(p):
        if p not in cache:
            cache[p] = norm(raw(p))
        return cache[p]

    total = 0
    bad = 0
    for rel, pdfs in sets:
        d = load(rel)
        texts = [pdftext(p) for p in pdfs]
        ctexts = [canon_op(raw(p)) for p in pdfs]
        for q in d["questions"]:
            frs = []
            for b in q["stem"] if isinstance(q["stem"], list) else []:
                bt = b.get("type")
                if bt in ("paragraph", "prompt", "note"):
                    frs.append(b.get("text", ""))
                elif bt == "list":
                    for it in b.get("items", []):
                        frs.append(it if isinstance(it, str) else (it.get("text") or ""))
            for o in q.get("options", []):
                t = o.get("text", "")
                if t and not t.startswith("!["):
                    frs.append(t)
            for fr in frs:
                if not fr or len(norm(fr)) < 8:
                    continue
                total += 1
                if fr.lstrip().startswith("|"):
                    cells = [norm(c) for c in re.split(r"\|", fr) if len(norm(c)) >= 4 and not set(norm(c)) <= set("0123456789")]
                    miss = [c for c in cells if not any(c in t for t in texts)]
                    if miss and ("text", rel, q["number"]) not in ALLOW:
                        bad += 1
                        fail(f"[텍스트] {rel} Q{q['number']}: 표 셀 미발견 {miss[0][:30]!r}")
                elif not any(norm(fr) in t for t in texts):
                    if ("text", rel, q["number"]) not in ALLOW:
                        bad += 1
                        fail(f"[텍스트] {rel} Q{q['number']}: {fr[:60]!r}")
            # 해설 조각도 같은 방식으로 본다. 이 검사가 없던 때는 해설의 계산식이 "$1,% = $1,.5"로 깨져
            # 있어도 어떤 게이트에도 걸리지 않았다.
            for fr in expl_fragments(q):
                if len(norm(fr)) < 8:
                    continue
                total += 1
                if not any(with_pdf_typo(rel, q["number"], norm(fr)) in t for t in texts):
                    bad += 1
                    fail(f"[해설 텍스트] {rel} Q{q['number']}: {fr[:60]!r}")
                elif OPS.search(TAGS.sub("", fr)) and not any(
                    with_pdf_typo(rel, q["number"], canon_op(fr)) in t for t in ctexts
                ):
                    bad += 1
                    fail(f"[해설 연산자] {rel} Q{q['number']}: 수식 속 연산자·기호가 PDF와 다름 {fr[:60]!r}")
    print(f"[1/3 텍스트] {total}조각(지문·보기·해설) · 불일치 {bad}")


# ─────────────────────────── [2] 정답 전수 대조 ───────────────────────────
CIRC = {"①": "a", "②": "b", "③": "c", "④": "d", "⑤": "e", "1": "a", "2": "b", "3": "c", "4": "d", "5": "e"}


def istqb_answers():
    out = {}
    for k, (_, expl) in ISTQB_PDF.items():
        t = raw(DATA / expl)
        tbl = {}
        for n, a in re.findall(r"(\d{1,2})\s+([a-e](?:\s*,\s*[a-e])*)\s+FL-\d", t):
            n = int(n)
            if n not in tbl:
                tbl[n] = sorted(re.findall(r"[a-e]", a))
        out[k] = tbl
        if len(tbl) < 40:
            fail(f"[정답] ISTQB {k}: 정답표 추출 {len(tbl)}행(<40)")
    return out


def istqb_appendix_answers():
    t = raw(DATA / ISTQB_PDF["A"][1])
    i = t.find("부록")
    out = {}
    if i >= 0:
        for m in re.finditer(r"(?:^|\s)A(\d{1,2})\s+([a-e](?:\s*,\s*[a-e])*)(?=\s)", t[i:]):
            n = int(m.group(1))
            if n not in out:
                out[n] = sorted(re.findall(r"[a-e]", m.group(2)))
    return out


def csts_inline_answers(pdf, maxq):
    t = raw(pdf)
    anchors = [(m.start(), int(m.group(1))) for m in re.finditer(r"(?:^|\s)(\d{1,2})\.\s", t) if 1 <= int(m.group(1)) <= maxq]

    def build(start):
        seq = []
        for pos, n in anchors[start:]:
            if not seq:
                if n == 1:
                    seq.append((pos, n))
            elif n == seq[-1][1] + 1:
                seq.append((pos, n))
        return seq

    def extract(seq):
        out = {}
        for i, (pos, n) in enumerate(seq):
            end = seq[i + 1][0] if i + 1 < len(seq) else len(t)
            block = t[pos:end]
            payload = None
            while True:
                ms = list(re.finditer(r"정\s*답\s*", block))
                if not ms:
                    break
                p = re.sub(r"\s+", " ", block[ms[-1].end():].strip())
                if p:
                    payload = p[:120]
                    break
                block = block[: ms[-1].start()].rstrip()
            if payload:
                out[n] = payload
        return out

    best = {}
    for s in [i for i, (p, n) in enumerate(anchors) if n == 1]:
        out = extract(build(s))
        if len(out) > len(best):
            best = out
    return best


def csts_tail_answers(pdf, maxq):
    t = raw(pdf)
    m = re.search(r"정\s*답\s*표", t)
    if m:
        toks = t[m.end():].split()
        out = {}
        i = 0
        while i < len(toks):
            if re.fullmatch(r"\d{1,2}", toks[i]) and 1 <= int(toks[i]) <= maxq:
                n = int(toks[i]); i += 1; val = []
                while i < len(toks) and not (re.fullmatch(r"\d{1,2}", toks[i]) and 1 <= int(toks[i]) <= maxq):
                    val.append(toks[i]); i += 1
                if n not in out and val:
                    out[n] = " ".join(val)[:120]
            else:
                i += 1
        if len(out) >= maxq * 0.5:
            return out
    i = t.rfind("정답 및 해설")
    if i < 0:
        return {}
    tail = t[i:]
    items = [(m.start(), int(m.group(1)), m.end()) for m in re.finditer(r"(?:^|\s)(\d{1,2})\.\s", tail) if 1 <= int(m.group(1)) <= maxq]
    out = {}
    last = 0
    seq = []
    for pos, n, e in items:
        if n == last + 1:
            seq.append((pos, n, e)); last = n
    for j, (pos, n, e) in enumerate(seq):
        end = seq[j + 1][0] if j + 1 < len(seq) else len(tail)
        out[n] = re.sub(r"\s+", " ", tail[e:end].strip())[:120]
    return out


def check_answers():
    checked = ok = 0
    tbls = istqb_answers()
    for k, jf in [("A", "sample-a.json"), ("B", "sample-b.json"), ("C", "sample-c.json"), ("D", "sample-d.json")]:
        for q in load(f"istqb/{jf}")["questions"]:
            checked += 1
            pdf_ans = tbls[k].get(q["number"])
            js = sorted(a.lower() for a in q["answer"])
            if pdf_ans is None:
                fail(f"[정답] ISTQB {k} Q{q['number']}: 정답표에 없음")
            elif js == pdf_ans:
                ok += 1
            else:
                fail(f"[정답] ISTQB {k} Q{q['number']}: JSON {js} ≠ PDF {pdf_ans}")
    # extra: 스템으로 A 부록 번호 역추적
    apx = istqb_appendix_answers()
    tA = raw(DATA / ISTQB_PDF["A"][0])
    for q in load("istqb/sample-extra.json")["questions"]:
        checked += 1
        frag = ""
        for b in q["stem"]:
            if b.get("type") in ("paragraph", "prompt") and len(b.get("text", "")) > 20:
                frag = b["text"]; break
        frag = re.sub(r"</?(u|b|i|em|strong)\s*/?>", "", frag, flags=re.I)
        core = re.sub(r"\s+", "", frag)[:26]
        m = re.search(r"\s*".join(re.escape(c) for c in core), tA)
        qnum = None
        if m:
            for a in re.finditer(r"(?:^|\s)A(\d{1,2})\.\s", tA):
                if a.start() <= m.start():
                    qnum = int(a.group(1))
                else:
                    break
        pdf_ans = apx.get(qnum) if qnum else None
        js = sorted(a.lower() for a in q["answer"])
        if pdf_ans is None:
            fail(f"[정답] EXTRA Q{q['number']}: 부록 역추적 실패")
        elif js == pdf_ans:
            ok += 1
        else:
            fail(f"[정답] EXTRA Q{q['number']} (A부록 {qnum}): JSON {js} ≠ PDF {pdf_ans}")
    # CSTS
    for jf, pdf, maxq in CSTS_SETS:
        ans = csts_inline_answers(CS / pdf, maxq)
        if len(ans) < maxq * 0.6:
            for kk, vv in csts_tail_answers(CS / pdf, maxq).items():
                ans[kk] = vv
        for q in load(f"csts/{jf}")["questions"]:
            checked += 1
            payload = ans.get(q["number"])
            js = [a.lower() for a in q["answer"]]
            if payload is None:
                fail(f"[정답] {jf} Q{q['number']}: PDF 정답 미발견")
                continue
            typ = q.get("type")
            if typ == "multiple_choice":
                marks = []
                rest = payload
                while True:
                    mm = re.match(r"\s*[,·/]?\s*([①②③④⑤])(?=$|[\s,·/)])", rest)
                    if not mm:
                        break
                    marks.append(mm.group(1)); rest = rest[mm.end():]
                if not marks:
                    marks = re.findall(r"[①②③④⑤]", payload) or re.findall(r"^([1-5])\b", payload)
                pdf_ans = sorted({CIRC[m] for m in marks}) if marks else None
                if pdf_ans is None:
                    fail(f"[정답] {jf} Q{q['number']}: 선택형 파싱 실패 [{payload[:25]}]")
                elif sorted(js) == pdf_ans:
                    ok += 1
                else:
                    fail(f"[정답] {jf} Q{q['number']}: JSON {sorted(js)} ≠ PDF {pdf_ans} [{payload[:25]}]")
            elif typ == "true_false":
                m = re.search(r"[OoXx○×]", payload)
                if not m:
                    fail(f"[정답] {jf} Q{q['number']}: OX 파싱 실패")
                    continue
                pdf_ans = "o" if m.group(0) in "Oo○" else "x"
                if js[0] == pdf_ans:
                    ok += 1
                else:
                    fail(f"[정답] {jf} Q{q['number']}: JSON {js} ≠ PDF {pdf_ans}")
            else:  # 단답형
                oxm = re.match(r"^\s*[\(（]?\s*([OoXx○×])\b", payload)
                if js and js[0] in ("o", "x") and oxm:
                    pdf_ox = "o" if oxm.group(1) in "Oo○" else "x"
                    if js[0] == pdf_ox:
                        ok += 1
                    else:
                        fail(f"[정답] {jf} Q{q['number']} OX: JSON {js} ≠ PDF {pdf_ox}")
                    continue
                npay = norm(payload)
                cands = [c for a in js for c in re.split(r"[,/]|또는|\s{2,}", a) if len(norm(c)) >= 1]
                hit = any(norm(c) and norm(c) in npay for c in cands) or (npay[:14] and any(npay[:14] in norm(a) for a in js))
                if hit:
                    ok += 1
                else:
                    fail(f"[정답] {jf} Q{q['number']} 단답: JSON {js[0][:25]!r} vs PDF {payload[:30]!r}")
    print(f"[2/3 정답] 검사 {checked} · 일치 {ok}")


# ─────────────────────────── [3] 밑줄 역방향 대조 ───────────────────────────
HEADINGS = {"서문introduction", "문제questions", "정답answers"}


def detect_underlines(doc):
    """페이지별 밑줄 선분 → (page, y, 텍스트). 표 괘선(수직선 교차)은 제외."""
    out = []
    for pno, page in enumerate(doc):
        words = page.get_text("words")
        hl = []
        vl = []
        for d in page.get_drawings():
            for it in d["items"]:
                if it[0] == "l":
                    a, b = it[1], it[2]
                    if abs(a.y - b.y) < 0.7 and abs(a.x - b.x) > 6:
                        hl.append((min(a.x, b.x), max(a.x, b.x), (a.y + b.y) / 2))
                    elif abs(a.x - b.x) < 0.7 and abs(a.y - b.y) > 3:
                        vl.append((a.x, min(a.y, b.y), max(a.y, b.y)))
                elif it[0] == "re":
                    r = it[1]
                    if r.height < 1.6 and r.width > 6:
                        hl.append((r.x0, r.x1, (r.y0 + r.y1) / 2))
                    elif r.width < 1.6 and r.height > 3:
                        vl.append((r.x0, r.y0, r.y1))
        for x0, x1, y in hl:
            if any(x0 - 1 <= vx <= x1 + 1 and vy0 - 2 <= y <= vy1 + 2 for vx, vy0, vy1 in vl):
                continue
            ws = [w for w in words if y - 4.5 < w[3] < y + 1.5 and min(w[2], x1) - max(w[0], x0) > 1]
            if not ws:
                continue
            txt = " ".join(w[4] for w in sorted(ws, key=lambda w: w[0]))
            cov = sum(min(w[2], x1) - max(w[0], x0) for w in ws) / (x1 - x0)
            if cov > 0.45 and norm(txt) not in HEADINGS:
                out.append((pno, y, txt))
    return out


def question_anchors(doc):
    """행머리 문항 앵커: (page, y, 'A'|'', 번호).

    x 임계값만으로는 스템 안 목록 번호("1."~"5.", x≈83~110)와 문항 번호(x 72~84)를
    구분할 수 없다 — 후보를 넓게 모은 뒤 순번이 1씩 증가하는 최장 체인만 채택한다
    (목록 번호는 진행 중인 문항 순번과 어긋나므로 자동 배제).
    """
    cand = []
    for pno, page in enumerate(doc):
        for w in page.get_text("words"):
            m = re.fullmatch(r"(A?)(\d{1,2})\.", w[4])
            if m and w[0] < 90:
                cand.append((pno, w[1], m.group(1), int(m.group(2))))
    cand.sort(key=lambda a: (a[0], a[1]))

    def chain(prefix):
        items = [a for a in cand if a[2] == prefix]
        best = []
        for s in range(len(items)):
            if items[s][3] != 1:
                continue
            seq = []
            for a in items[s:]:
                if not seq:
                    seq.append(a)
                elif a[3] == seq[-1][3] + 1:
                    seq.append(a)
            if len(seq) > len(best):
                best = seq
        return best

    res = chain("") + chain("A")
    res.sort(key=lambda a: (a[0], a[1]))
    return res


def check_underlines():
    # extra 매핑: 부록 번호 → extra 문항 번호 (스템 역추적)
    extra = load("istqb/sample-extra.json")
    tA = raw(DATA / ISTQB_PDF["A"][0])
    apx2extra = {}
    for q in extra["questions"]:
        frag = ""
        for b in q["stem"]:
            if b.get("type") in ("paragraph", "prompt") and len(b.get("text", "")) > 20:
                frag = b["text"]; break
        frag = re.sub(r"</?(u|b|i|em|strong)\s*/?>", "", frag, flags=re.I)
        core = re.sub(r"\s+", "", frag)[:26]
        m = re.search(r"\s*".join(re.escape(c) for c in core), tA)
        if not m:
            continue
        qn = None
        for a in re.finditer(r"(?:^|\s)A(\d{1,2})\.\s", tA):
            if a.start() <= m.start():
                qn = int(a.group(1))
            else:
                break
        if qn:
            apx2extra[qn] = q["number"]

    def q_underlines(q):
        parts = []
        for b in q["stem"]:
            if isinstance(b.get("text"), str):
                parts.append(b["text"])
            for it in b.get("items", []):
                if isinstance(it, dict):
                    parts.append(it.get("text", ""))
        for o in q.get("options", []):
            parts.append(o.get("text", ""))
        return [u for p in parts for u in re.findall(r"<u>(.*?)</u>", p)]

    total = miss = 0
    for setkey, (qpdf, _) in ISTQB_PDF.items():
        doc = fitz.open(DATA / qpdf)
        anchors = question_anchors(doc)
        d = load(f"istqb/sample-{setkey.lower()}.json")
        qmap = {q["number"]: q for q in d["questions"]}
        exmap = {q["number"]: q for q in extra["questions"]}
        for pno, y, txt in detect_underlines(doc):
            prev = None
            for a in anchors:
                if (a[0], a[1]) <= (pno, y + 2):
                    prev = a
                else:
                    break
            if not prev:
                continue
            _, _, ax, anum = prev
            if ax == "A":
                q = exmap.get(apx2extra.get(anum))
            else:
                q = qmap.get(anum)
            if not q:
                continue
            total += 1
            nt = norm(txt)
            us = [norm(u) for u in q_underlines(q)]
            # 줄바꿈으로 쪼개진 밑줄 조각은 어느 <u>의 부분 문자열로든 덮이면 통과
            if not any(nt and (nt in u or u in nt) for u in us if u):
                miss += 1
                fail(f"[밑줄] {setkey} p{pno + 1} Q{anum if ax != 'A' else f'(extra {apx2extra.get(anum)})'}: {txt[:35]!r} 에 <u> 없음")
    # CSTS: JSON의 <u>가 해당 PDF 밑줄 검출 결과에 존재하는가(순방향)
    for jf, pdf, _ in CSTS_SETS:
        d = load(f"csts/{jf}")
        det = None
        for q in d["questions"]:
            for u in q_underlines(q):
                if det is None:
                    det = [norm(t) for _, _, t in detect_underlines(fitz.open(CS / pdf))]
                total += 1
                nu = norm(u)
                if not any(nu in t or t in nu for t in det if t):
                    miss += 1
                    fail(f"[밑줄] {jf} Q{q['number']}: JSON <u>{u[:30]}</u> 가 PDF 밑줄에 없음")
    print(f"[3/3 밑줄] 검사 {total} · 미반영 {miss}")


# ─────────────────────────── [4] 역방향(PDF → JSON) 대조 ───────────────────────────
# PDF의 각 문항 본문에서 "문장 줄"(정규화 12자 이상, 한글 6자 이상)을 뽑아 해당 문항 JSON에 남아
# 있는지 본다. 표 칸·로그·수식처럼 짧거나 한글이 적은 줄은 대상이 아니다(표는 그림으로 실리는
# 경우가 많아 글자 비교가 성립하지 않는다). 문항 번호는 PDF에서 1부터 차례로 찾는다.
# 대상은 ISTQB A~D 본문 40문항, 부록 추가 문제 26개(A 세트 PDF 끝의 A1~A26), CSTS 7세트다.
#
# 이 검사가 못 보는 것: 그림(figure/image)으로만 실린 글자, 한글이 거의 없는 줄. 지문이 그림으로
# 대체된 문항에서 문장 줄이 JSON에 없으면 REVERSE_ALLOW에 사유와 함께 적는다.
# 문항 하나를 통째로 면제한다 — 사유는 그림에 실린 글자(그림 PNG를 눈으로 확인)이거나 승인된 재구성이다.
REVERSE_ALLOW = {
    ("istqb/sample-b.json", 25): "분기 커버리지 계산식 문단 — 원문 수식·문장을 읽기 좋게 재구성(검수 승인, [1]과 같은 사유)",
    ("istqb/sample-b.json", 31): "표를 그림으로 싣고 표 바로 앞의 안내 문장('아래 표는 이런 과거 데이터를 보여주고 있다:')을 생략",
    ("istqb/sample-b.json", 38): "테스트 실행 로그 전체가 그림(ISTQB-FL-V4-B-038.png)에 실림",
    ("istqb/sample-c.json", 31): "그래프 제목('예상 노력과 실제 노력 (M/D)')이 그림에 실림",
    ("csts/csts-2405-fl.json", 33): "<보기> 표와 'Base Choice … 기반이 되는 테스트 조합' 줄이 그림(CSTS-FL-2405-033.png)에 실림",
    ("csts/csts-2018-general.json", 9): "<보기> 설명문과 표가 그림(CSTS-EL-2018-009.png)에 실림",
    ("csts/csts-example-answer-included.json", 33): "<보기> 설명문이 그림(CSTS-EL-SW-EXAMPLE-033.png)에 실림",
}
REVERSE_SET_LEVEL = {  # 문항 본문이 번호 순서와 다르게 배치된 PDF — 18~20번의 지문이 20번 뒤에 몰려 있다
    "2018년도 CSTS 자격시험 예제(일반등급).pdf",
}
REVERSE_SKIP_PAGES = {  # 표지·응시 유의사항 등 문항이 아닌 앞쪽 쪽수
    "(공개답안) CSTS 2402FL.pdf": 1,
    "(공개답안) CSTS 2403FL.pdf": 1,
    "(공개답안) CSTS 2404FL.pdf": 1,
    "(공개답안) CSTS 2405FL.pdf": 1,
    "2018년도 CSTS 자격시험 예제(일반등급).pdf": 1,
    "2019년도 CSTS 자격시험 예제(일반등급).pdf": 1,
}
PAGE_NOISE = re.compile(
    r"^\s*(Korean Software Testing Qualifications Board|www\.kstqb\.org.*|\d+ (of|/) \d+|"
    r"SW 테스트 전문가\(CSTS\) 자격시험.*|20\d\d-CSTS-[A-Z]-\d+|한국정보통신기술협회\(TTA\)|TTA|20\d\d-\d\d-\d\d|"
    r"CSTS 시험 예제 \(일반\)|- \d+ -)\s*$"
)
LEAD_MARK = re.compile(r"^\s*(\(\d+\)|[①-⑩]|[a-eA-E]\.|[ivxIVX]+\.|[가-하][.)]|[-•※])\s*")


def pdf_blocks(path, maxq, skip_pages, appendix=False):
    """PDF → {문항번호: 본문 줄 목록}. 정답 표기 이후와 쪽 머리말·꼬리말은 버린다."""
    lines = []
    # Document를 변수로 쥐고 그 안에서 쪽 글을 읽는다 — 임시 Document 위에서 Page만 들고 있으면
    # PyMuPDF 버전에 따라 Document가 먼저 해제돼 Page가 고아(parent None)가 될 수 있다.
    with fitz.open(path) as doc:
        for i in range(skip_pages, len(doc)):
            lines += [ln for ln in doc[i].get_text().split("\n") if not PAGE_NOISE.match(ln)]
    text = "\n".join(lines)
    if appendix:  # 부록 추가 문제(A1, A2 …)만 — 본문 문항은 위 검사가 본다
        text = text[text.index("부록"):]
    prefix = "A" if appendix else ""
    marks, cur = [], 0
    for n in range(1, maxq + 1):
        m = re.compile(r"(?m)^\s*%s%d\s*[.)]\s" % (prefix, n)).search(text, cur)
        if not m:
            return None, n
        marks.append((n, m.start()))
        cur = m.end()
    marks.append((None, len(text)))
    out = {}
    for (n, a), (_, b) in zip(marks, marks[1:]):
        blk = re.split(r"\n\s*정답\b|부록\b|Additional Questions|< 정답표 >", text[a:b])[0] if not appendix else text[a:b]
        blk = re.sub(r"^\s*%s\d+\s*[.)]\s*" % prefix, "", blk, count=1)
        out[n] = blk.split("\n")
    return out, None


def json_text(q):
    parts = []
    for b in q["stem"] if isinstance(q["stem"], list) else []:
        for k in ("text", "formula"):
            if b.get(k):
                parts.append(b[k])
        for it in b.get("items", []):
            parts.append(it if isinstance(it, str) else " ".join(filter(None, [it.get("marker"), it.get("text")])))
        for row in b.get("rows", []):
            parts += [c for c in row if isinstance(c, str)]
        for ln in b.get("lines", []):
            parts.append(ln if isinstance(ln, str) else (ln.get("text") or ""))
    for o in q.get("options", []):
        parts.append(o.get("text", ""))
    return norm("".join(parts))


def question_sets():
    """(JSON 경로, PDF 파일명, 문항 수, PDF 폴더, 부록 여부) — [4]·[6]이 같은 표를 쓴다."""
    sets = [(f"istqb/sample-{k.lower()}.json", ISTQB_PDF[k][0], 40, DATA, False) for k in "ABCD"]
    # 부록 추가 문제 26개(sample-extra)는 A 세트 PDF 끝의 A1~A26이다.
    sets += [("istqb/sample-extra.json", ISTQB_PDF["A"][0], 26, DATA, True)]
    sets += [(f"csts/{jf}", pdf, mx, CS, False) for jf, pdf, mx in CSTS_SETS]
    return sets


def check_reverse():
    lines_total = bad = 0
    for rel, pdf, maxq, base, appendix in question_sets():
        blocks, missing = pdf_blocks(base / pdf, maxq, REVERSE_SKIP_PAGES.get(pdf, 0), appendix)
        if blocks is None:
            fail(f"[역방향] {rel}: PDF에서 문항 {missing}번 시작을 찾지 못함")
            continue
        questions = load(rel)["questions"]
        # 기본은 그 문항의 JSON 글에서만 찾는다. 세트 전체에서 찾으면 다른 문항에 같은 문구가 있을 때
        # (예: "이에 대한 설명으로 올바르지 않은 것은?") 한 문항의 잘린 줄이 가려진다.
        # 쪽 안에서 본문이 번호 순서와 다르게 배치된 PDF만 REVERSE_SET_LEVEL로 세트 전체에서 찾는다.
        jn_set = "".join(json_text(q) for q in questions) if pdf in REVERSE_SET_LEVEL else None
        for q in questions:
            jn = jn_set if jn_set is not None else json_text(q)
            for ln in blocks.get(q["number"], []):
                stripped = LEAD_MARK.sub("", ln)
                n = norm(stripped)
                if len(n) < 12 or len(re.findall(r"[가-힣]", n)) < 6:
                    continue
                lines_total += 1
                if n not in jn and norm(ln) not in jn and (rel, q["number"]) not in REVERSE_ALLOW:
                    bad += 1
                    fail(f"[역방향] {rel} Q{q['number']}: PDF 문장이 JSON에 없음 {stripped.strip()[:50]!r}")
    print(f"[4/4 역방향] PDF 문장 줄 {lines_total} · JSON에 없음 {bad}")


# ─────────────────── [5] 해설 · [6] 줄바꿈 자리 공백 ───────────────────
# [1]~[4]는 비교 전에 공백과 문장부호를 지운다. 그래서 다음 두 결함이 어느 검사에도 걸리지 않았다.
#   - 해설: ISTQB 해설의 항목 라벨(A.~D.)·연결 번호 "(4)"·분수 "3/5"가 빠지거나 계산식이 "$1,% = $1,.5"로
#     깨져도 통과했다. CSTS 2018의 "정답 및 해설"은 통째로 빠져 자리표시 문구만 보였다.
#   - 줄바꿈 자리 공백: "준 비 중이다"처럼 낱말 중간이 벌어지거나 "올바른것은?"처럼 띄어쓰기가 빠져도 통과했다.
#
# [5] ① ISTQB: 정답과 해설 PDF의 행(문항)마다 해설 칸 글자가 JSON 해설과 같은가(공백·문장부호 무시).
#     ② CSTS 2018: "정답 및 해설" 절을 "N. 정답" 줄로 문항별로 나눠 PDF 해설 글과 JSON 해설 글이 같은가(양방향).
#     원본 오탈자를 JSON이 바로잡아 둔 곳은 EXPL_TYPO에 오탈자 앞뒤 글과 함께 적는다(문항 전체를 면제하지 않는다).
# [1b]는 코드 블록(그 문항 PDF 줄을 이은 글에서 공백 무시 연속 일치)과 구조화된 표(그 문항 자리의 PDF 표 격자와 칸 단위)를
#      본다 — norm()은 + - = 같은 기호를 지우기 때문이다.
# [6] PDF 줄 i와 i+1 사이가 줄바꿈(줄 i가 오른쪽 여백 근처에서 끝남)일 때,
#       줄 끝/다음 줄 앞에 공백 글리프가 있으면 띄어 쓴 자리, 없으면 낱말 중간에서 꺾인 자리다.
#     PDF 글자 흐름과 JSON 글자 흐름을 공백을 뺀 채 정렬해(반복 문장이 있어도 위치로 짝짓는다) 같은 자리의
#     공백이 다르면 실패한다. 줄 안에서는 한글-한글 사이를 PDF가 띄웠는데 JSON이 붙인 곳도 본다.
#     코드·표·그림 속 글자는 정렬이 닿지 않아 대상이 아니다. 줄 안의 공백 모양(": " 앞 공백 등)은 보지 않는다.
WS = "  　"
# 항목 머리(글머리 기호·번호·보기 표지)로 시작하는 줄은 앞 줄의 이어짐이 아니라 새 항목이다.
LIST_HEAD = re.compile(r"^\s*(?:[•·●▪○◦\-–]|\(?\d{1,2}\)|\d{1,2}\.|[a-eA-E][.)]|\([가-힣]\)|[가-힣]\.|[①-⑩]|[ⓐ-ⓩⒶ-Ⓩ])\s")
HANGUL = re.compile(r"[가-힣]")


def pdf_lines(doc, pages):
    """쪽 범위의 텍스트 줄 [{text, x0, x1, y0, page, bold}]. 후행 공백을 보존하고 (쪽, y, x) 순으로 정렬한다."""
    out = []
    for pno in pages:
        for b in doc[pno].get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for ln in b["lines"]:
                # 2018 예제 PDF 일부 구간은 낱말 사이 공백을 \x01 글리프로 싣는다 — 공백으로 읽는다.
                t = "".join(sp["text"] for sp in ln["spans"]).replace("\x01", " ")
                if t.strip():
                    f = ln["spans"][0]
                    out.append({"text": t, "x0": ln["bbox"][0], "x1": ln["bbox"][2], "y0": ln["bbox"][1], "page": pno,
                                "bold": "Bold" in f["font"] or bool(f["flags"] & 16)})
    out.sort(key=lambda l: (l["page"], round(l["y0"] / 3), l["x0"]))
    return out


def right_margin(lines):
    xs = sorted(l["x1"] for l in lines)
    return xs[int(len(xs) * 0.97)] if xs else 0


def wrap_gaps(lines, rm, tol=20):
    """줄 목록 → (공백 없는 글 흐름 P, {줄바꿈 경계: 띄움?}, {줄 안 경계: 띄움?}). 경계 b는 P[b-1]과 P[b] 사이."""
    chars, wraps, inline = [], {}, {}
    page_max = {}
    for l in lines:
        page_max[l["page"]] = max(page_max.get(l["page"], 0), l["x1"])
    prev = None
    for l in lines:
        start, sp, first = len(chars), False, True
        for c in unicodedata.normalize("NFC", l["text"]):
            if c.isspace():
                sp = True
                continue
            if not first:
                inline[len(chars)] = sp
            first, sp = False, False
            chars.append(c)
        if len(chars) == start:
            continue
        if prev is not None and prev["page"] == l["page"] and start > 0:
            full = prev["x1"] > rm - tol or prev["x1"] > page_max[prev["page"]] - tol
            if full and not LIST_HEAD.match(l["text"]):
                wraps[start] = prev["text"].endswith(tuple(WS)) or l["text"].startswith(tuple(WS))
        prev = l
    return "".join(chars), wraps, inline


def strip_tags(text):
    """<u>…</u> 같은 태그를 뺀 글과 (뺀 글 위치 → 원문 위치) 사상."""
    st, mp, i = [], [], 0
    while i < len(text):
        m = re.match(r"</?(?:u|b|i|em|strong)\s*/?>", text[i:], re.I)
        if m:
            i += m.end()
            continue
        st.append(text[i]); mp.append(i); i += 1
    return "".join(st), mp


def spacing_violations(fields, lines, rm, tol=20):
    """JSON 글 조각들의 공백이 PDF 줄바꿈 자리와 다른 곳 → [(종류, 앞뒤 글)]."""
    import difflib
    P, wraps, inline = wrap_gaps(lines, rm, tol)
    if not wraps and not inline:
        return []
    J, loc, strips = [], [], []
    for fi, t in enumerate(fields):
        if not isinstance(t, str) or "|---" in t:
            strips.append(None)
            continue
        st, mp = strip_tags(unicodedata.normalize("NFC", t))
        strips.append((st, mp))
        for pos, c in enumerate(st):
            if not c.isspace():
                J.append(c); loc.append((fi, pos))
    pmap = [-1] * len(P)
    for a, b, size in difflib.SequenceMatcher(None, P, "".join(J), autojunk=False).get_matching_blocks():
        for k in range(size):
            pmap[a + k] = b + k

    def gap_at(b):
        j0, j1 = pmap[b - 1], pmap[b] if b < len(P) else -1
        if j0 < 0 or j1 != j0 + 1 or loc[j0][0] != loc[j1][0]:
            return None
        st, _ = strips[loc[j0][0]]
        p0, p1 = loc[j0][1], loc[j1][1]
        return st[p0 + 1:p1], st[max(0, p0 - 5):p0 + 1] + "⟦ ⟧" + st[p1:p1 + 6]

    out = []
    for b, spaced in sorted(wraps.items()):
        g = gap_at(b)
        if g is not None and bool(g[0]) != spaced:
            out.append(("띄어쓰기 누락" if spaced else "낱말 중간 공백", g[1]))
    for b, spaced in sorted(inline.items()):
        if spaced and b not in wraps and b < len(P) and HANGUL.match(P[b - 1]) and HANGUL.match(P[b]):
            g = gap_at(b)
            if g is not None and not g[0]:
                out.append(("띄어쓰기 누락", g[1]))
    return out


def json_fields(q, part, tables=False):
    """part: 'body'(지문+보기) | 'expl'(해설) → 글 조각 목록(목록 항목은 표지를 앞에 붙인다). tables면 표 칸도 싣는다."""
    out = []

    def blocks(bs):
        if isinstance(bs, str):
            out.append(bs)
            return
        for b in bs if isinstance(bs, list) else []:
            if b.get("type") == "list":
                for it in b.get("items", []):
                    out.append(it if isinstance(it, str) else " ".join(filter(None, [it.get("marker"), it.get("text")])))
            elif tables and b.get("type") == "table":
                out.extend(c for r in b.get("rows", []) for c in r if isinstance(c, str))
            elif isinstance(b.get("text"), str) and b.get("type") in ("paragraph", "prompt", "note", "formula", "text"):
                out.append(b["text"])

    if part == "body":
        blocks(q.get("stem"))
        out += [o.get("text", "") for o in q.get("options", [])]
    else:
        blocks(q.get("explanation"))
    return out


def question_lines(path, maxq, skip_pages, appendix=False):
    """문항 PDF → {번호: [줄 dict]}. 정답 표기 이후와 쪽 머리말·꼬리말은 버리고 첫 줄의 문항 번호를 뗀다."""
    with fitz.open(path) as doc:
        lines = [l for l in pdf_lines(doc, range(skip_pages, len(doc))) if not PAGE_NOISE.match(l["text"])]
    prefix = "A" if appendix else ""
    if appendix:  # 부록 추가 문제(A1, A2 …)만
        lines = lines[next(i for i, l in enumerate(lines) if "부록" in l["text"]):]
    starts, cur = [], 0
    for n in range(1, maxq + 1):
        pat = re.compile(r"^\s*%s%d\s*[.)](\s|$)" % (prefix, n))
        i = next((i for i in range(cur, len(lines)) if pat.match(lines[i]["text"])), None)
        if i is None:
            return None, n
        starts.append(i)
        cur = i + 1
    starts.append(len(lines))
    out = {}
    for n, (a, b) in enumerate(zip(starts, starts[1:]), start=1):
        blk = [dict(l) for l in lines[a:b]]
        for k, l in enumerate(blk):
            if k > 0 and (re.match(r"\s*정답\b", l["text"]) or re.search(r"부록\b|Additional Questions|< 정답표 >", l["text"])) and not appendix:
                blk = blk[:k]
                break
        blk[0]["text"] = re.sub(r"^\s*%s\d+\s*[.)]\s*" % prefix, "", blk[0]["text"], count=1)
        out[n] = blk
    return out, None


# 줄바꿈 공백 축 예외: PDF가 줄 끝 공백 글리프를 싣지 않았지만 실제로는 낱말 경계인 곳.
# 글리프만으로는 "낱말 중간에서 꺾임"과 구별되지 않으므로 사람이 눈으로 확인해 적는다. (세트, 문항, 앞뒤 글)
ALLOW_WRAP = {
    ("csts/csts-2402-fl.json", 28, "정수가⟦ ⟧아닌"): "줄 끝 '정수가' 뒤 공백 글리프가 없다 — 문장상 '정수가 아닌 값'",
    ("csts/csts-2402-fl.json", 67, "유한⟦ ⟧개의"): "줄 끝 '유한' 뒤 공백 글리프가 없다 — '개'는 의존명사라 '유한 개의'로 띄어 쓴다",
    ("csts/csts-2403-fl.json", 66, "유한⟦ ⟧개의"): "줄 끝 '유한' 뒤 공백 글리프가 없다 — '개'는 의존명사라 '유한 개의'로 띄어 쓴다",
}


def check_spacing():  # [6]
    total = bad = 0
    for rel, pdf, maxq, base, appendix in question_sets():
        blocks, missing = question_lines(base / pdf, maxq, REVERSE_SKIP_PAGES.get(pdf, 0), appendix)
        if blocks is None:
            fail(f"[줄바꿈 공백] {rel}: PDF에서 문항 {missing}번 시작을 찾지 못함")
            continue
        rm = right_margin([l for ls in blocks.values() for l in ls])
        for q in load(rel)["questions"]:
            for kind, ctx in spacing_violations(json_fields(q, "body"), blocks.get(q["number"], []), rm):
                if any(r == rel and n == q["number"] and snip in ctx for r, n, snip in ALLOW_WRAP):
                    continue
                bad += 1
                fail(f"[줄바꿈 공백] {rel} Q{q['number']}: {kind} …{ctx}…")
            total += len(blocks.get(q["number"], []))
    # ISTQB 해설 — 정답과 해설 PDF의 행별 해설 칸
    for k, (_, expl_pdf) in ISTQB_PDF.items():
        rows = istqb_expl_rows(DATA / expl_pdf)
        rm = right_margin([l for ls in rows.values() for l in ls])
        sets = [(f"istqb/sample-{k.lower()}.json", "")] + ([("istqb/sample-extra.json", "A")] if k == "A" else [])
        for rel, prefix in sets:
            for q in load(rel)["questions"]:
                lines = rows.get(f"{prefix}{q['number']}")
                if not lines:
                    continue
                total += len(lines)
                for kind, ctx in spacing_violations(json_fields(q, "expl"), lines, rm, tol=25):
                    bad += 1
                    fail(f"[줄바꿈 공백] {rel} Q{q['number']} 해설: {kind} …{ctx}…")
    # ALLOW_WRAP은 위반을 면제만 하면 안 된다 — 띄어 쓴 글이 그 문항에 아직 있어야 한다(다시 붙이면 걸린다).
    for rel, number, snip in ALLOW_WRAP:
        q = next((q for q in load(rel)["questions"] if q["number"] == number), None)
        want = snip.replace("⟦ ⟧", " ")
        text = unicodedata.normalize("NFC", " ".join(strip_tags(t)[0] for t in json_fields(q, "body"))) if q else ""
        total += 1
        if want not in text:
            bad += 1
            fail(f"[줄바꿈 공백] {rel} Q{number}: 허용 목록의 띄어 쓴 글 {want!r}이 문항에 없음")
    # CSTS 2018 — "정답 및 해설" 절의 문항별 해설 줄
    blocks = csts2018_expl_blocks()
    rm = right_margin([l for b in blocks.values() for l in b["body"]])
    for q in load("csts/csts-2018-general.json")["questions"]:
        lines = blocks.get(q["number"], {}).get("body", [])
        total += len(lines)
        for kind, ctx in spacing_violations(json_fields(q, "expl"), lines, rm):
            bad += 1
            fail(f"[줄바꿈 공백] csts/csts-2018-general.json Q{q['number']} 해설: {kind} …{ctx}…")
    print(f"[6/6 줄바꿈 공백] PDF 줄 {total} · 공백 불일치 {bad}")


HEADER_CELLS = {"정답", "해설/근거", "LO", "K-레벨", "배점", "문제 번호(#)"}


def istqb_expl_rows(path):
    """정답과 해설 PDF → {행 번호('1'…'40', 부록 'A1'…): [해설 칸 줄]}. 해설 칸은 x 140~625."""
    with fitz.open(path) as doc:
        lines = pdf_lines(doc, range(len(doc)))
        npages = len(doc)
    # 머리말·꼬리말: 같은 높이·같은 글이 여러 쪽에 되풀이되는 줄
    from collections import Counter
    key = lambda l: (round(l["y0"] / 5), re.sub(r"\d+", "#", l["text"].strip()))
    cnt = Counter(key(l) for l in lines)
    thr = max(3, int(npages * 0.3))
    marker = re.compile(r"^A?\d{1,2}$")
    # 행 번호와 "a)"·"i."·글머리 기호 같은 표지는 쪽마다 같은 자리에 되풀이되지만 머리말이 아니다.
    list_mark = re.compile(r"\s*([a-eA-E]\)|[ivxIVX]+\.|[가-하][.)]|[•·\-\uf06c\uf0a1\uf0a7\uf0b7]|[①-⑩])\s*")
    lines = [l for l in lines
             if (marker.match(l["text"].strip()) and 85 <= l["x0"] <= 120) or list_mark.fullmatch(l["text"]) or cnt[key(l)] < thr]
    marks = [l for l in lines if l["bold"] and marker.match(l["text"].strip()) and 85 <= l["x0"] <= 120]
    pages_with_marks = {m["page"] for m in marks}
    rows = {m["text"].strip(): [] for m in marks}
    for l in lines:
        t = l["text"].strip()
        # 정답 칸(x<170의 "a" "b, c"…)·LO/K-레벨/배점 칸(x≥625)은 해설이 아니다. 세트마다 해설 칸의 왼쪽
        # 끝이 달라(D는 x≈160) 140 미만만 버리고, 170 미만은 보기 글자뿐인 줄만 정답 칸으로 본다.
        if l in marks or t in HEADER_CELLS or l["x0"] < 140 or l["x0"] >= 625:
            continue
        if l["x0"] < 170 and re.fullmatch(r"[a-e](\s*,\s*[a-e])*", t):
            continue
        cand = [m for m in marks if m["page"] == l["page"] and m["y0"] <= l["y0"] + 8]
        if cand:
            lab = max(cand, key=lambda m: m["y0"])["text"].strip()
        else:
            prev = [m for m in marks if m["page"] < l["page"]]
            # 마커가 하나도 없는 쪽은 표의 다른 구획(부록 정답표 등)이다 — 앞 행의 이어짐이 아니다.
            if not prev or l["page"] not in pages_with_marks:
                continue
            lab = prev[-1]["text"].strip()
        rows[lab].append(l)
    return rows


CSTS2018_PDF = "2018년도 CSTS 자격시험 예제(일반등급).pdf"
SECTION_HEAD = re.compile(r"^\s*\[.*문항 예제\]\s*$")
NUM_HEAD = re.compile(r"^\s*(\d{1,2})\.\s*(\S.*)?$")


def csts2018_expl_blocks():
    """CSTS 2018 "정답 및 해설" 절 → {문항번호: {"answer": 정답 줄, "body": [해설 줄], "table": [표 칸 줄]}}.
    "N. 정답" 줄(x≈85)이 문항 경계다. 표 칸은 x가 85보다 오른쪽에 있다."""
    with fitz.open(CS / CSTS2018_PDF) as doc:
        start = next(i for i, pg in enumerate(doc) if "정답 및 해설" in pg.get_text())
        lines = [l for l in pdf_lines(doc, range(start, len(doc)))
                 if not PAGE_NOISE.match(l["text"]) and not SECTION_HEAD.match(l["text"]) and "정답 및 해설" not in l["text"]]
    blocks, cur = {}, None
    for l in lines:
        m = NUM_HEAD.match(l["text"]) if abs(l["x0"] - 85) < 3 else None
        if m:
            cur = blocks.setdefault(int(m.group(1)), {"answer": l["text"], "body": [], "table": []})
        elif cur is not None:
            cur["table" if l["x0"] > 88 else "body"].append(l)
    return blocks


# 표 머리글 예외: PDF가 두 층으로 나눈 머리글을 JSON이 한 줄로 펴 쓴 곳(눈으로 확인). 표 전체를 면제하지 않는다 —
# JSON 머리글이 여기 적은 모양과 정확히 같을 때만 그 한 줄을 PDF 모양으로 바꿔 비교하고, 본문 행은 그대로 맞춘다.
# (세트, 문항): (JSON 머리글, PDF 머리글, 사유)
TABLE_HEADER = {
    ("csts/csts-2019-general.json", 31): (
        ["TC#", "상태(입력)", "입력값(입력)", "예상출력"],
        ["TC#", "입력상태", "입력값", "예상출력"],
        "PDF는 \"입력\" 아래 \"상태\"·\"값\"으로 나뉜 두 층 머리글 — JSON은 한 줄로 펴서 \"(입력)\"을 붙였다",
    ),
}


def with_pdf_header(rel, number, rows):
    """등록된 머리글이면 그 줄만 PDF 모양으로 바꾼 표를 돌려준다(비교용)."""
    reg = TABLE_HEADER.get((rel, number))
    if reg and rows and list(rows[0]) == reg[0]:
        return [list(reg[1])] + [list(r) for r in rows[1:]]
    return rows


# 표가 그림(PNG)으로 실린 문항: PDF 표 격자는 있지만 JSON에는 표 블록이 아니라 그림으로 있다(그림을 눈으로 확인).
# (세트, 문항): (그런 표의 개수, 그 문항의 그림 경로). 표 개수가 다르거나(표 블록을 지웠다) 그림이 지워지거나 바뀌면
# 실패한다 — 그림이 표를 대신 보여 주는 조건이기 때문이다.
# "정답" 상자와, 칸 글자가 JSON 코드·본문에 그대로 있는 표는 등록하지 않아도 된다.
TABLE_AS_FIGURE = {
    ("istqb/sample-b.json", 22): (1, ["source-visuals/B22-artery-table.png"]),
    ("istqb/sample-b.json", 31): (1, ["source-visuals/B31-project-effort.png"]),
    ("istqb/sample-c.json", 22): (1, ["/images/questions/ISTQB-FL-V4-C-022.png"]),
    ("istqb/sample-d.json", 22): (1, ["source-visuals/D22-classification-table.png"]),
    ("istqb/sample-d.json", 23): (1, ["source-visuals/D23-hotel-transition.png"]),
    ("csts/csts-2402-fl.json", 30): (1, ["/images/questions/CSTS-FL-2402-030.png"]),
    ("csts/csts-2402-fl.json", 31): (2, ["/images/questions/CSTS-FL-2402-031.png"]),
    ("csts/csts-2403-fl.json", 26): (1, ["/images/questions/CSTS-FL-2403-026.png"]),
    ("csts/csts-2404-fl.json", 33): (4, ["/images/questions/CSTS-FL-2404-033.png"]),
    ("csts/csts-2404-fl.json", 67): (1, ["/images/questions/CSTS-FL-2404-067.png"]),
    ("csts/csts-2405-fl.json", 33): (1, ["/images/questions/CSTS-FL-2405-033.png"]),
    ("csts/csts-2018-general.json", 9): (1, ["/images/questions/CSTS-EL-2018-009.png"]),
    ("csts/csts-2019-general.json", 65): (1, ["/images/questions/CSTS-EL-2019-065.png"]),
    ("csts/csts-example-answer-included.json", 33): (4, ["/images/questions/CSTS-EL-SW-EXAMPLE-033.png"]),
}


def figure_refs(node, out=None):
    """문항 JSON 안의 그림 파일 경로(figure·src) 목록."""
    out = [] if out is None else out
    if isinstance(node, list):
        for x in node:
            figure_refs(x, out)
    elif isinstance(node, dict):
        for k, v in node.items():
            if k in ("figure", "src") and isinstance(v, str) and re.search(r"\.(png|jpe?g|svg|webp)$", v, re.I):
                out.append(v)
            else:
                figure_refs(v, out)
    return out


def unmatched_grids(q, here, used):
    """이 문항 자리의 PDF 표 격자 중 JSON 표 블록과 짝지어지지 않았고, "정답" 상자도 JSON 글에 그대로 있는 표도 아닌 것."""
    parts = json_fields(q, "body", tables=True) + json_fields(q, "expl", tables=True)
    for b in q.get("stem") or []:
        if isinstance(b, dict) and b.get("type") == "code":
            parts += [ln if isinstance(ln, str) else ln.get("text", "") for ln in b.get("lines", [])]
    text = canon("".join(parts))
    out = []
    for e in here:
        if id(e) in used or e[3][0][0] == "정답":
            continue
        cells = [c for r in e[3] for c in r if len(c) >= 2]
        if sum(len(c) for c in cells) >= 8 and all(c in text for c in cells):
            continue
        out.append(e)
    return out


def check_structured():  # [1] 코드 줄·표 칸
    """지문의 코드 블록·표를 그 문항의 PDF 자리에서 대조한다. norm()은 + - =를 지우므로 따로 본다."""
    total = bad = 0
    for rel, pdf, maxq, base, appendix in question_sets():
        blocks, missing = question_lines(base / pdf, maxq, REVERSE_SKIP_PAGES.get(pdf, 0), appendix)
        if blocks is None:
            fail(f"[코드·표] {rel}: PDF에서 문항 {missing}번 시작을 찾지 못함")
            continue
        entries = pdf_grids(base / pdf)
        for q in load(rel)["questions"]:
            qlines = blocks.get(q["number"], [])
            other = canon("".join(json_fields(q, "body", tables=True) + json_fields(q, "expl", tables=True)))
            here, used = scope_grids(entries, qlines), set()
            for b in struct_blocks(q):
                total += 1
                if b["type"] == "code":
                    if not code_block_ok(b.get("lines", []), qlines, other) and ("code", rel, q["number"]) not in ALLOW:
                        bad += 1
                        fail(f"[코드] {rel} Q{q['number']}: 코드 블록이 이 문항의 PDF 줄과 다름 — 첫 줄 {str((b.get('lines') or [''])[0])[:40]!r}")
                elif b.get("rows") and not table_ok(with_pdf_header(rel, q["number"], b["rows"]), here, used) and ("table", rel, q["number"]) not in ALLOW:
                    bad += 1
                    fail(f"[표] {rel} Q{q['number']}: 이 문항 자리의 PDF 표 격자와 칸이 다름 — 머리 {b['rows'][0][:4]}")
            left = unmatched_grids(q, here, used)
            want, want_figs = TABLE_AS_FIGURE.get((rel, q["number"]), (0, None))
            if len(left) != want:
                bad += 1
                fail(f"[표] {rel} Q{q['number']}: PDF 표 {len(left)}개가 JSON 표 블록과 짝지어지지 않음(그림으로 실린 표로 등록된 수 {want}) — 머리 {[e[3][0][:3] for e in left][:2]}")
            elif want_figs is not None and figure_refs(q) != want_figs:
                bad += 1
                fail(f"[표] {rel} Q{q['number']}: 표를 대신 보여 주는 그림이 등록된 것과 다름 — 등록 {want_figs} / 지금 {figure_refs(q)}")
    print(f"[1b/3 코드·표] 코드 블록·표 {total} · 불일치 {bad}")


def check_explanations():  # [5]
    total = bad = 0
    # ① ISTQB — 해설 칸 글자가 JSON 해설과 같은가
    for k, (_, expl_pdf) in ISTQB_PDF.items():
        rows = istqb_expl_rows(DATA / expl_pdf)
        sets = [(f"istqb/sample-{k.lower()}.json", "")] + ([("istqb/sample-extra.json", "A")] if k == "A" else [])
        for rel, prefix in sets:
            for q in load(rel)["questions"]:
                lines = rows.get(f"{prefix}{q['number']}")
                total += 1
                if not lines:
                    fail(f"[해설] {rel} Q{q['number']}: PDF 해설 행을 찾지 못함")
                    bad += 1
                    continue
                want = norm("".join(l["text"] for l in lines))
                got = with_pdf_typo(rel, q["number"], norm("".join(json_fields(q, "expl", tables=True))))
                if want != got:
                    bad += 1
                    i = next((i for i, (a, b) in enumerate(zip(want, got)) if a != b), min(len(want), len(got)))
                    fail(f"[해설] {rel} Q{q['number']}: PDF와 글자가 다름 — PDF …{want[max(0, i - 6):i + 12]}… / JSON …{got[max(0, i - 6):i + 12]}…")
                elif ops_seq("".join(l["text"] for l in lines)) != ops_seq("".join(json_fields(q, "expl", tables=True))):
                    # norm()은 + - = < >를 지우므로 글자가 같아도 수식이 달라질 수 있다 — 연산자 순서를 따로 맞춘다.
                    bad += 1
                    fail(f"[해설] {rel} Q{q['number']}: 수식 속 연산자가 PDF와 다름 — PDF {ops_seq(''.join(l['text'] for l in lines))} / JSON {ops_seq(''.join(json_fields(q, 'expl', tables=True)))}")
    # ② CSTS 2018 — "정답 및 해설" 절을 문항별로 나눠, PDF 해설 글과 그 문항의 JSON 해설 글이 양방향으로 같은가.
    #    표는 PDF 표 격자와 칸 단위로 맞춘다(table_ok).
    blocks = csts2018_expl_blocks()
    qs = load("csts/csts-2018-general.json")["questions"]
    if sorted(blocks) != [q["number"] for q in qs]:
        fail(f"[해설] csts-2018-general.json: PDF 정답 및 해설 문항 번호 {sorted(blocks)} ≠ JSON {[q['number'] for q in qs]}")
        bad += 1
    for q in qs:
        blk = blocks.get(q["number"])
        if not blk:
            continue
        # 양방향: PDF 해설 글과 JSON 해설 글이 같아야 한다. 다른 문항의 해설이 덧붙어도 걸린다.
        want = norm("".join(l["text"] for l in blk["body"]))
        got = norm("".join(t for t in json_fields(q, "expl") if t != PLACEHOLDER))
        total += len(blk["body"])
        if want != got:
            bad += 1
            i = next((i for i, (x, y) in enumerate(zip(want, got)) if x != y), min(len(want), len(got)))
            fail(f"[해설] csts-2018-general.json Q{q['number']}: PDF와 글자가 다름 — PDF …{want[max(0, i - 6):i + 12]}… / JSON …{got[max(0, i - 6):i + 12]}… (PDF {len(want)}자 / JSON {len(got)}자)")
        elif ops_seq("".join(l["text"] for l in blk["body"])) != ops_seq("".join(t for t in json_fields(q, "expl") if t != PLACEHOLDER)):
            bad += 1
            fail(f"[해설] csts-2018-general.json Q{q['number']}: 수식 속 연산자가 PDF와 다름")
        # 그 문항의 해설 블록에 표 칸 줄이 있어야 하고, 그 자리(쪽·세로 범위)의 표 격자와만 맞춘다.
        # 맞춘 격자는 문항 안에서 한 번만 쓴다 — 같은 표를 해설에 두 번 넣어도 걸린다.
        here, used = scope_grids(pdf_grids(CS / CSTS2018_PDF), blk["table"]), set()
        for tb in (b for b in (q.get("explanation") or []) if isinstance(b, dict) and b.get("type") == "table"):
            total += 1
            if not blk["table"] or not table_ok(tb["rows"], here, used):
                bad += 1
                fail(f"[해설] csts-2018-general.json Q{q['number']}: 해설 표가 이 문항 자리의 PDF 표 격자와 칸 단위로 다름 — 머리 {tb['rows'][0][:4]}")
        # 반대쪽도: 이 문항 해설 자리의 PDF 표는 JSON 해설 표가 하나씩 맞춰야 한다(표 블록을 통째로 지워도 걸린다).
        left = [e for e in here if id(e) not in used]
        if left:
            total += 1
            bad += 1
            fail(f"[해설] csts-2018-general.json Q{q['number']}: 해설 자리의 PDF 표 {len(left)}개가 JSON 해설 표와 짝지어지지 않음")
    print(f"[5/6 해설] ISTQB 행 + CSTS 2018 해설 줄 {total} · 불일치 {bad}")


def main():
    check_text()
    check_structured()
    check_answers()
    check_underlines()
    check_reverse()
    check_explanations()
    check_spacing()
    if FAILS:
        print(f"\n❌ PDF 정합성 검증 실패 {len(FAILS)}건", file=sys.stderr)
        for f in FAILS:
            print(" -", f, file=sys.stderr)
        sys.exit(1)
    print("\n✅ PDF 정합성 검증 통과 (텍스트·정답·밑줄·역방향·해설·줄바꿈 공백)")


if __name__ == "__main__":
    main()
