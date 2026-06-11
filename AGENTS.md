# AGENTS.md

## Repository workflow

This repository uses a harness-first workflow for Codex work. Before making changes, classify the work by impact area and read the matching harness document under `docs/harness/`.

## Required harness routing

- Data, question JSON, answers, options, explanations, image paths:
  - Read `docs/harness/data-harness.md`.
- UI, CSS, question rendering, images, tables, options, responsive layout:
  - Read `docs/harness/ui-render-harness.md`.
- App behavior, modes, grading, wrong-answer notes, persistence, import/export:
  - Read `docs/harness/app-logic-harness.md`.
- Android, Capacitor, `www/`, APK, manifests, icons, service worker packaging:
  - Read `docs/harness/android-build-harness.md`.
- Release, pre-delivery, broad multi-area changes:
  - Read `docs/harness/release-harness.md`.

## Default verification

- Run `npm run verify` after data, JavaScript, UI, or app behavior changes.
- For UI/rendering/image/table/option changes, run the visual audit described in `docs/harness/ui-render-harness.md`.
- For Android or packaged web asset changes, evaluate `npm run cap:sync` and Android build checks described in `docs/harness/android-build-harness.md`.
- If a requested change exposes a defect not covered by an existing harness, update or propose a harness improvement before treating the work as complete.

## Reporting expectations

Final responses should include:

- What changed.
- Which harness document(s) were used.
- Exact commands executed and their results.
- Any skipped checks, with a clear environment or scope reason.
