# Release Harness

## Scope

Use this harness for release preparation, broad changes, or work that touches multiple areas of the app.

## Goals

The release harness should combine the relevant area harnesses into a final confidence checklist before delivery.

## Release checklist

### 1. Classify changed areas

Review the diff and identify whether the release includes:

- Data changes
- UI/rendering changes
- App logic changes
- Android/packaging changes
- Documentation-only changes

### 2. Run relevant harnesses

Always run:

```bash
npm run verify
```

For UI-visible changes, run the visual audit from `ui-render-harness.md`.

For Android packaging changes, run the checks from `android-build-harness.md`.

### 3. Confirm generated artifacts

Verify that generated or local-only files are not accidentally committed:

- `node_modules/`
- `android/**/build/`
- `android/local.properties`
- `*.apk`
- `*.aab`
- `*.jks`
- `*.keystore`
- `tmp/visual-audit/` unless a report is intentionally committed

### 4. Review user-facing behavior

For release-impacting changes, confirm:

- App loads from the local server.
- The expected question sets are visible.
- Practice and exam mode basics still work.
- Images and tables in representative questions render correctly.
- Offline/PWA behavior was not unintentionally changed.

## Reporting checklist

In the final response or release note, include:

- Changed areas.
- Harnesses executed.
- Commands and outcomes.
- Known limitations or skipped checks.
- Any manual review still recommended.
