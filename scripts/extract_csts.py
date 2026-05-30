import argparse
import json
import re
import sys
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT.parent / "DATA"
OUT_JSON = ROOT / "www" / "csts-questions.json"
OUT_JS = ROOT / "www" / "csts-questions.js"
ROOT_JSON = ROOT / "csts-questions.json"
ROOT_JS = ROOT / "csts-questions.js"
OUT_FIGURES = ROOT / "www" / "csts-figures"
ROOT_FIGURES = ROOT / "csts-figures"

CIRCLED = {
    "\u2460": "a",
    "\u2461": "b",
    "\u2462": "c",
    "\u2463": "d",
    "\u2464": "e",
}

SKIP_LINE_PATTERNS = [
    r"^SW\s*\ud14c\uc2a4\ud2b8\s*\uc804\ubb38\uac00\(CSTS\)",
    r"^\ubb38\ud56d\ubc88\ud638\s+\uac80\uc815\uc720\ud615",
    r"^\d+\ubc88\s*~\s*\d+\ubc88",
    r"^20\d{2}-CSTS-",
    r"^\ud55c\uad6d\uc815\ubcf4\ud1b5\uc2e0\uae30\uc220\ud611\ud68c",
    r"^\d+\s*/\s*\d+$",
    r"^\uacf5\uac1c\s*\ub2f5\uc548$",
    r"^\uacf5\uac1c\ub2f5\uc548$",
]


def clean_line(value):
    value = str(value or "").replace("\u00a0", " ")
    value = value.replace("\u2013", "-").replace("\u2014", "-")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def is_skip_line(value):
    return any(re.search(pattern, value) for pattern in SKIP_LINE_PATTERNS)


def iter_lines(page, page_index):
    data = page.get_text("dict", sort=True)
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            text = clean_line("".join(span.get("text", "") for span in spans))
            if not text:
                continue
            x0, y0, x1, y1 = line.get("bbox", block.get("bbox"))
            yield {
                "page": page_index,
                "text": text,
                "bbox": (x0, y0, x1, y1),
            }


def question_starts(lines):
    starts = []
    for index, line in enumerate(lines):
        x0 = line["bbox"][0]
        match = re.match(r"^(\d{1,2})\.(?:\s*(.*))?$", line["text"])
        if not match or x0 > 95:
            continue
        number = int(match.group(1))
        if 1 <= number <= 99:
            starts.append((index, number))
    return starts


def canonical_question_starts(starts):
    selected = []
    expected = 1
    for position, number in starts:
        if number != expected:
            continue
        selected.append((position, number))
        expected += 1
    return selected


def normalize_chunk_lines(lines):
    result = []
    for line in lines:
        text = clean_line(line["text"])
        if not text or is_skip_line(text):
            continue
        result.append(text)
    return result


def parse_answer(answer_text):
    answer_text = clean_line(answer_text)
    first_answer = answer_text.split()[0] if answer_text else ""
    if first_answer in CIRCLED:
        return [CIRCLED[first_answer]], first_answer
    if re.fullmatch(r"[1-5]", first_answer):
        index = int(first_answer) - 1
        return [chr(ord("a") + index)], first_answer
    if first_answer.upper() in {"O", "X", "\u25cb", "\u2715"}:
        return ["o" if first_answer.upper() in {"O", "\u25cb"} else "x"], first_answer
    return [answer_text], answer_text


def split_answer(lines):
    body = []
    answer_parts = []
    in_answer = False
    for line in lines:
        match = re.match(r"^\uc815\ub2f5\s*(.*)$", line)
        if match:
            in_answer = True
            if match.group(1).strip():
                answer_parts.append(match.group(1).strip())
            continue
        if in_answer:
            if re.match(r"^\d{1,2}\.\s+", line):
                break
            if line:
                answer_parts.append(line)
        else:
            body.append(line)
    return body, clean_line(" ".join(answer_parts))


def parse_options(body_lines):
    stem_lines = []
    options = []
    current = None
    for line in body_lines:
        matches = list(re.finditer(r"[\u2460-\u2464]", line))
        if matches and matches[0].start() == 0:
            for index, match in enumerate(matches):
                if current:
                    options.append(current)
                next_start = matches[index + 1].start() if index + 1 < len(matches) else len(line)
                current = {
                    "key": CIRCLED[match.group(0)],
                    "text": clean_line(line[match.end():next_start]),
                }
            continue
        if current:
            current["text"] = clean_line(f"{current['text']} {line}")
        else:
            stem_lines.append(line)
    if current:
        options.append(current)
    return stem_lines, options


