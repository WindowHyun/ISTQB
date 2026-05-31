# CSTS Extraction Summary

## Source
- `D:\Coding\ISTQB\DATA\(공개답안) CSTS 2404FL`
- CSTS public answer PDFs and sample PDFs

## Generated Output
| Output | Purpose |
|---|---|
| `scripts/extract_csts.py` | Extract CSTS questions, answers, and raster figure crops from PDFs |
| `www/csts-questions.json` | Static CSTS data for validation or external use |
| `www/csts-questions.js` | Browser-ready CSTS data as `window.CSTS_DATA` |
| `www/csts-figures/` | CSTS figure images used by the web app |
| `csts-figures/` | Root-level copy of extracted CSTS figure images |

## Extracted Sets
| Set | Questions | Figure Questions |
|---|---:|---:|
| 2402FL | 70 | 7 |
| 2403FL | 70 | 7 |
| 2404FL | 70 | 8 |
| 2405FL | 70 | 2 |
| 2018-SAMPLE | 20 | 2 |
| 2019-SAMPLE | 70 | 4 |
| SW-CSTS | 70 | 4 |

## Data Shape
- CSTS data is exposed as `window.CSTS_DATA`.
- Each set contains `id`, `title`, `questionPdf`, `answerPdf`, and `questions`.
- Each question contains `number`, `type`, `stem`, `options`, `answer`, `answerText`, `explanation`, and optional `figure`.
- Question types are `multiple_choice`, `true_false`, and `short_answer`.

## App Integration
- `www/index.html` now loads `csts-questions.js`.
- The CSTS entry button now opens the same solving flow as ISTQB.
- CSTS supports set selection, practice, exam, random, review, grading, wrong-note flow, and figure zoom.
- Short-answer CSTS questions render a text answer input instead of option buttons.
- ISTQB data and `questions.js` structure were not changed.

## Verification
| Check | Result |
|---|---|
| CSTS extraction script | Success |
| Extracted question count | 440 total |
| Missing question numbers | None |
| Multiple-choice option count check | Success |
| True/false option check | Success |
| Short-answer structure check | Success |
| Figure file existence and PNG size check | Success, 43 PNG files |
| Long-line visibility audit | Success, no line over 180 chars |
| JSON parse check | Success |
| Browser JS load check | Success |
| ISTQB verify script | Success |

## QA Notes
- Fixed `2402FL` question 28, where circled numbers inside option D were incorrectly parsed as additional options.
- Root static files and `www/` files are kept in sync so local `node server.js`, Capacitor, and static web deployment use the same CSTS solving flow.
- `npm run build` and `npm run lint` are not available in `package.json`; this project uses `npm run verify`.

## Notes
- The extractor uses PyMuPDF (`fitz`).
- Large watermark images in 2024 answer PDFs are filtered out so they are not treated as question figures.
- Some diagrams are PDF vector/text content rather than raster images; only raster image blocks are exported as PNG.
