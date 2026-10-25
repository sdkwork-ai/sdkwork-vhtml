# VHTML Conformance Fixtures

The manifest-driven fixtures in this directory exercise the normative rules that
are hard to express in JSON Schema:

- HTML-safe element names and self-closing recovery.
- External `<scene src>` fragments, relative URL rebasing, CSS/script extraction.
- Exact frame boundaries and half-open intervals.
- Non-destructive editing (split, ripple delete, overlap transitions).
- Schema conformance of the resulting Core Model.

Project-layout fixtures are covered by `tests/unit/project.test.ts` (manifest
discovery, asset inventory/import, package round-trip).

Run them with the normal test command:

```bash
npm test
```

Each entry in `manifest.json` names a fixture, its expected Core Model facts, and
for editing cases the exact operation list. The reference implementation's
validator and editor are used as the executable interpretation of the
specification.
