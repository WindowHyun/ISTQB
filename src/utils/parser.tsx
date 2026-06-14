// @ts-nocheck
import React, { useRef, useEffect } from 'react';

// === Extracted Vanilla Parsers ===
function buildRichBlocks(text) {
    if (Array.isArray(text)) {
      return text.flatMap((block) => normalizeQuestionBlock(block));
    }
    const cleaned = splitKnownSectionHeadings(
      normalizeReadableCharacters(stripPdfNoise(text)),
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
    const blocks = [];
    let pendingList = [];

    const flushList = () => {
      if (pendingList.length > 0) {
        blocks.push({ type: "list", items: pendingList });
        pendingList = [];
      }
    };

    lines.forEach((line) => {
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
    return blocks;
  }

  function normalizeQuestionBlock(block) {
    if (!block || typeof block !== "object") return [];
    const type = block.type || "paragraph";
    if (type === "image" && block.src)
      return [{ type: "image", src: block.src }];
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
              ? { marker: `${index + 1}.`, text: item }
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

  function parseStructuredItem(line) {
    const match = line.match(
      /^(\d+\.|\(\d+\)|[A-E]\.|[a-e]\)|(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.|[\u2022\uF06C\uF0A1\uF0A7\uF0B7])\s*(.+)$/i,
    );
    if (!match) return null;
    return { marker: match[1], text: match[2].trim() };
  }

  function renderStructuredList(items) {
    const list = document.createElement("span");
    list.className = "structured-list";
    items.forEach((item) => {
      const row = document.createElement("span");
      row.className = "structured-line";
      const marker = document.createElement("span");
      marker.className = "structured-marker";
      marker.textContent = isBulletMarker(item.marker) ? "•" : item.marker;
      const body = document.createElement("span");
      body.textContent = item.text;
      row.append(marker, body);
      list.appendChild(row);
    });
    return list;
  }

  function renderCodeBlock(lines) {
    const block = document.createElement("span");
    block.className = "code-block";
    block.textContent = lines.join("\n");
    return block;
  }

  function renderReferenceImage(src) {
    const frame = document.createElement("div");
    frame.className = "reference-image-frame";
    const image = document.createElement("img");
    image.className = "reference-image";
    image.src = src;
    image.alt = "문제 참고 이미지";
    image.loading = "lazy";
    image.draggable = false;
    image.addEventListener("click", () => openFigureModal(src, image.alt));
    frame.appendChild(image);
    return frame;
  }

  function isBulletMarker(marker) {
    return /^[\u2022\uF06C\uF0A1\uF0A7\uF0B7]$/.test(marker);
  }

  function renderDataTable(block) {
    const wrapper = document.createElement("div");
    wrapper.className = "table-image-frame";
    const image = document.createElement("img");
    image.className = "table-image";
    image.src = tableSvgDataUrl(block.rows);
    image.alt = "문제 참고 표";
    image.loading = "lazy";
    image.draggable = false;
    image.addEventListener("click", () =>
      openFigureModal(image.src, image.alt),
    );
    wrapper.appendChild(image);
    return wrapper;
  }

  function tableSvgDataUrl(rows) {
    const normalizedRows = rows.map((row) =>
      row.map((cell) => String(cell || "")),
    );
    const columnCount = Math.max(...normalizedRows.map((row) => row.length), 1);
    const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
      const longest = Math.max(
        ...normalizedRows.map((row) => visualLength(row[columnIndex] || "")),
        4,
      );
      return Math.min(Math.max(longest * 10 + 30, 78), 210);
    });
    const rowHeight = 42;
    const width = columns.reduce((sum, value) => sum + value, 0) + 2;
    const height = normalizedRows.length * rowHeight + 2;
    let y = 1;
    const body = normalizedRows
      .map((row, rowIndex) => {
        let x = 1;
        const cells = columns
          .map((columnWidth, columnIndex) => {
            const value = escapeSvg(row[columnIndex] || "");
            const fill =
              rowIndex === 0 ? "#e8efe7" : rowIndex % 2 ? "#ffffff" : "#fbfcfa";
            const weight = rowIndex === 0 ? 700 : 500;
            const cell = `
                  <rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight}" fill="${fill}" stroke="#b9c6b8"/>
                  <text x="${x + columnWidth / 2}" y="${y + 26}" text-anchor="middle" font-size="15" font-weight="${weight}" fill="#1f2d24">${value}</text>
                `;
            x += columnWidth;
            return cell;
          })
          .join("");
        y += rowHeight;
        return cells;
      })
      .join("");
    const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="100%" height="100%" fill="#ffffff"/>
            ${body}
          </svg>
        `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function visualLength(value) {
    return Array.from(String(value || "")).reduce(
      (sum, char) => sum + (char.charCodeAt(0) > 255 ? 1.7 : 1),
      0,
    );
  }

  function escapeSvg(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeKnownTables(text) {
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

  function normalizeCstsIpoTable(text) {
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

  function normalizeTrainingDecisionTable(text) {
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

  function normalizeChoiceClassTable(text) {
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

  function normalizeTruthTable(text) {
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

  function normalizePseudoCodeBlocks(text) {
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

  function normalizeGenericCodeBlocks(text) {
    const lines = String(text || "").split("\n");
    const blocks = [];
    let codeLines = [];
    const isCodeLine = (line) => {
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

  function normalizePlanningPokerTable(text) {
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

  function normalizeExecutionHistoryTable(text) {
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

  function normalizeRestaurantPriorityTable(text) {
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

  function normalizeArteryDecisionTable(text) {
    const pattern =
      /규칙 1\s+규칙 2\s+규칙 3\s+규칙 4\s+규칙 5\s+조건\s+콜레스테롤\(mg\/dl\)\s+≤ 124\s+≤ 124\s+125 - 200\s+125-200\s+≥ 201\s+혈압\(mmHg\)\s+≤ 140\s+> 140\s+≤ 140\s+> 140\s+-\s+결과\s+위험 수준\s+매우 낮음\s+낮음\s+중간\s+높음\s+매우 높음/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["항목", "규칙 1", "규칙 2", "규칙 3", "규칙 4", "규칙 5"],
      ["콜레스테롤(mg/dl)", "≤ 124", "≤ 124", "125 - 200", "125-200", "≥ 201"],
      ["혈압(mmHg)", "≤ 140", "> 140", "≤ 140", "> 140", "-"],
      ["위험 수준", "매우 낮음", "낮음", "중간", "높음", "매우 높음"],
    ];
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/B22-artery-table.png\n",
    );
  }

  function normalizeClassificationDecisionTable(text) {
    const pattern =
      /R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+C1:\s+나이\s+0-18\s+19-65\s+19-65\s+>65\s+0-18\s+19-65\s+>65\s+C2:\s+경험\s+-\s+0-4\s+>4\s+-\s+-\s+-\s+-\s+C3:\s+등록유무\s+NO\s+NO\s+NO\s+NO\s+YES\s+YES\s+YES\s+분류\s+A\s+A\s+B\s+B\s+B\s+D\s+C/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["항목", "R1", "R2", "R3", "R4", "R5", "R6", "R7"],
      ["C1: 나이", "0-18", "19-65", "19-65", ">65", "0-18", "19-65", ">65"],
      ["C2: 경험", "-", "0-4", ">4", "-", "-", "-", "-"],
      ["C3: 등록유무", "NO", "NO", "NO", "NO", "YES", "YES", "YES"],
      ["분류", "A", "A", "B", "B", "B", "D", "C"],
    ];
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/D22-classification-table.png\n",
    );
  }

  function normalizeDrivingDecisionTable(text) {
    const pattern =
      /R1\s+R2\s+R3\s+C1:\s+첫 시험 도전\?\s+-\s+-\s+F\s+C2:\s+이론 시험 합격\?\s+T\s+F\s+-\s+C3:\s+실기 시험 합격\?\s+T\s+-\s+F\s+운전 면허 발급\?\s+X\s+운전 강습 추가 요청\?\s+X\s+시험 재-응시 요청\?\s+X/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["항목", "R1", "R2", "R3"],
      ["C1: 첫 시험 도전?", "-", "-", "F"],
      ["C2: 이론 시험 합격?", "T", "F", "-"],
      ["C3: 실기 시험 합격?", "T", "-", "F"],
      ["운전 면허 발급?", "X", "", ""],
      ["운전 강습 추가 요청?", "", "X", ""],
      ["시험 재-응시 요청?", "", "", "X"],
    ];
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/C22-driving-table.png\n",
    );
  }

  function normalizeHotelTransitionTable(text) {
    const pattern =
      /이벤트\s+상태\s+예약 가능\s+예약 불가\s+객실 변경\s+취소\s+결제\s+S1:\s+요청 중\s+S2\s+S3\s+S2:\s+확인됨\s+S1\s+S4\s+S4\s+S3:\s+대기자 명단\s+S2\s+S4\s+S4:\s+종료/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["상태", "예약 가능", "예약 불가", "객실 변경", "취소", "결제"],
      ["S1: 요청 중", "S2", "S3", "", "", ""],
      ["S2: 확인됨", "", "", "S1", "S4", "S4"],
      ["S3: 대기자 명단", "S2", "", "", "S4", ""],
      ["S4: 종료", "", "", "", "", ""],
    ];
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/D23-hotel-transition.png\n",
    );
  }

  function normalizeTraceabilityMatrix(text) {
    const pattern =
      /Req 1\s+Req 2\s+Req 3\s+Req 4\s+Req 5\s+Req 6\s+Req 7\s+TC1\s+X\s+X\s+X\s+X\s+TC2\s+X\s+X\s+X\s+TC3\s+X\s+X\s+TC4\s+X/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["TC", "Req 1", "Req 2", "Req 3", "Req 4", "Req 5", "Req 6", "Req 7"],
      ["TC1", "X", "", "X", "X", "", "", "X"],
      ["TC2", "X", "", "", "", "X", "", "X"],
      ["TC3", "", "", "", "X", "X", "", ""],
      ["TC4", "", "X", "", "", "", "", ""],
    ];
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/D32-traceability.png\n",
    );
  }

  function normalizeDecisionTable(text) {
    if (!/조건\s+R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+R8/.test(text)) return text;
    const pattern =
      /조건\s+R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+R8\s+회원\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+반납기한 경과\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+15회 대여\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+결과\s+20% 할인\s+([\sX]*?)\s+티셔츠 선물\s+([\sX]*?)(?=\s+고객 관리|\s+다음 중|$)/;
    const match = text.match(pattern);
    if (!match) return text;
    const rules = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"];
    const rows = [
      ["항목", ...rules],
      ["회원", ...match[1].split(/\s+/)],
      ["반납기한 경과", ...match[2].split(/\s+/)],
      ["15회 대여", ...match[3].split(/\s+/)],
      ["20% 할인", "", "X", "", "X", "", "", "", ""],
      ["티셔츠 선물", "", "", "X", "X", "", "", "", "X"],
    ];
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/A22-decision-table.png\n",
    );
  }

  function normalizeTestPriorityTable(text) {
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

  function normalizeFinalGradeTable(text) {
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

  function normalizeProjectEffortTable(text) {
    const pattern =
      /프로젝트 개발 노력\(\$\) 테스트 노력\(\$\)\s+P1\s+([\d,]+)\s+([\d,]+)\s+P2\s+([\d,]+)\s+([\d,]+)\s+P3\s+([\d,]+)\s+([\d,]+)\s+P4\s+([\d,]+)\s+([\d,]+)/;
    const match = text.match(pattern);
    if (!match) return text;
    const rows = [
      ["프로젝트", "개발 노력($)", "테스트 노력($)"],
      ["P1", match[1], match[2]],
      ["P2", match[3], match[4]],
      ["P3", match[5], match[6]],
      ["P4", match[7], match[8]],
    ];
    return text.replace(
      match[0],
      "\n__IMAGE__:source-visuals/B31-project-effort.png\n",
    );
  }

  function normalizeSortLogTable(text) {
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
    const meta = logText
      .replace(/TC1\s+실행[\s\S]*/, "")
      .replace(/^환경 구성:\s*/, "")
      .replace(/\s*,\s*/g, "\n")
      .trim();
    return `${introSplit[0].trim()}\n__IMAGE__:source-visuals/B38-sort-log.png\n${questionText.trim()}`;
  }

  function compactCell(text) {
    return String(text || "")
      .replace(/\d{1,2}:\d{2}:\d{2}\.\d{3}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  
// === React Wrapper ===
export const RichText = ({ content: text }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      renderRichText(ref.current, text);
    }
  }, [text]);
  return <div ref={ref} className="rich-text-container" />;
};
