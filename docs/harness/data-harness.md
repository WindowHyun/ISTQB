# Data Harness

## Scope

Use this harness for changes to:

- `public/data/**/*.json`
- `www/data/**/*.json`
- Question IDs, titles, metadata, answers, options, explanations, figures, tables, lists, and block structures
- Scripts that extract, normalize, validate, or repair question data

## Goals

The data harness should prove that question content is structurally valid, renderable, and internally consistent.

## Required checks

Run the default repository verification:

```bash
npm run verify
```

This command should cover syntax checks, question validation, content audits, and classification marker audits.

## What to verify

- JSON parses successfully.
- Question IDs are unique inside each set.
- Required metadata exists.
- Multiple-choice questions have valid options.
- Answer keys match available options.
- Explanations and stems use supported block structures.
- Figure and image paths point to committed assets.
- Manual line breaks, tables, and lists are intentional and renderable.
- Root data and packaged `www/data` copies are synchronized when both are affected.

## When to improve the harness

Add or propose validation coverage when a defect involves:

- A malformed block type that current validation accepts.
- A missing asset path that validation does not detect.
- A duplicated or unstable question ID pattern.
- Answers that are semantically mismatched but structurally valid.
- Repeated extraction/normalization defects from source PDFs.

## Reporting checklist

In the final response, include:

- Data files changed.
- Validation command results.
- Any known content risk that needs manual review.
- Whether `www/data` synchronization was required.
