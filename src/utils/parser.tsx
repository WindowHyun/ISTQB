import React, { useRef, useEffect } from 'react';
import { openImageLightbox } from './lightbox';

// 파서가 다루는 콘텐츠 블록 (loosely-typed; PDF 추출 산출물).
type ListItem = { marker: string; text: string };
type Block = {
  type: string;
  text?: string;
  items?: Array<ListItem | string>;
  rows?: string[][];
  lines?: string[];
  src?: string;
  marker?: string;
};

// === Extracted Vanilla Parsers ===
function buildRichBlocks(text: unknown): Block[] {
    if (Array.isArray(text)) {
      // 파싱(보기 마커 인식 등) 전에 PDF 분할 조각을 먼저 이어붙인다.
      // 예: "…보증(Q"+"A) 부서라고 한"+"다." → "…보증(QA) 부서라고 한다." (한 문장)
      // 이렇게 해야 "A)"가 줄머리로 보기 항목으로 오분류되는 것을 막는다.
      return mergeTextContinuations(text as Block[]).flatMap((block) =>
        normalizeQuestionBlock(block),
      );
    }
    const cleaned = splitKnownSectionHeadings(
      normalizeReadableCharacters(stripPdfNoise(text as string)),
    );
    const formatted = normalizePseudoCodeBlocks(normalizeKnownTables(cleaned));
    const lines = formatted
      .split("\n")
      .flatMap((line) =>
        line.startsWith("__TABLE__:") ||
        line.startsWith("__CODE__:") ||
        line.startsWith("__IMAGE__:")
          ? [line]
          : splitStructuralMarkers(line).split("\n"),
      )
      .map((line) => line.trim())
      .filter(Boolean);
    const blocks: Block[] = [];
    let pendingList: ListItem[] = [];
    let pendingTable: string[][] = [];

    const flushList = () => {
      if (pendingList.length > 0) {
        blocks.push({ type: "list", items: pendingList });
        pendingList = [];
      }
    };
    const flushTable = () => {
      if (pendingTable.length > 0) {
        blocks.push({ type: "table", rows: pendingTable });
        pendingTable = [];
      }
    };

    lines.forEach((line) => {
      // 마크다운 파이프 표("| a | b |" + 구분행 "|---|---|")를 실제 표로 인식.
      const isPipeRow = /^\|.*\|$/.test(line) && line.split("|").length >= 3;
      if (isPipeRow) {
        flushList();
        if (!/^\|[\s:|-]+\|$/.test(line)) {
          pendingTable.push(
            line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()),
          );
        }
        return;
      }
      flushTable();
      if (line.startsWith("__TABLE__:")) {
        flushList();
        blocks.push({ type: "table", rows: JSON.parse(line.slice(10)) });
        return;
      }
      if (line.startsWith("__IMAGE__:")) {
        flushList();
        blocks.push({ type: "image", src: line.slice(10).trim() });
        return;
      }
      if (line.startsWith("__CODE__:")) {
        flushList();
        blocks.push({ type: "code", lines: JSON.parse(line.slice(9)) });
        return;
      }
      const listItem = parseStructuredItem(line);
      if (listItem) {
        pendingList.push(listItem);
        return;
      }
      flushList();
      blocks.push({ type: "text", text: line });
    });
    flushList();
    flushTable();
    return blocks;
  }

  // 이미지 블록의 src는 src 필드 또는 text의 마크다운(![..](url))에 들어올 수 있다.
  function extractImageSrc(block: Block): string {
    if (block.src) return String(block.src);
    const text = String(block.text || "");
    const md = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (md) return md[1].trim();
    return "";
  }

  function normalizeQuestionBlock(block: Block): Block[] {
    if (!block || typeof block !== "object") return [];
    const type = block.type || "paragraph";
    if (type === "image") {
      const src = extractImageSrc(block);
      return src ? [{ type: "image", src }] : [];
    }
    if (type === "table" && Array.isArray(block.rows)) {
      return [{ type: "table", rows: block.rows }];
    }
    if (type === "code") {
      const lines = Array.isArray(block.lines)
        ? block.lines
        : String(block.text || "").split("\n");
      return [{ type: "code", lines: lines.map(String).filter(Boolean) }];
    }
    if (type === "list" && Array.isArray(block.items)) {
      return [
        {
          type: "list",
          items: block.items.map((item, index) =>
            typeof item === "string"
              ? // 문자열 항목이 이미 마커("1.", "A.", "(가)" 등)를 가지면 그대로 살리고,
                // 없을 때만 순번을 부여한다. (마커 이중 표기 "1. A." 방지 — 데이터 불변)
                parseStructuredItem(item) || { marker: `${index + 1}.`, text: item }
              : {
                  marker: item.marker || `${index + 1}.`,
                  text: item.text || "",
                },
          ),
        },
      ];
    }
    const value = String(block.text || "").trim();
    if (!value) return [];
    if (["paragraph", "formula"].includes(type)) return buildRichBlocks(value);
    return [{ type, text: value }];
  }

  function parseStructuredItem(line: string): ListItem | null {
    // \uB2E4\uB2E8\uACC4 \uBC88\uD638("1.1", "2.3.1")\uB97C \uB2E8\uC77C \uBC88\uD638("1.")\uBCF4\uB2E4 \uBA3C\uC800 \uB9E4\uCE6D\uD574
    // "1.1 \uAE30\uB2A5"\uC774 marker "1." + text "1 \uAE30\uB2A5"\uC73C\uB85C \uCABC\uAC1C\uC9C0\uB294 \uAC83\uC744 \uB9C9\uB294\uB2E4.
    const match = line.match(
      /^(\d+(?:\.\d+)+\.?|\d+\.|\(\d+\)|[A-E]\.|[a-e]\)|(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.|[\u2022\uF06C\uF0A1\uF0A7\uF0B7])\s*(.+)$/i,
    );
    if (!match) return null;
    return { marker: match[1], text: match[2].trim() };
  }

  // "1.1"\u00B7"2.3.1" \uAC19\uC740 \uB2E4\uB2E8\uACC4 \uBC88\uD638\uC758 \uAE4A\uC774(1=\uCD5C\uC0C1\uC704). \uB4E4\uC5EC\uC4F0\uAE30 \uB80C\uB354\uC5D0 \uC4F4\uB2E4.
  function markerDepth(marker: string): number {
    const m = marker.match(/^\d+((?:\.\d+)+)\.?$/);
    return m ? m[1].split(".").length : 1;
  }

  function renderStructuredList(items: ListItem[]): HTMLElement {
    const list = document.createElement("span");
    list.className = "structured-list";
    items.forEach((item) => {
      const row = document.createElement("span");
      row.className = "structured-line";
      // 하위 번호("1.1"·"2.3.1")는 상위 항목 아래로 들여쓴다(요구사항 트리 표기).
      const depth = markerDepth(item.marker);
      if (depth > 1) row.classList.add(`indent-${Math.min(depth - 1, 3)}`);
      const marker = document.createElement("span");
      marker.className = "structured-marker";
      marker.textContent = isBulletMarker(item.marker) ? "•" : item.marker;
      const body = document.createElement("span");
      appendTextWithUnderline(body, item.text);
      row.append(marker, body);
      list.appendChild(row);
    });
    return list;
  }

  // 텍스트 중 <u>…</u> 구간만 실제 밑줄로 렌더한다(그 외 태그는 해석하지 않음 — XSS 안전).
  // 문제 지문의 "밑줄 친 부분"(2405 Q63·2403 Q65)을 PDF 원본대로 표시하기 위한 최소 인라인 마크업.
  function appendTextWithUnderline(target: HTMLElement, text: string): void {
    const parts = String(text).split(/<u>([\s\S]*?)<\/u>/);
    parts.forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 1) {
        const u = document.createElement("u");
        u.textContent = part;
        target.appendChild(u);
      } else {
        target.appendChild(document.createTextNode(part));
      }
    });
  }

  function renderCodeBlock(lines: string[]): HTMLElement {
    const block = document.createElement("span");
    block.className = "code-block";
    block.textContent = lines.join("\n");
    return block;
  }

  function renderReferenceImage(src: string): HTMLElement {
    const frame = document.createElement("div");
    frame.className = "reference-image-frame";
    const image = document.createElement("img");
    image.className = "reference-image";
    image.src = src;
    image.alt = "문제 참고 이미지";
    image.loading = "lazy";
    image.draggable = false;
    image.addEventListener("click", () => openFigureModal(src));
    frame.appendChild(image);
    return frame;
  }

  function isBulletMarker(marker: string): boolean {
    return /^[\u2022\uF06C\uF0A1\uF0A7\uF0B7]$/.test(marker);
  }

  function renderDataTable(block: Block): HTMLElement {
    // SVG 이미지(고정 폭, 줄바꿈 불가 → 긴 셀 겹침/잘림) 대신 실제 HTML 표로 렌더.
    const wrapper = document.createElement("div");
    wrapper.className = "data-table-wrap";
    const table = document.createElement("table");
    table.className = "data-table";
    (block.rows || []).forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      (row || []).forEach((cell) => {
        const el = document.createElement(rowIndex === 0 ? "th" : "td");
        el.textContent = String(cell ?? "");
        tr.appendChild(el);
      });
      table.appendChild(tr);
    });
    wrapper.appendChild(table);
    return wrapper;
  }

  function normalizeKnownTables(text: string): string {
    return normalizePlanningPokerTable(
      normalizeSortLogTable(
        normalizeDecisionTable(
          normalizeTraceabilityMatrix(
            normalizeHotelTransitionTable(
              normalizeDrivingDecisionTable(
                normalizeClassificationDecisionTable(
                  normalizeArteryDecisionTable(
                    normalizeRestaurantPriorityTable(
                      normalizeExecutionHistoryTable(
                        normalizeTestPriorityTable(
                          normalizeFinalGradeTable(
                            normalizeProjectEffortTable(
                              normalizeCstsIpoTable(
                                normalizeTruthTable(
                                  normalizeChoiceClassTable(
                                    normalizeTrainingDecisionTable(text),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function normalizeCstsIpoTable(text: string): string {
    const pattern =
      /입력 인자\s+A\s+B\s+C\s+값\s+A1\s+B1\s+C1\s+A2\s+B2\s+C2\s+A3\s+-\s+C3\s+테스트 케이스\s+A\s+B\s+C\s+A1\s+B1\s+C1\s+A1\s+B2\s+C2\s+A2\s+B1\s+C3\s+A2\s+B2\s+C1\s+A3\s+B1\s+C2\s+A3\s+B2\s+C3\s+A1\s+-\s+C3\s+A2\s+-\s+C2\s+\(\s*\)\s+-\s+\(\s*\)/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["입력 인자", "A", "B", "C"],
      ["값", "A1", "B1", "C1"],
      ["", "A2", "B2", "C2"],
      ["", "A3", "-", "C3"],
      ["", "", "", ""],
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
    ];
    return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
  }

  function normalizeTrainingDecisionTable(text: string): string {
    const pattern =
      /규칙\s+1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+(?:조건|조\s+건)\s+B등급 이상\s+Y\s+Y\s+Y\s+Y\s+N\s+N\s+N\s+N\s+10년차 이상\s+Y\s+Y\s+N\s+N\s+Y\s+Y\s+N\s+N\s+공로상 수상\s+Y\s+N\s+Y\s+N\s+Y\s+N\s+Y\s+N\s+(?:행위|행\s+위)\s+프랑스\s+Y\s+Y\s+F\s+F\s+F\s+F\s+F\s+F\s+싱가포르\s+F\s+F\s+Y\s+Y\s+F\s+F\s+F\s+F\s+스페인\s+Y\s+F\s+Y\s+F\s+F\s+F\s+F\s+F/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      [
        "",
        "규칙 1",
        "규칙 2",
        "규칙 3",
        "규칙 4",
        "규칙 5",
        "규칙 6",
        "규칙 7",
        "규칙 8",
      ],
      ["조건: B등급 이상", "Y", "Y", "Y", "Y", "N", "N", "N", "N"],
      ["조건: 10년차 이상", "Y", "Y", "N", "N", "Y", "Y", "N", "N"],
      ["조건: 공로상 수상", "Y", "N", "Y", "N", "Y", "N", "Y", "N"],
      ["행위: 프랑스", "Y", "Y", "F", "F", "F", "F", "F", "F"],
      ["행위: 싱가포르", "F", "F", "Y", "Y", "F", "F", "F", "F"],
      ["행위: 스페인", "Y", "F", "Y", "F", "F", "F", "F", "F"],
    ];
    return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
  }

  function normalizeChoiceClassTable(text: string): string {
    const pattern =
      /목적지\s+등급\s+좌석\s+파리\s+퍼스트\s+창가\s+런던\s+비즈니스\s+통로\s+(?:(시드니)\s+)?이코노미/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["입력 인자", "클래스 1", "클래스 2", "클래스 3"],
      ["목적지", "파리", "런던", match[1] || ""],
      ["등급", "퍼스트", "비즈니스", "이코노미"],
      ["좌석", "창가", "통로", ""],
    ];
    return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
  }

  function normalizeTruthTable(text: string): string {
    const pattern =
      /테스트 케이스 ID\s+A\s+B\s+A or B\s+\(가\)\s+T\s+T\s+T\s+\(나\)\s+T\s+F\s+T\s+\(다\)\s+F\s+T\s+T\s+\(라\)\s+F\s+F\s+F/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["테스트 케이스 ID", "A", "B", "A or B"],
      ["(가)", "T", "T", "T"],
      ["(나)", "T", "F", "T"],
      ["(다)", "F", "T", "T"],
      ["(라)", "F", "F", "F"],
    ];
    return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
  }

  function normalizePseudoCodeBlocks(text: string): string {
    const pattern =
      /INPUT:\s*(.*?)\s+IF\s*\((.*?)\)\s+THEN\s+write\s+([“"][^”"]+[”"])\s+ELSE\s+write\s+([“"][^”"]+[”"])/i;
    const normalized = String(text || "").replace(
      pattern,
      (_, input, condition, thenValue, elseValue) => {
        const lines = [
          `INPUT: ${input.trim()}`,
          `IF (${condition.trim()})`,
          `THEN write ${thenValue.trim()}`,
          `ELSE write ${elseValue.trim()}`,
        ];
        return `\n__CODE__:${JSON.stringify(lines)}\n`;
      },
    );
    return normalizeGenericCodeBlocks(normalized);
  }

  function normalizeGenericCodeBlocks(text: string): string {
    const lines = String(text || "").split("\n");
    const blocks: string[] = [];
    let codeLines: string[] = [];
    const isCodeLine = (line: string) => {
      const value = String(line || "").trim();
      return (
        /^[{}]$/.test(value) ||
        /[;{}]/.test(value) ||
        /^(?:int|void|float|double|char|boolean|String|if|else|return|for|while|switch|IF|ELSE|THEN|END|ENDIF|READ|PRINT)\b/.test(
          value,
        ) ||
        /^[A-Za-z_]\w*\s*=/.test(value)
      );
    };
    const flushCode = () => {
      blocks.push(
        ...(codeLines.length >= 3
          ? [`__CODE__:${JSON.stringify(codeLines)}`]
          : codeLines),
      );
      codeLines = [];
    };
    lines.forEach((line, index) => {
      const value = line.trim();
      const next = lines[index + 1]?.trim() || "";
      const numberedCodeLine =
        /^\d+$/.test(value) && (isCodeLine(next) || codeLines.length > 0);
      if (isCodeLine(value) || numberedCodeLine) {
        codeLines.push(value);
        return;
      }
      flushCode();
      blocks.push(line);
    });
    flushCode();
    return blocks.join("\n");
  }

  function normalizePlanningPokerTable(text: string): string {
    const pattern =
      /(?:\ud300\uc6d0\ub4e4\uc758 \ucd94\uc815\s+)?1\s+\ub77c\uc6b4\ub4dc\s+((?:\d+\s+){6}\d+)\s+2\s+\ub77c\uc6b4\ub4dc\s+((?:\d+\s+){6}\d+)\s+3\s+\ub77c\uc6b4\ub4dc\s+((?:\d+\s+){6}\d+)/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      [
        "\ub77c\uc6b4\ub4dc",
        "\ucd94\uc815 1",
        "\ucd94\uc815 2",
        "\ucd94\uc815 3",
        "\ucd94\uc815 4",
        "\ucd94\uc815 5",
        "\ucd94\uc815 6",
        "\ucd94\uc815 7",
      ],
    ];
    [1, 2, 3].forEach((round) => {
      rows.push([String(round), ...match[round].trim().split(/\s+/)]);
    });
    return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
  }

  function normalizeExecutionHistoryTable(text: string): string {
    const pattern =
      /첫 번째 실행\s+두 번째 실행\s+세 번째 실행\s+TC1\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+TC2\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+TC3\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [["TC", "첫 번째 실행", "두 번째 실행", "세 번째 실행"]];
    for (let row = 0; row < 3; row += 1) {
      const offset = row * 6 + 1;
      rows.push([
        `TC${row + 1}`,
        `(${match[offset]}) ${match[offset + 1]}`,
        `(${match[offset + 2]}) ${match[offset + 3]}`,
        `(${match[offset + 4]}) ${match[offset + 5]}`,
      ]);
    }
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/A14-execution-history.png\n",
    );
  }

  function normalizeRestaurantPriorityTable(text: string): string {
    const header = "번호 커버되는 테스트 컨디션 우선순위 논리적 종속성";
    const start = text.indexOf(header);
    if (start < 0) return text;
    const tail = text.slice(start + header.length);
    const pattern =
      /(TC\d{3})\s+(.+?)\s+(\d+)\s+(.+?)(?=\s+TC\d{3}\s+|다음 중|$)/g;
    const rows = [
      ["번호", "커버되는 테스트 컨디션", "우선순위", "논리적 종속성"],
    ];
    let match;
    let consumed = 0;
    while ((match = pattern.exec(tail))) {
      rows.push([match[1], match[2].trim(), match[3], match[4].trim()]);
      consumed = pattern.lastIndex;
    }
    if (rows.length < 3) return text;
    return `${text.slice(0, start).trim()}\n${header}\n__TABLE__:${JSON.stringify(rows)}\n${tail.slice(consumed).trim()}`;
  }

  function normalizeArteryDecisionTable(text: string): string {
    const pattern =
      /규칙 1\s+규칙 2\s+규칙 3\s+규칙 4\s+규칙 5\s+조건\s+콜레스테롤\(mg\/dl\)\s+≤ 124\s+≤ 124\s+125 - 200\s+125-200\s+≥ 201\s+혈압\(mmHg\)\s+≤ 140\s+> 140\s+≤ 140\s+> 140\s+-\s+결과\s+위험 수준\s+매우 낮음\s+낮음\s+중간\s+높음\s+매우 높음/;
    const match = text.match(pattern);
    if (!match) return text;
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/B22-artery-table.png\n",
    );
  }

  function normalizeClassificationDecisionTable(text: string): string {
    const pattern =
      /R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+C1:\s+나이\s+0-18\s+19-65\s+19-65\s+>65\s+0-18\s+19-65\s+>65\s+C2:\s+경험\s+-\s+0-4\s+>4\s+-\s+-\s+-\s+-\s+C3:\s+등록유무\s+NO\s+NO\s+NO\s+NO\s+YES\s+YES\s+YES\s+분류\s+A\s+A\s+B\s+B\s+B\s+D\s+C/;
    const match = text.match(pattern);
    if (!match) return text;
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/D22-classification-table.png\n",
    );
  }

  function normalizeDrivingDecisionTable(text: string): string {
    const pattern =
      /R1\s+R2\s+R3\s+C1:\s+첫 시험 도전\?\s+-\s+-\s+F\s+C2:\s+이론 시험 합격\?\s+T\s+F\s+-\s+C3:\s+실기 시험 합격\?\s+T\s+-\s+F\s+운전 면허 발급\?\s+X\s+운전 강습 추가 요청\?\s+X\s+시험 재-응시 요청\?\s+X/;
    const match = text.match(pattern);
    if (!match) return text;
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/C22-driving-table.png\n",
    );
  }

  function normalizeHotelTransitionTable(text: string): string {
    const pattern =
      /이벤트\s+상태\s+예약 가능\s+예약 불가\s+객실 변경\s+취소\s+결제\s+S1:\s+요청 중\s+S2\s+S3\s+S2:\s+확인됨\s+S1\s+S4\s+S4\s+S3:\s+대기자 명단\s+S2\s+S4\s+S4:\s+종료/;
    const match = text.match(pattern);
    if (!match) return text;
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/D23-hotel-transition.png\n",
    );
  }

  function normalizeTraceabilityMatrix(text: string): string {
    const pattern =
      /Req 1\s+Req 2\s+Req 3\s+Req 4\s+Req 5\s+Req 6\s+Req 7\s+TC1\s+X\s+X\s+X\s+X\s+TC2\s+X\s+X\s+X\s+TC3\s+X\s+X\s+TC4\s+X/;
    const match = text.match(pattern);
    if (!match) return text;
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/D32-traceability.png\n",
    );
  }

  function normalizeDecisionTable(text: string): string {
    if (!/조건\s+R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+R8/.test(text)) return text;
    const pattern =
      /조건\s+R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+R8\s+회원\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+반납기한 경과\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+15회 대여\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+결과\s+20% 할인\s+([\sX]*?)\s+티셔츠 선물\s+([\sX]*?)(?=\s+고객 관리|\s+다음 중|$)/;
    const match = text.match(pattern);
    if (!match) return text;
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/A22-decision-table.png\n",
    );
  }

  function normalizeTestPriorityTable(text: string): string {
    const header = "테스트 우선순위(1 = 가장 높은 우선순위)";
    const headerIndex = text.indexOf(header);
    if (headerIndex < 0) return text;

    const tail = text.slice(headerIndex + header.length);
    const rows = [["테스트 케이스", "설명", "우선순위"]];
    const pattern = /TC(\d+)\s+(.+?)\s+(\d+)(?=\s+TC\d+\s+|\s+또한|또한|$)/g;
    let match;
    let consumed = 0;
    while ((match = pattern.exec(tail))) {
      rows.push([`TC${match[1]}`, match[2].trim(), match[3]]);
      consumed = pattern.lastIndex;
    }
    if (rows.length < 3) return text;

    const before = text.slice(0, headerIndex);
    const after = tail.slice(consumed).trim();
    return `${before.trim()}\n${header}\n__IMAGE__:source-visuals/B32-test-priority.png\n${after}`;
  }

  function normalizeFinalGradeTable(text: string): string {
    const header = "최종 점수 최종 성적";
    const headerIndex = text.indexOf(header);
    if (headerIndex < 0) return text;

    const tail = text.slice(headerIndex + header.length);
    const rows = [["테스트 케이스", "최종 점수", "최종 성적"]];
    const pattern =
      /TC(\d+)\s+(\d+)\s+(.+?)(?=\s+TC\d+\s+\d+|\s+테스트 케이스로|\s+다음 중|$)/g;
    let match;
    let consumed = 0;
    while ((match = pattern.exec(tail))) {
      rows.push([`TC${match[1]}`, match[2], match[3].trim()]);
      consumed = pattern.lastIndex;
    }
    if (rows.length < 3) return text;

    const before = text.slice(0, headerIndex);
    const after = tail.slice(consumed).trim();
    return `${before.trim()}\n__IMAGE__:source-visuals/A21-final-grade.png\n${after}`;
  }

  function normalizeProjectEffortTable(text: string): string {
    const pattern =
      /프로젝트 개발 노력\(\$\) 테스트 노력\(\$\)\s+P1\s+([\d,]+)\s+([\d,]+)\s+P2\s+([\d,]+)\s+([\d,]+)\s+P3\s+([\d,]+)\s+([\d,]+)\s+P4\s+([\d,]+)\s+([\d,]+)/;
    const match = text.match(pattern);
    if (!match) return text;
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/B31-project-effort.png\n",
    );
  }

  function normalizeSortLogTable(text: string): string {
    if (!/테스트 실행 로그/.test(text) || !/TC1\s+실행/.test(text)) return text;
    const questionSplit = text.match(/([\s\S]*?)(다음 중[\s\S]*)$/);
    const mainText = questionSplit ? questionSplit[1] : text;
    const questionText = questionSplit ? questionSplit[2] : "";
    const introSplit = mainText.split(/환경 구성:/);
    if (introSplit.length < 2) return text;

    const rows = [["TC", "입력", "출력", "결과"]];
    const logText = `환경 구성:${introSplit.slice(1).join("환경 구성:")}`;
    const tcPattern =
      /TC(\d+)\s+실행\.\s+입력:\s*([\s\S]*?)\s+출력:\s*([\s\S]*?)\s+결과:\s*(통과|실패)/g;
    let match;
    while ((match = tcPattern.exec(logText))) {
      rows.push([
        `TC${match[1]}`,
        compactCell(match[2]),
        compactCell(match[3]),
        match[4],
      ]);
    }
    if (rows.length === 1) return text;
    return `${introSplit[0].trim()}\n__IMAGE__:source-visuals/B38-sort-log.png\n${questionText.trim()}`;
  }

  function compactCell(text: string): string {
    return String(text || "")
      .replace(/\d{1,2}:\d{2}:\d{2}\.\d{3}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  
// PDF 추출 노이즈 제거 — parser.tsx 추출 시 누락되어 buildRichBlocks에서 ReferenceError를 유발했음(복원).
function stripPdfNoise(text: string): string {
  return String(text || "")
    .replace(/Korean Software Testing Qualifications Board[^\n]*/gi, "")
    .replace(/www\.kstqb\.org\s+I\s+info@kstqb\.org(?:\s+\d+\s+of\s+\d+)?/gi, "")
    .replace(/www\.kstqb\.org\s*/gi, "")
    .replace(/info@kstqb\.org\s*/gi, "")
    .replace(/\b\d+\s+of\s+\d+\b/gi, "")
    .replace(/실\s+무/g, "실무")
    .replace(/수행\s+하고/g, "수행하고")
    .replace(/실행\s+하는/g, "실행하는")
    .replace(/제공\s+되었다/g, "제공되었다")
    .replace(/초과\s+하는/g, "초과하는")
    .replace(/포함\s+되어/g, "포함되어")
    .replace(/등록\s+하지/g, "등록하지")
    .replace(/유지\s+된다/g, "유지된다")
    .replace(/대출\s+되어/g, "대출되어")
    .replace(/처리\s+되며/g, "처리되며")
    .replace(/표시\s+되지/g, "표시되지")
    .replace(/할\s+인/g, "할인")
    .replace(/테스트 케이\s+스/g, "테스트 케이스")
    .replace(/케\s+이스/g, "케이스")
    .replace(/테\s+스트/g, "테스트")
    .replace(/테스\s+트/g, "테스트")
    .replace(/시\s+간/g, "시간")
    .replace(/나타\s+낸/g, "나타낸")
    .replace(/같\s+은/g, "같은")
    .replace(/요구사\s+항/g, "요구사항")
    .replace(/비\s+즈니스/g, "비즈니스")
    .replace(/컴포\s+넌트/g, "컴포넌트")
    .replace(/사\s+용자/g, "사용자")
    .replace(/두\((\d+)\)\s+개/g, "두($1)개")
    .replace(/\s{2,}/g, " ");
}

function normalizeReadableCharacters(text: string): string {
  const roman: Record<string, string> = {
    Ⅰ: "I", Ⅱ: "II", Ⅲ: "III", Ⅳ: "IV", Ⅴ: "V",
    Ⅵ: "VI", Ⅶ: "VII", Ⅷ: "VIII", Ⅸ: "IX", Ⅹ: "X",
    ⅰ: "i", ⅱ: "ii", ⅲ: "iii", ⅳ: "iv", ⅴ: "v",
    ⅵ: "vi", ⅶ: "vii", ⅷ: "viii", ⅸ: "ix", ⅹ: "x",
  };
  return String(text || "").replace(
    /[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]/g,
    (value) => roman[value] || value,
  );
}

function splitKnownSectionHeadings(text: string): string {
  const headings = [
    "당신은 다음과 같이 테스트 케이스 세트를 도출했다:",
    "테스트 케이스로 달성한",
    "다음과 같은 테스트 활동이 있다:",
    "그리고 다음과 같은 테스트 활동이 있다:",
    "다음과 같은 완화 활동이 있다.",
    "그리고 다음과 같은 완화 활동이 있다.",
    "다음 중 위",
    "다음 중 이",
    "다음 중 업무와",
    "다음 중 테스트",
    "어떤 테스트 케이스가",
  ];
  return headings.reduce(
    (value, heading) => value.split(heading).join(`\n${heading}`),
    text,
  );
}

function splitStructuralMarkers(text: string): string {
  return String(text || "")
    .replace(
      /(^|\s)(?=(?:\d+\.|[A-E]\.|[가-차]\.|[•])\s)/g,
      "$1\n",
    )
    .replace(/\s*(?=\b(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.\s)/gi, "\n")
    .replace(/\s*(?=(?:Given:|When:|Then:|And:)\s)/g, "\n")
    .replace(
      /\s*\|\s*(?=(?:제목:|심각도:|우선순위:|환경:|설명:|재현 절차:|첨부파일:)\s*)/g,
      "\n",
    )
    .replace(/\s+(?=(?:다음 중\s|다음 중이\s|다음 중에서\s|다음 예시 중\s))/g, "\n")
    .replace(/\s+(?=다음 테스트\s)/g, "\n")
    .replace(/\s+(?=그래프는\s)/g, "\n")
    .replace(/\s+(?=테스트 스위트에 이미\s)/g, "\n")
    .replace(/\s+(?=3점 추정 기법을\s)/g, "\n")
    .replace(/\s+(?=(?:인수 조건:|AC\d+:)\s*)/g, "\n")
    .replace(
      /\s+(?=(?:결함 ID:|제목:|애플리케이션:|결함:|재현 절차:|심각도:|우선순위:|환경:|설명:|첨부파일:)\s*)/g,
      "\n",
    )
    .replace(/(^|\s)([a-e]\))\s+/g, "$1\n$2 ")
    .replace(
      /\s*(?=(?:당신은 다음과 같이 테스트 케이스 세트를 도출했다:|테스트 케이스로 달성한))/g,
      "\n",
    )
    .replace(
      // "사전 조건은…"은 "모든 테스트 케이스의"까지 포함해 통째로 분리한다 —
      // 부분 매칭이면 데이터가 이미 단락 분리된 경우 "모든 테스트 케이스의"만 고아 줄로 남는다(D Q29).
      /\s*(?=(?:리뷰 활동은 다음과 같다:|그리고 다음과 같은 완화 활동이 있다\.|다음 중 위|다음 중 분석한|테스트 도구 분류는 다음과 같다:|구현된 기능은 다음과 같다:|모든 테스트 케이스의 사전 조건은 다음과 같다:))/g,
      "\n",
    )
    .replace(/\s+(?=그리고 다음과 같은 설명이 있다:)/g, "\n")
    .replace(/\s*(?=(?:환경 구성:|테스트 케이스 세트:|TC\d+\s+실행))/g, "\n")
    .replace(/\s*(따라서:)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 그림/표 클릭 시 앱 내 라이트박스로 확대(새 탭으로 이탈하지 않음).
function openFigureModal(src: string): void {
  openImageLightbox(src);
}

// PDF 추출 과정에서 한 문장이 여러 블록으로 쪼개진 경우(예: "…테스트한"+"다.",
// "…개발(ATD"+"D) 접근법…")를 표시 단계에서 다시 이어붙인다.
// ※ 데이터 파일(문제 내용·정답)은 일절 수정하지 않으며, 렌더 시점에만 합친다.
function mergeTextContinuations(blocks: Block[]): Block[] {
  const TERMINAL = /[.?!…。」』:)\]]$/;
  // 떨어져 나온 한국어 종결 어미만 매칭("~다." / "~다 " / "~다," / "~다)").
  // "다음"처럼 뒤에 다른 음절이 붙는 경우는 제외해 과병합을 막는다.
  const KO_TAIL = /^다(?:[\s.,)\]]|$)/;
  // 뒤에 내용이 없는 "다."(어미만 떨어져 나온 조각). 항목 마커 뒤라도 합쳐야 함.
  const KO_BARE_TAIL = /^다[\s.,)\]]*$/;
  // 한글 항목 마커("가. ", "나. ", "(가)", "①" 등) — 이런 줄은 새 항목이므로,
  // 직전 줄이 이런 항목이면 내용이 있는 "다. …"는 다음 항목으로 보고 합치지 않는다.
  const KO_ENUM = /^(\([가-힣]\)|[가-힣]\.|[①-⑳]|[ⓐ-ⓩ])\s/;
  // 텍스트 계열 블록(데이터에 paragraph/prompt/text/note/formula 등으로 들어옴)만 병합 대상.
  // note 포함: CSTS 각주(※…)도 PDF 추출로 "…의미한"+"다."처럼 조각나는 동일 클래스(2402 Q2).
  // formula 포함: 수식도 "E(" + "5) = …"처럼 괄호가 열린 채 조각난다(B Q23·C Q31).
  const isTextLike = (b: Block | undefined): boolean =>
    !!b && typeof b.text === "string" && ["text", "prompt", "paragraph", "note", "formula"].includes(b.type || "");
  const out: Block[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (isTextLike(block) && isTextLike(prev)) {
      const p = (prev.text as string).trim();
      const c = (block.text as string).trim();
      // (A) 한국어 어미가 떨어져 나온 경우: "…한" + "다." → "…한다."
      //     직전 줄이 한글 항목 마커여도, cur이 내용 없는 "다."(어미)면 합친다.
      //     내용이 있는 "다. …"는 다음 항목일 수 있으므로 항목 마커 뒤에서는 합치지 않는다.
      const koTail =
        !TERMINAL.test(p) &&
        KO_TAIL.test(c) &&
        (KO_BARE_TAIL.test(c) || !KO_ENUM.test(p));
      // (B) 괄호가 열린 채 끊긴 경우(괄호 내용이 다음 블록으로 이어짐):
      //     "…품질 보증(Q"+"A) …" / "…개발(ATD"+"D) …" / "…인가?("+"단 …)" / "…이다.("+"○/X)"
      const openParen = p.split("(").length - p.split(")").length > 0;
      // (C) "빈칸"+"①…"처럼 빈칸 참조 기호가 떨어져 나온 경우.
      const blankRef = /빈\s?칸$/.test(p) && /^[①-⑳]/.test(c);
      if (koTail || openParen || blankRef) {
        // prev는 복사본이므로 변형해도 원본 데이터(stem 배열)를 건드리지 않는다.
        prev.text = `${prev.text}${block.text}`;
        continue;
      }
    }
    out.push({ ...block });
  }
  return out;
}

// 블록 목록을 대상 DOM에 렌더한다. (RichText가 호출하나 parser.tsx 추출 시 누락되어
// 'renderRichText is not defined' 런타임 크래시를 유발했음 — 복원)
function renderRichText(target: HTMLElement, text: unknown): void {
  target.replaceChildren();
  const blocks = mergeTextContinuations(buildRichBlocks(text));
  blocks.forEach((block) => {
    if (block.type === "image") {
      if (block.src) target.appendChild(renderReferenceImage(block.src));
      return;
    }
    if (block.type === "table") {
      target.appendChild(renderDataTable(block));
      return;
    }
    if (block.type === "code") {
      target.appendChild(renderCodeBlock(block.lines || []));
      return;
    }
    if (block.type === "list") {
      target.appendChild(renderStructuredList((block.items || []) as ListItem[]));
      return;
    }
    const line = document.createElement("span");
    line.className = "text-line";
    const value = block.text ?? "";
    // note/text 라인 중 하위 번호("1.1 …")로 시작하면 들여쓴다(구조화 리스트와 동일 규칙).
    const sub = value.match(/^(\d+(?:\.\d+)+)\.?\s/);
    if (sub) {
      const depth = sub[1].split(".").length - 1;
      line.classList.add(`indent-${Math.min(depth, 3)}`);
    }
    appendTextWithUnderline(line, value);
    target.appendChild(line);
  });
}

// === React Wrapper ===
export const RichText = ({ content: text }: { content: unknown }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      renderRichText(ref.current, text);
    }
  }, [text]);
  return <div ref={ref} className="rich-text-container" />;
};
