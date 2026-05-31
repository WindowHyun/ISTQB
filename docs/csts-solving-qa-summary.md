# CSTS Solving QA Summary

## Changes
- Moved the `처음` button from the question topbar into the settings panel app navigation section.
- CSTS now uses the same solving surface as ISTQB instead of the old preview-only page.
- CSTS supports set selection, practice, exam, random, review, grading, wrong-note flow, figure zoom, and short-answer text input.
- Fixed `2402FL` question 28, where circled numbers inside option D were incorrectly split into extra options.

## CSTS Full Audit
| Check | Result |
|---|---|
| Sets | 7 |
| Total questions | 440 |
| Multiple-choice questions | 315 |
| True/false questions | 62 |
| Short-answer questions | 63 |
| Missing question numbers | None |
| Empty stems | None |
| Multiple-choice option count errors | None |
| True/false option errors | None |
| Figure files | 43 PNG files in root and `www` |
| Question figure references | 43 |
| Long extracted lines over 180 chars | None |

## Verification
| Command or check | Result |
|---|---|
| `node -c script.js` | Success |
| `node -c www/script.js` | Success |
| `npm run verify` | Success |
| `npm run cap:sync` | Success |
| Local server HTTP check | Success, HTTP 200 |
| `npm run build` | Not applicable, no script in `package.json` |
| `npm run lint` | Not applicable, no script in `package.json` |

## Notes
- Hydration mismatch is not applicable because this is not a React/Next.js SSR app.
- No external UI library was added; shadcn/ui principles are reflected through existing CSS tokens and component classes.
- Existing `questions.js` data shape and ISTQB business flow were preserved.
- Figure-only option questions render all answer figures in the question body and label the selectable options as `그림 1` through `그림 4`.
