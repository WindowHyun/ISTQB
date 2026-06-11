# Harness Engineering Guide

This directory defines the harness strategy for the ISTQB/CSTS question app. A harness is the repeatable verification system that proves a change works and helps prevent the same defect from returning.

## How to use these documents

1. Classify the requested change by impact area.
2. Open the matching harness document before editing.
3. Identify the minimum required checks.
4. If the existing checks cannot catch the defect class, add or propose a harness improvement.
5. Run the relevant commands and report the result.

## Harness map

| Change type | Primary document | Minimum checks |
| --- | --- | --- |
| Question data, answers, options, explanations, image paths | `data-harness.md` | `npm run verify` |
| UI, CSS, rendering, images, tables, options, responsive layout | `ui-render-harness.md` | `npm run verify`, visual audit when applicable |
| App behavior, modes, grading, persistence, import/export | `app-logic-harness.md` | `npm run verify`, targeted behavior checks |
| Android, Capacitor, packaged `www/` assets, APK | `android-build-harness.md` | `npm run verify`, `npm run cap:sync` when packaging changes apply |
| Release or broad multi-area delivery | `release-harness.md` | All relevant area checks |

## Default command set

```bash
npm run verify
```

For UI rendering audits, start the local server and run:

```bash
npm run serve
node scripts/visual-audit-render.js
```

For Android packaging changes, evaluate:

```bash
npm run cap:sync
cd android
./gradlew assembleDebug
```

Use the Windows Gradle wrapper command from the README when running on Windows.
