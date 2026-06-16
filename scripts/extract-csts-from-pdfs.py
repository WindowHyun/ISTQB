from __future__ import annotations

import json
import re
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "DATA"
WWW_DATA = ROOT / "www" / "data" / "csts"
PUBLIC_DATA = ROOT / "public" / "data" / "csts"

OPTION_MARKERS = ["①", "②", "③", "④"]
OPTION_KEYS = ["a", "b", "c", "d"]


SETS = [
    {
        "json": "csts-2402-fl.json",
        "pdf_contains": ["2402FL"],
        "start_page": 1,
        "count": 70,
        "image_prefix": "2402FL",
    },
    {
        "json": "csts-2403-fl.json",
        "pdf_contains": ["2403FL"],
        "start_page": 1,
        "count": 70,
        "image_prefix": "2403FL",
    },
    {
        "json": "csts-2404-fl.json",
        "pdf_contains": ["2404FL"],
        "start_page": 1,
        "count": 70,
        "image_prefix": "2404FL",
    },
    {
        "json": "csts-2405-fl.json",
        "pdf_contains": ["2405FL"],
        "start_page": 1,
        "count": 70,
        "image_prefix": "2405FL",
    },
    {
        "json": "csts-2018-general.json",
        "pdf_contains": ["2018"],
        "start_page": 0,
        "count": 20,
        "image_prefix": "2018-SAMPLE",
    },
    {
        "json": "csts-2019-general.json",
        "pdf_contains": ["2019"],
        "start_page": 0,
        "count": 70,
        "image_prefix": "2019-SAMPLE",
    },
    {
        "json": "csts-example-answer-included.json",
        "pdf_contains": ["SW", "CSTS"],
        "start_page": 0,
        "count": 70,
        "image_prefix": "SW-CSTS",
    },
]


