import json
import os
import re
from difflib import SequenceMatcher
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "DATA"
QUESTIONS = json.loads((ROOT / "www" / "questions.json").read_text(encoding="utf-8"))
OUT = ROOT / "tmp"
OUT.mkdir(exist_ok=True)


def source_pdfs():
    result = {}
    for path in DATA.glob("*.pdf"):
        name = path.name
        if "\uc815\ub2f5" in name:
            continue
        match = re.search(r"_([ABCD])_v", name)
        if match:
            result[match.group(1)] = path
    return result


def clean_pdf_text(text):
    text = re.sub(r"Korean Software Testing Qualifications Board", " ", text)
    text = re.sub(r"www\.kstqb\.org\s*I\s*info@kstqb\.org", " ", text)
    text = re.sub(r"\b\d+\s+of\s+\d+\b", " ", text)
    text = text.replace("\uf06c", " ").replace("\uf0a1", " ")
    return text


def normalize(text):
    text = clean_pdf_text(str(text or ""))
    replacements = {
        "\u201c": '"',
        "\u201d": '"',
        "\u2018": "'",
        "\u2019": "'",
        "\u2013": "-",
        "\u2014": "-",
        "\u2264": "<=",
        "\u2265": ">=",
        "\u00b0": "도",
        "\u2212": "-",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[·•:;,.!?()\[\]{}|/\\\"'`~_\-]", "", text)
    return text.lower()


def find_starts(doc, labels, x_min=55, x_max=100):
    starts = {}
    for label in labels:
        candidates = []
        for page_index, page in enumerate(doc):
            for rect in page.search_for(label):
                if x_min <= rect.x0 <= x_max and 60 <= rect.y0 <= 800:
                    candidates.append((page_index, rect))
        if candidates:
            starts[label] = min(candidates, key=lambda item: (item[0], item[1].y0))
    return starts


def chunk_for(doc, starts, labels, index):
    label = labels[index]
    page_index, start_rect = starts[label]
    if index + 1 < len(labels) and labels[index + 1] in starts:
        end_page, end_rect = starts[labels[index + 1]]
    else:
        end_page, end_rect = doc.page_count - 1, fitz.Rect(0, doc[-1].rect.height - 50, 0, doc[-1].rect.height - 50)

    parts = []
    for current_page in range(page_index, end_page + 1):
        page = doc[current_page]
        top = max(60, start_rect.y0 - 8) if current_page == page_index else 60
        bottom = min(page.rect.height - 45, end_rect.y0 - 8) if current_page == end_page else page.rect.height - 45
        if bottom <= top:
            continue
        clip = fitz.Rect(40, top, page.rect.width - 40, bottom)
        parts.append(page.get_text(clip=clip, sort=True))
    return clean_pdf_text("\n".join(parts))


def compare_field(pdf_norm, value):
    value_norm = normalize(value)
    if not value_norm:
        return True, 1.0
    if value_norm in pdf_norm:
        return True, 1.0
    # Long table-heavy fields can differ in extraction order. Use a ratio as a second signal.
    ratio = SequenceMatcher(None, value_norm[:2500], pdf_norm[:4000]).ratio()
    return ratio >= 0.92, ratio


def fields_for(question):
    result = [("stem", question.get("stem", ""))]
    for option in question.get("options", []):
        result.append((f"option.{option.get('key')}", option.get("text", "")))
    return result


def main():
    pdfs = source_pdfs()
    chunks = {}
    for set_id in ["A", "B", "C", "D"]:
        doc = fitz.open(pdfs[set_id])
        labels = [f"{number}." for number in range(1, 41)]
        starts = find_starts(doc, labels)
        if len(starts) != 40:
            missing = [label for label in labels if label not in starts]
            raise RuntimeError(f"{set_id}: missing starts {missing}")
        for index, label in enumerate(labels):
            chunks[(set_id, index + 1)] = chunk_for(doc, starts, labels, index)

    # EXTRA set is the appendix A1-A26 in the sample A question PDF.
    doc = fitz.open(pdfs["A"])
    extra_labels = [f"A{number}." for number in range(1, 27)]
    starts = find_starts(doc, extra_labels)
    if len(starts) != 26:
        missing = [label for label in extra_labels if label not in starts]
        raise RuntimeError(f"EXTRA: missing starts {missing}")
    for index, label in enumerate(extra_labels):
        chunks[("EXTRA", index + 1)] = chunk_for(doc, starts, extra_labels, index)

    findings = []
    for set_item in QUESTIONS["sets"]:
        set_id = set_item["id"]
        for question in set_item["questions"]:
            number = question["number"]
            pdf_text = chunks[(set_id, number)]
            pdf_norm = normalize(pdf_text)
            for field, value in fields_for(question):
                ok, ratio = compare_field(pdf_norm, value)
                if not ok:
                    findings.append(
                        {
                            "set": set_id,
                            "number": number,
                            "field": field,
                            "ratio": round(ratio, 4),
                            "value_preview": str(value)[:220],
                            "pdf_preview": pdf_text[:350],
                        }
                    )

    (OUT / "pdf-question-compare.json").write_text(json.dumps(findings, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# PDF Question Compare",
        "",
        f"Total mismatches: {len(findings)}",
        "",
    ]
    for item in findings:
        lines.append(f"## {item['set']}-{item['number']} {item['field']} ratio={item['ratio']}")
        lines.append(f"- app: {item['value_preview'].replace(chr(10), ' ')}")
        lines.append(f"- pdf: {item['pdf_preview'].replace(chr(10), ' ')}")
        lines.append("")
    (OUT / "pdf-question-compare.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"mismatches={len(findings)}")
    print(OUT / "pdf-question-compare.md")


if __name__ == "__main__":
    main()
