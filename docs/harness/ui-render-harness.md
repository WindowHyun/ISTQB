# UI Render Harness

## Scope

Use this harness for changes to:

- `index.html`, `www/index.html`
- `style.css`, `www/style.css`
- `script.js`, `www/script.js` when rendering changes are involved
- Question rendering for stems, options, explanations, figures, tables, code blocks, and responsive layout
- Visual assets that affect question display

## Goals

The UI render harness should prove that questions load, render, and remain usable across the expected mobile/tablet layout.

## Required checks

Always run:

```bash
npm run verify
```

For visible rendering, image, table, option, CSS, or layout changes, run the Playwright visual audit:

```bash
npm run serve
node scripts/visual-audit-render.js
```

If running both in one shell, use a background server and stop it after the audit:

```bash
npm run serve > /tmp/istqb-server.log 2>&1 &
SERVER_PID=$!
node scripts/visual-audit-render.js
kill $SERVER_PID
```

## What to verify

- The app loads without console-breaking errors.
- The selected question set renders a stable question title, stem, and options or answer input.
- Images load and stay within the viewport.
- Stem, figure, and options have readable spacing.
- Options are not merged into one visual block.
- Tables and list-like content remain legible.
- Mobile/tablet viewport behavior remains usable.
- `tmp/visual-audit/report.json` has `badCount: 0`, or each finding is reviewed and explained.

## Screenshot expectations

Take or preserve screenshots when:

- A perceptible web UI change is made.
- The visual audit reports failures.
- A layout bug is fixed and needs before/after evidence.

Visual audit screenshots are written under `tmp/visual-audit/` and should normally not be committed.

## When to improve the harness

Add or propose coverage when a rendering defect is not caught by the existing audit, such as:

- A new component type.
- A new image container.
- A responsive breakpoint issue.
- A table or code-block pattern with recurring failures.
- A mode-specific rendering problem not covered by set traversal.

## Reporting checklist

In the final response, include:

- UI files changed.
- Verification and visual audit commands.
- Visual audit report status.
- Screenshots captured or reason screenshots were not needed.