def pick_pdf(needles: list[str]) -> Path:
    matches = [
        path
        for path in DATA.rglob("*.pdf")
        if all(needle in path.name for needle in needles)
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one PDF for {needles}, found {matches}")
    return matches[0]


def clean_line(value: str) -> str:
    value = value.replace("\u0001", " ")
    value = value.replace("\ufffd", " ")
    value = value.replace("\uf0b7", "∙").replace("\uf0a7", "∙").replace("\uf06c", "∙")
    value = re.sub(r"\s+", " ", value)
    value = value.replace("테스 트", "테스트")
    value = value.replace("케 이스", "케이스")
    value = value.replace("소프트웨 어", "소프트웨어")
    value = value.replace("시 스템", "시스템")
    value = value.replace("검 증", "검증")
    value = value.replace("설 명", "설명")
    value = value.replace("구 매", "구매")
    value = value.replace("들 어갈", "들어갈")
    value = value.replace("테 스트", "테스트")
    value = value.replace("출력 에", "출력에")
    value = value.replace("무엇인 가", "무엇인가")
    value = value.replace("올바르지 않은것", "올바르지 않은 것")
    value = value.replace("관 점", "관점")
    value = re.sub(r"\s+([,.:;?])", r"\1", value)
    return value.strip()


def page_lines(pdf: Path, start_page: int) -> list[str]:
    doc = fitz.open(pdf)
    lines: list[str] = []
    for page_index in range(start_page, len(doc)):
        page = doc[page_index]
        for raw in page.get_text("text").splitlines():
            line = clean_line(raw)
            if not line:
                continue
            if re.search(r"^\d+\s*/\s*\d+$", line):
                continue
            if line.startswith("SW 테스트 전문가(CSTS) 자격시험"):
                continue
            if line.startswith("한국정보통신기술협회"):
                continue
            if re.match(r"^20\d{2}-CSTS-", line):
                continue
            if re.match(r"^20\d{2}-\d{2}-\d{2}$", line):
                continue
            if line in {"문항번호", "검정유형", "문제당 배점", "답안지"}:
                continue
            if re.match(r"^\d+번\s*~\s*\d+번$", line):
                continue
            if line in {"선택형(4지선다)", "선택형(진위형(O/X))", "선택형(진위형O/X)", "서답형(단답)", "객관식 답란", "선택형(O/X) 답란", "주관식 답란"}:
                continue
            if re.match(r"^\d+(?:\.\d+)?점$", line):
                continue
            if line.startswith("본 시험지는"):
                continue
            if line.startswith("본 문서는") or line.startswith("본 시험지는"):
                continue
            if line.startswith("CSTS 시험 예제"):
                continue
            if "문항 예제" in line:
                continue
            if re.match(r"^-\s*\d+\s*-$", line):
                continue
            lines.append(line)
    return lines


def split_questions(lines: list[str], count: int) -> dict[int, list[str]]:
    questions: dict[int, list[str]] = {}
    current_number: int | None = None
    current: list[str] = []

    for line in lines:
        match = re.match(r"^([1-9]\d?)\.\s*(.*)$", line)
        if match:
            number = int(match.group(1))
            if 1 <= number <= count and (
                current_number is None or number == current_number + 1
            ):
                if current_number is not None:
                    questions[current_number] = current
                current_number = number
                current = [match.group(2).strip()]
                continue
        if current_number is not None:
            current.append(line)

    if current_number is not None:
        questions[current_number] = current

    missing = [number for number in range(1, count + 1) if number not in questions]
    if missing:
        raise RuntimeError(f"Missing questions: {missing}")
    return questions


def split_answer(lines: list[str]) -> tuple[list[str], str]:
    if "정답" not in lines:
        return lines, ""
    index = lines.index("정답")
    stem_lines = lines[:index]
    answer_lines = [
        line
        for line in lines[index + 1 :]
        if not line.startswith("[정답]") and not line.startswith("문항번호")
    ]
    answer = " ".join(answer_lines).strip()
    answer = re.sub(r"\bTTA\b.*$", "", answer).strip()
    answer = re.sub(r"\s+", " ", answer)
    return stem_lines, answer


def split_options(lines: list[str]) -> tuple[list[str], list[str]]:
    joined = "\n".join(lines)
    # A marker starts an option when it appears at the beginning of a line or
    # after whitespace and is not immediately followed by a comma. This keeps
    # references such as "④ ①, ②, ③ 모두..." inside option ④.
    marker_matches = list(re.finditer(r"(?:(?<=^)|(?<=\n)|(?<=\s))([①②③④])\s*(?![,，])", joined))
    first_by_marker: dict[str, re.Match] = {}
    for match in marker_matches:
        first_by_marker.setdefault(match.group(1), match)
    ordered = [first_by_marker.get(marker) for marker in OPTION_MARKERS]
    if any(match is None for match in ordered):
        return lines, []

    first_start = ordered[0].start()
    stem_text = joined[:first_start]
    stem_lines = [clean_line(line) for line in stem_text.splitlines() if clean_line(line)]
    options = []
    for index, match in enumerate(ordered):
        assert match is not None
        start = match.end()
        end = ordered[index + 1].start() if index + 1 < len(ordered) and ordered[index + 1] else len(joined)
        options.append(clean_line(joined[start:end]))
    return stem_lines, options


def classify_blocks(lines: list[str]) -> list[dict]:
    lines = merge_wrapped_lines(lines)
    blocks: list[dict] = []
    list_items: list[dict] = []
    code_lines: list[str] = []

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            blocks.append({"type": "list", "items": list_items})
            list_items = []

    def flush_code() -> None:
        nonlocal code_lines
        if code_lines:
            blocks.append({"type": "code", "lines": code_lines})
            code_lines = []

    for line in lines:
        line = clean_line(line)
        if not line:
            continue
        if line in {"<보기>", "[보기]"} or line.startswith("※"):
            flush_list()
            flush_code()
            blocks.append({"type": "note", "text": line})
            continue
        list_match = re.match(r"^(\(?[가-힣]\)|\d+\.|\d+\)|[A-H]\.|[-∙])\s*(.+)$", line)
        if list_match and not re.match(r"^\d+\.\s", line):
            flush_code()
            list_items.append({"marker": list_match.group(1), "text": clean_line(list_match.group(2))})
            continue
        if re.match(r"^(IF|ELSE|END|RETURN|READ|PRINT|Bool|int|float|double|char|void|for|while|if|else|return|\{|\}|[A-Za-z_]\w*\s*=)", line):
            flush_list()
            code_lines.append(line)
            continue
        flush_list()
        flush_code()
        block_type = "prompt" if re.search(r"(무엇인가|무엇인지|올바른 것은|올바르지 않은 것은|고르시오|기술하시오|작성하시오)\??$", line) else "paragraph"
        blocks.append({"type": block_type, "text": line})

    flush_list()
    flush_code()
    return blocks or [{"type": "paragraph", "text": ""}]


def is_structural_line(line: str) -> bool:
    return bool(
        line in {"<보기>", "[보기]"}
        or line.startswith("※")
        or re.match(r"^(\(?[가-힣]\)|\d+\.|\d+\)|[A-H]\.|[-∙])\s+", line)
        or re.match(r"^(IF|ELSE|END|RETURN|READ|PRINT|Bool|int|float|double|char|void|for|while|if|else|return|\{|\}|[A-Za-z_]\w*\s*=)", line)
    )


def should_join_line(current: str, next_line: str) -> bool:
    if not current or not next_line:
        return False
    if is_structural_line(current) or is_structural_line(next_line):
        return False
    if current.endswith((".", "?", "!", ":", "다.", "요.", ")", "]", ">")):
        return False
    return True


def merge_wrapped_lines(lines: list[str]) -> list[str]:
    merged: list[str] = []
    buffer = ""
    for raw in lines:
        line = clean_line(raw)
        if not line:
            continue
        if not buffer:
            buffer = line
            continue
        if should_join_line(buffer, line):
            buffer = clean_line(f"{buffer}{line}" if len(line) <= 3 else f"{buffer} {line}")
        else:
            merged.append(buffer)
            buffer = line
    if buffer:
        merged.append(buffer)
    return merged


def answer_keys(answer: str, options: list[str], qtype: str) -> list[str]:
    value = answer.strip()
    if qtype == "multiple_choice":
        for index, marker in enumerate(OPTION_MARKERS):
            if marker in value:
                return [OPTION_KEYS[index]]
        numbers = re.findall(r"[1-4]", value)
        if numbers:
            return [OPTION_KEYS[int(numbers[0]) - 1]]
        for key in OPTION_KEYS:
            if value.lower() == key:
                return [key]
        return ["a"]
    if qtype == "true_false":
        return ["o" if "O" in value.upper() else "x"]
    return [value] if value else [""]


def answer_map_for(pdf: Path, meta_id: str) -> dict[int, str]:
    doc = fitz.open(pdf)
    if meta_id == "CSTS-EL-2018":
        text = "\n".join(page.get_text("text") for page in doc)
        start = text.find("정답 및 해설")
        if start >= 0:
            text = text[start:]
        answers: dict[int, str] = {}
        for match in re.finditer(r"(?m)^([1-9]\d?)\.\s*([①②③④OX]|[^\n]+)$", text):
            number = int(match.group(1))
            if 1 <= number <= 20:
                answers[number] = clean_line(match.group(2))
        # The answer page states these as prose under the short-answer section.
        answers[18] = "테스트 실행"
        answers[19] = "다중 조건 커버리지"
        answers[20] = "50%"
        return answers

    if meta_id == "CSTS-EL-2019":
        text = doc[-1].get_text("text")
        lines = [clean_line(line) for line in text.splitlines() if clean_line(line)]
        answers: dict[int, str] = {}
        for index, line in enumerate(lines[:-1]):
            if re.fullmatch(r"[1-9]\d?", line):
                number = int(line)
                if 1 <= number <= 70:
                    answers[number] = lines[index + 1]
        return answers

    return {}


def normalize_options(options: list[dict], has_image_choices: bool) -> list[dict]:
    if not options:
        return options
    if all(not option["text"].strip() for option in options):
        label = "그림" if has_image_choices else "보기"
        return [
            {**option, "text": f"{label} {index + 1}"}
            for index, option in enumerate(options)
        ]
    return [
        {**option, "text": option["text"] or f"보기 {index + 1}"}
        for index, option in enumerate(options)
    ]


def csts_2402_q31_table() -> dict:
    return {
        "type": "table",
        "rows": [
            ["입력 인자", "A", "B", "C"],
            ["값", "A1", "B1", "C1"],
            ["", "A2", "B2", "C2"],
            ["", "A3", "-", "C3"],
            ["테스트 케이스", "A", "B", "C"],
            ["", "A1", "B1", "C1"],
            ["", "A1", "B2", "C2"],
            ["", "A2", "B1", "C3"],
            ["", "A2", "B2", "C1"],
            ["", "A3", "B1", "C2"],
            ["", "A3", "B2", "C3"],
            ["", "A1", "-", "C3"],
            ["", "A2", "-", "C2"],
            ["", "( )", "-", "( )"],
        ],
    }


def existing_visuals(question: dict, image_prefix: str) -> tuple[str | None, list[dict]]:
    number = question["number"]
    figure = question.get("figure")
    image_blocks: list[dict] = [
        block for block in question.get("stem", []) if block.get("type") == "image"
    ]

    primary = ROOT / "www" / "csts-figures" / f"{image_prefix}-{number}.png"
    if primary.exists():
        figure = f"csts-figures/{image_prefix}-{number}.png"

    if number in {11, 27, 30}:
        multi = []
        for index in range(1, 5):
            suffix = "" if index == 1 else f"-{index}"
            src = f"csts-figures/{image_prefix}-{number}{suffix}.png"
            if (ROOT / "www" / src).exists():
                multi.append({"type": "note", "text": f"그림 {index}"})
                multi.append({"type": "image", "src": src})
        if multi:
            figure = None
            image_blocks = multi

    return figure, image_blocks


def rebuild_set(config: dict) -> None:
    source_path = WWW_DATA / config["json"]
    payload = json.loads(source_path.read_text(encoding="utf-8"))
    pdf = pick_pdf(config["pdf_contains"])
    external_answers = answer_map_for(pdf, payload["meta"]["id"])
    questions = split_questions(page_lines(pdf, config["start_page"]), config["count"])
    current_by_number = {question["number"]: question for question in payload["questions"]}

    rebuilt = []
    for number in range(1, config["count"] + 1):
        current = current_by_number[number]
        stem_lines, answer_text = split_answer(questions[number])
        if number in external_answers:
            answer_text = external_answers[number]
        stem_lines, options = split_options(stem_lines)

        if options:
            qtype = "multiple_choice"
            option_payload = [
                {"key": key, "text": text} for key, text in zip(OPTION_KEYS, options)
            ]
        elif any(re.search(r"\(\s*O\s*/\s*X\s*\)", line, re.I) for line in stem_lines):
            qtype = "true_false"
            option_payload = [{"key": "o", "text": "O"}, {"key": "x", "text": "X"}]
        else:
            qtype = "short_answer"
            option_payload = []

        figure, image_blocks = existing_visuals(current, config["image_prefix"])
        stem = classify_blocks(stem_lines) + image_blocks
        option_payload = normalize_options(option_payload, bool(image_blocks))

        if payload["meta"]["id"] == "CSTS-EL-2019" and number == 31:
            option_payload = [
                {"key": "a", "text": "테스트 케이스 1"},
                {"key": "b", "text": "테스트 케이스 2"},
                {"key": "c", "text": "테스트 케이스 3"},
                {"key": "d", "text": "테스트 케이스 4"},
            ]

        if payload["meta"]["id"] == "CSTS-FL-2403" and number == 2:
            stem = [
                {
                    "type": "prompt",
                    "text": "<보기>는 결함(Defect), 오류(Error) 및 장애(Failure)를 발생 순서에 따라 도식화 한 것이다. 순서가 올바른 것은?",
                },
                {"type": "note", "text": "<보기>"},
                {
                    "type": "image",
                    "src": "csts-figures/2403FL-2.png",
                    "alt": "결함, 오류, 장애 발생 순서 도식",
                },
            ]

        if payload["meta"]["id"] == "CSTS-FL-2403" and number == 26:
            stem = [
                {
                    "type": "paragraph",
                    "text": "<보기>의 진리표를 이용하여 (A or B)에 대한 결정 커버리지를 100% 달성하고자 한다. 결정 커버리지를 100% 달성할 수 있는 테스트 케이스 조합은?",
                },
                {"type": "note", "text": "<보기>"},
                {
                    "type": "table",
                    "headers": ["테스트 케이스 ID", "A", "B", "A or B"],
                    "rows": [
                        ["(가)", "T", "T", "T"],
                        ["(나)", "T", "F", "T"],
                        ["(다)", "F", "T", "T"],
                        ["(라)", "F", "F", "F"],
                    ],
                },
            ]

        if payload["meta"]["id"] == "CSTS-FL-2404" and number == 10:
            stem = [
                {
                    "type": "prompt",
                    "text": "다음 중 아래 괄호( ) 안에 들어갈 테스팅의 종류로 올바른 것은 무엇인가?",
                },
                {"type": "paragraph", "text": "김PM은 문화공연 예약 웹사이트의 총괄 PM이다."},
                {
                    "type": "paragraph",
                    "text": "김PM은 사용자 요구사항에 따라 2가지 필수 테스팅을 수행하고 결과 보고서를 제출해야 한다.",
                },
                {
                    "type": "paragraph",
                    "text": "먼저 공연 예약을 위하여 짧은 시간에 사용자가 몰릴 때 시스템의 반응을 측정하는 (가) 테스팅을 수행해야 하고, 다음으로는 예약시스템의 처리 능력 이상의 부하, 즉 임계점 이상의 사용자 예약 신청 부하를 가하여 비정상적인 상황에서의 예약 처리를 테스트하는 (나) 테스팅을 수행해야 한다.",
                },
            ]

        if payload["meta"]["id"] == "CSTS-FL-2405" and number == 43:
            stem = [
                {
                    "type": "prompt",
                    "text": "다음의 보기는 테스트 활동의 수행할 역할별로 인력을 정의한 예시이다. 역할이 틀리게 지정된 것은 무엇인가?",
                },
                {"type": "note", "text": "<보기>"},
                {
                    "type": "list",
                    "items": [
                        {"marker": "(가)", "text": "테스트 계획 관리, 테스트 종료 관리"},
                        {"marker": "(나)", "text": "테스트 모니터링, 테스트 현황 보고"},
                        {"marker": "(다)", "text": "테스트 케이스 개발, 테스트 절차 개발"},
                        {"marker": "(라)", "text": "테스트 실행, 결함 보고"},
                    ],
                },
            ]

        if payload["meta"]["id"] == "CSTS-EL-2019" and number == 11:
            stem = [
                {
                    "type": "prompt",
                    "text": "테스트 시 프로그램의 특정 모듈에서 평균 이상의 결함이 발견되었다. 이에 대한 대응 방안으로 올바른 것은 무엇인가?",
                },
                {
                    "type": "list",
                    "items": [
                        {
                            "marker": "(가)",
                            "text": "해당 부분에 대한 테스트가 충분하므로 다른 모듈들에 대해 더 많은 테스트 노력을 기울인다.",
                        },
                        {
                            "marker": "(나)",
                            "text": "많은 결함이 발견되었다는 의미는 그 부분에 더 많은 결함이 존재할 수 있다는 것이므로 그 부분에 대해 더 많은 테스트 노력을 기울여야 한다.",
                        },
                        {
                            "marker": "(다)",
                            "text": "모듈에서 발생한 결함의 수와 관계없이 모든 모듈을 동일한 테스트 노력으로 테스트를 수행하는 것이 효율적이다.",
                        },
                        {
                            "marker": "(라)",
                            "text": "소프트웨어 설계나 구조에 심각한 문제가 많은 결함을 유발하였는지 조사하고, 구조를 개선함으로써 더 많은 결함의 발생을 예방하도록 한다.",
                        },
                    ],
                },
            ]

        if payload["meta"]["id"] == "CSTS-EL-2019" and number == 37:
            stem = [
                {
                    "type": "prompt",
                    "text": "다음 설명 중에서 인스펙션에 해당하는 것을 모두 고른 것은 무엇인가?",
                },
                {
                    "type": "list",
                    "items": [
                        {"marker": "(가)", "text": "완성된 결과물이 아닌 중간 산출물을 대상으로 한다."},
                        {"marker": "(나)", "text": "참가자의 역할이 명확하다."},
                        {"marker": "(다)", "text": "검토 결과에 따라 다음 단계로 진행할지 여부를 승인한다."},
                        {"marker": "(라)", "text": "체크리스트를 사용한다."},
                    ],
                },
            ]

        if payload["meta"]["id"] == "CSTS-FL-2402" and number == 31:
            stem = [
                {
                    "type": "paragraph",
                    "text": "아래의 입력 인자 기반으로 IPO 알고리즘을 사용하여 테스트 케이스를 도출하였다.",
                },
                {
                    "type": "prompt",
                    "text": "빈칸에 들어갈 수 있는 테스트 데이터는 무엇인가?",
                },
                csts_2402_q31_table(),
            ]

        if payload["meta"]["id"] == "CSTS-EL-2018" and number == 20:
            qtype = "short_answer"
            option_payload = []
            stem = [
                {
                    "type": "paragraph",
                    "text": "아래와 같은 제어 흐름도를 갖는 프로그램이 있다. A, C, F, H와 같은 경로로 테스트를 수행했을 때, 문장 커버리지는 얼마인가? (소수점 첫째 자리에서 반올림)",
                }
            ]
            answer_text = "50%"

        if payload["meta"]["id"] == "CSTS-EL-2018" and number == 6:
            option_payload = [
                {
                    "key": "a",
                    "text": "테스트 계획, 테스트 분석 및 설계, 테스트 실행, 테스트 평가 및 개선 전체 테스트 프로세스에서 테스트 모니터링 및 통제를 실시한다.",
                },
                {
                    "key": "b",
                    "text": "테스트 관리자는 정기적으로 테스트 활동 진행을 점검하기 위해 검토회의를 개최하고 테스트 진행 상태를 확인한다.",
                },
                {
                    "key": "c",
                    "text": "테스트 관리자는 필요 시 테스트 수행에 대한 통제를 할 수 있다.",
                },
                {
                    "key": "d",
                    "text": "실제 테스트 진행사항이 계획과 다른 경우 원인을 분석하고 결과에 따라 테스트 계획 수정 및 테스트 활동 보완 등 테스트 진행을 통제할 수 있다.",
                },
            ]

        if payload["meta"]["id"] == "CSTS-EL-2018" and number == 18:
            answer_text = "테스트 실행"
        if payload["meta"]["id"] == "CSTS-EL-2018" and number == 19:
            answer_text = "다중 조건 커버리지"

        rebuilt.append(
            {
                **current,
                "type": qtype,
                "stem": stem,
                "options": option_payload,
                "answer": answer_keys(answer_text, options, qtype),
                "explanation": [{"type": "paragraph", "text": "원본 공개답안 PDF 기준 정답입니다."}],
                "figure": figure,
                "answerText": answer_text,
            }
        )

    payload["questions"] = rebuilt
    for output_dir in [WWW_DATA, PUBLIC_DATA]:
        output_path = output_dir / config["json"]
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"rebuilt {config['json']} from {pdf.relative_to(ROOT)}")


def main() -> None:
    for config in SETS:
        rebuild_set(config)


if __name__ == "__main__":
    main()
