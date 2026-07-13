# 문제 데이터 ↔ 원본 PDF 정합성 게이트 (CI: pdf-data job / 로컬: python3 scripts/verify-pdf-data.py)
#
# 배포 전 수동 전수 검수(2026-07)에서 쓴 대조 로직을 상시 게이트로 옮긴 것.
# 세 축을 검사하며, 하나라도 어긋나면 종료 코드 1로 실패한다:
#   [1] 텍스트 — JSON의 모든 스템·보기 조각이 원본 PDF 텍스트에 존재하는가
#   [2] 정답  — PDF에서 독립 추출한 정답(626문항)과 JSON answer가 일치하는가
#   [3] 밑줄  — PDF 밑줄 선분에서 역산한 강조 위치가 해당 문항 JSON에 <u>로 존재하는가
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

FAILS = []


def fail(msg):
    FAILS.append(msg)


def raw(p):
    return re.sub(r"[\x00-\x1f\x7f]", " ", "".join(pg.get_text() for pg in fitz.open(p)))


def norm(s):
    s = re.sub(r"</?(u|b|i|em|strong|br|sub|sup)\s*/?>", "", s, flags=re.I)
    s = re.sub(r"[\x00-\x1f\x7f]", "", s)
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
    print(f"[1/3 텍스트] {total}조각 · 불일치 {bad}")


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


def main():
    check_text()
    check_answers()
    check_underlines()
    if FAILS:
        print(f"\n❌ PDF 정합성 검증 실패 {len(FAILS)}건", file=sys.stderr)
        for f in FAILS:
            print(" -", f, file=sys.stderr)
        sys.exit(1)
    print("\n✅ PDF 정합성 검증 통과 (텍스트·정답·밑줄)")


if __name__ == "__main__":
    main()
