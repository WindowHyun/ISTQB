# Android Build Harness

## Scope

Use this harness for changes to:

- `android/**`
- `capacitor.config.json`
- `www/**` packaged assets
- Icons, manifests, service worker behavior that affects packaged output
- APK signing, build configuration, Gradle files, or Android permissions

## Goals

The Android build harness should prove that web changes are correctly packaged and that the Android project still builds.

## Required checks

Start with repository verification:

```bash
npm run verify
```

When packaged web assets or Capacitor configuration are affected, run:

```bash
npm run cap:sync
```

When Android build files, native code, permissions, signing, or release-critical assets are affected, run a debug build:

```bash
cd android
./gradlew assembleDebug
```

On Windows, use:

```powershell
cd android
.\gradlew.bat assembleDebug
```

## What to verify

- `npm run cap:sync` completes successfully when needed.
- Android permissions remain intentional and minimal.
- Packaged assets include expected `www` output.
- Debug APK builds successfully for native or packaging changes.
- Release signing secrets are not committed.
- Generated build outputs, APKs, AABs, keystores, and `android/local.properties` remain untracked.

## When to improve the harness

Add or propose checks when:

- A packaging regression is only visible inside the APK.
- A service worker or manifest issue affects installed behavior.
- A permission or signing change needs explicit policy validation.
- The build succeeds but packaged content is stale.

## Reporting checklist

In the final response, include:

- Whether `npm run cap:sync` was required and run.
- Android build command result or reason it was not run.
- Any generated files intentionally left uncommitted.
- APK path if a build was produced.