def infer_question_type(number, options, answer):
    if options:
        return "multiple_choice"
    answer_value = (answer[0] if answer else "").lower()
    if answer_value in {"o", "x"}:
        return "true_false"
    if 51 <= number <= 60:
        return "true_false"
    return "short_answer"


def remove_number_prefix(number, text):
    return re.sub(rf"^{number}\.\s*", "", text).strip()


def parse_question(number, raw_lines):
    body_lines, answer_text = split_answer(raw_lines)
    if not answer_text:
        return None
    if body_lines:
        body_lines[0] = remove_number_prefix(number, body_lines[0])
    stem_lines, options = parse_options(body_lines)
    answer, raw_answer = parse_answer(answer_text)
    question_type = infer_question_type(number, options, answer)
    if question_type == "true_false" and not options:
        options = [
            {"key": "o", "text": "O"},
            {"key": "x", "text": "X"},
        ]
    return {
        "number": number,
        "type": question_type,
        "stem": "\n".join(line for line in stem_lines if line).strip(),
        "options": options,
        "answer": answer,
        "answerText": raw_answer,
        "explanation": "",
    }


def chunk_image_rects(doc, start_line, end_line):
    rects = []
    start_page = start_line["page"]
    end_page = end_line["page"] if end_line else doc.page_count - 1
    for page_index in range(start_page, end_page + 1):
        page = doc[page_index]
        top = start_line["bbox"][1] - 8 if page_index == start_page else 40
        bottom = end_line["bbox"][1] - 8 if end_line and page_index == end_page else page.rect.height - 55
        for block in page.get_text("dict").get("blocks", []):
            if block.get("type") != 1:
                continue
            x0, y0, x1, y1 = block.get("bbox")
            if y1 < top or y0 > bottom:
                continue
            if y0 < 80 or y1 > page.rect.height - 55:
                continue
            if (x1 - x0) > page.rect.width * 0.5 and (y1 - y0) > page.rect.height * 0.25:
                continue
            if (x1 - x0) < 55 or (y1 - y0) < 45:
                continue
            rects.append((page_index, fitz.Rect(x0, y0, x1, y1)))
    return rects


def save_question_figures(doc, set_id, number, start_line, end_line):
    figures = []
    for out_dir in (OUT_FIGURES, ROOT_FIGURES):
        out_dir.mkdir(parents=True, exist_ok=True)
    for figure_index, (page_index, rect) in enumerate(chunk_image_rects(doc, start_line, end_line), start=1):
        name = f"{set_id}-{number}" if figure_index == 1 else f"{set_id}-{number}-{figure_index}"
        filename = f"{name}.png"
        pixmap = doc[page_index].get_pixmap(matrix=fitz.Matrix(2, 2), clip=rect, alpha=False)
        saved = False
        for out_dir in (OUT_FIGURES, ROOT_FIGURES):
            target = out_dir / filename
            try:
                pixmap.save(target)
                saved = True
            except Exception:
                continue
        if saved:
            figures.append(f"csts-figures/{filename}")
    return figures


def set_id_for(path):
    name = path.stem
    match = re.search(r"CSTS\s*(\d{4}FL)", name)
    if match:
        return match.group(1)
    match = re.search(r"(20\d{2})", name)
    if match:
        return f"{match.group(1)}-SAMPLE"
    return re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").upper()


def first_answer_page(lines):
    for line in lines:
        text = line["text"]
        if "\uc815\ub2f5\ud45c" in text or "\uc815\ub2f5 \ubc0f \ud574\uc124" in text:
            return line["page"]
    return None


