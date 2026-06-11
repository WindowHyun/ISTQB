# App Logic Harness

## Scope

Use this harness for changes to app behavior, including:

- Practice, exam, random, and wrong-answer modes
- Grading and answer selection
- Explanation display
- Navigation between questions
- Wrong-answer note behavior
- `localStorage` and IndexedDB persistence
- Progress restore after reload
- Export/import of solving history
- Confirmation dialogs and state transitions

## Goals

The app logic harness should prove that user workflows remain correct after behavioral changes.

## Required checks

Run:

```bash
npm run verify
```

Add targeted checks based on the changed workflow. Prefer automated DOM or Playwright scenarios when a behavior can regress.

## Suggested scenario matrix

| Area | Scenario examples |
| --- | --- |
| Practice mode | Select answer, immediate feedback appears, explanation is visible |
| Exam mode | Select answers, grade after completion, score/result state is stable |
| Random mode | Randomized order works without losing answer mapping |
| Wrong-answer mode | Existing wrong-answer records are preserved until explicitly retried |
| Navigation | Previous/next buttons keep selection and state consistent |
| Persistence | Reload restores current set, mode, question, and answers |
| Import/export | Exported JSON can be imported and restores expected progress |

## What to verify

- State transitions do not silently clear user progress.
- Mode changes show the expected confirmation behavior.
- Grading uses the original answer key after randomization or navigation.
- Wrong-answer records are not accidentally deleted.
- Persistence handles reloads and unavailable storage gracefully.
- Root and `www` app scripts stay synchronized when both are used.

## When to improve the harness

Add or propose a test when:

- A bug affects a specific user workflow.
- A regression requires multiple clicks or reloads to reproduce.
- State is stored across browser APIs.
- A mode-specific branch is not covered by existing verification.

## Reporting checklist

In the final response, include:

- Behavior changed.
- Manual or automated scenarios checked.
- Storage/state risks considered.
- Any workflow that still needs human exploratory testing.