def extract_answer_map(lines):
    answers = {}
    answer_page = first_answer_page(lines)
    if answer_page is None:
        return answers

    header_words = {
        "\uc815\ub2f5",
        "\ubc88\ud638",
        "\uc120\ud0dd\ud615(4\uc9c0\uc120\ub2e4, \uc9c4\uc704O/X)",
        "\uc11c\ub2f5\ud615(\ub2e8\ub2f5)",
        "[\uc120\ud0dd\ud615 \ubb38\ud56d \uc608\uc81c]",
        "[\uc9c4\uc704\ud615(O/X) \ubb38\ud56d \uc608\uc81c]",
        "[\uc11c\ub2f5\ud615(\ub2e8\ub2f5) \ubb38\ud56d \uc608\uc81c]",
    }
    pending_number = None
    for line in lines:
        if line["page"] < answer_page:
            continue
        text = clean_line(line["text"])
        if not text or is_skip_line(text) or text in header_words:
            continue
        inline = re.match(r"^(\d{1,2})\.\s*(.+)$", text)
        if inline:
            number = int(inline.group(1))
            if 1 <= number <= 99:
                answers[number] = clean_line(inline.group(2))
                pending_number = None
            continue
        if re.fullmatch(r"\d{1,2}", text):
            number = int(text)
            if 1 <= number <= 99:
                pending_number = number
            continue
        if pending_number is not None:
            answers[pending_number] = text
            pending_number = None
    return answers


def extract_pdf(path):
    doc = fitz.open(path)
    lines = [line for page_index, page in enumerate(doc) for line in iter_lines(page, page_index)]
    answer_map = extract_answer_map(lines)
    answer_page = first_answer_page(lines)
    starts = question_starts(lines)
    if any(line["page"] == 0 and "\uc218\ud5d8\uc790 \uc720\uc758\uc0ac\ud56d" in line["text"] for line in lines):
        starts = [item for item in starts if lines[item[0]]["page"] != 0]
    starts = canonical_question_starts(starts)
    seen = set()
    questions = []
    for start_position, number in starts:
        if answer_page is not None and lines[start_position]["page"] >= answer_page:
            continue
        next_candidates = [item for item in starts if item[0] > start_position]
        end_position = next_candidates[0][0] if next_candidates else len(lines)
        raw_chunk = normalize_chunk_lines(lines[start_position:end_position])
        if not any(line.startswith("\uc815\ub2f5") for line in raw_chunk):
            if number not in answer_map:
                continue
            raw_chunk.append(f"\uc815\ub2f5 {answer_map[number]}")
        if number in seen:
            continue
        parsed = parse_question(number, raw_chunk)
        if not parsed:
            continue
        parsed["figure"] = None
        end_line = lines[end_position] if end_position < len(lines) else None
        figures = save_question_figures(doc, set_id_for(path), number, lines[start_position], end_line)
        if figures:
            parsed["figure"] = figures[0]
            if len(figures) > 1:
                parsed["figures"] = figures
        questions.append(parsed)
        seen.add(number)
    questions.sort(key=lambda item: item["number"])
    return questions


def title_for(path):
    return path.stem


def find_source_pdfs(source):
    folders = [item for item in source.iterdir() if item.is_dir() and "CSTS" in item.name]
    source_dir = folders[0] if folders else source
    return sorted(source_dir.glob("*.pdf"))


def reset_output_dirs():
    for out_dir in (OUT_FIGURES, ROOT_FIGURES):
        if out_dir.exists():
            for item in out_dir.glob("*.png"):
                try:
                    item.unlink()
                except PermissionError:
                    pass
            continue
        out_dir.mkdir(parents=True, exist_ok=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()

    reset_output_dirs()
    sets = []
    for path in find_source_pdfs(args.source):
        questions = extract_pdf(path)
        sets.append({
            "id": set_id_for(path),
            "title": title_for(path),
            "questionPdf": path.name,
            "answerPdf": path.name,
            "questions": questions,
        })

    payload = {
        "source": "CSTS public answer PDFs",
        "sets": sets,
    }

    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    ROOT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    js_payload = "window.CSTS_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    OUT_JS.write_text(js_payload, encoding="utf-8")
    ROOT_JS.write_text(js_payload, encoding="utf-8")
    print(f"sets={len(sets)}")
    for item in sets:
        figure_count = sum(1 for question in item["questions"] if question.get("figure"))
        print(f"{item['id']}: {len(item['questions'])} questions, {figure_count} with figures")
    print(OUT_JSON)
    print(OUT_JS)
    print(ROOT_JSON)
    print(ROOT_JS)


if __name__ == "__main__":
    main()
