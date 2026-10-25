# VHTML Versioning and Compatibility Policy

**Status**: normative process for every VHTML spec and reference package.

VHTML separates **spec version** (`1.1`), **package version** (`1.1.1`) and
**capability/profiles**. A standard is useful only if it can change without
silently breaking existing projects.

## 1. Version scheme

- `MAJOR.MINOR` is the document format version. Current: `1.1`.
- `PATCH` is reference-implementation/editorial only and MUST NOT change model
  semantics.
- Every package uses the same `MAJOR.MINOR.PATCH` release line while the
  workspace is version-locked.
- `specVersion` in the root `<vhtml>` / `<project>` remains the format version;
  package.json versions describe code, not documents.

## 2. Change classification

| Change | Allowed in | Requirements |
|---|---|---|
| New optional attribute/element/field | MINOR | Parser ignores or defaults; old documents valid |
| New output format/delivery profile ID | MINOR | New ID; never redefine old ID |
| New transition/effect type | MINOR | Capability/feature declaration; parser accepts |
| New required field | MAJOR | Migration required |
| Rename/remove element or field | MAJOR | Deprecation + migration |
| Changed default that alters rendered output | MAJOR | Migration/render report |
| Changed interpretation of a time/rounding rule | MAJOR | Conformance update |

New optional fields MUST have deterministic defaults. Implementations MUST NOT
invent defaults that depend on wall-clock, locale, device or network.

## 3. Capability negotiation

- `vhtml capabilities --json` reports profiles, formats, codecs, delivery
  profiles, features and limits.
- Project `requirements` lists capabilities an implementation must provide.
- `extensions` is for namespaced, optional data; unknown extensions MUST NOT
  change core semantics.
- A renderer that cannot honor a requirement MUST fail with a diagnostic, not
  silently degrade.
- Feature IDs are stable; add new IDs rather than reinterpreting existing ones.

## 4. Deprecation

- Deprecate in a MINOR release with a parser warning and a migration note.
- Keep reading deprecated syntax for at least one MINOR cycle.
- Remove only in a MAJOR release with an RFC and a migration path.
- Never silently reinterpret an existing value.

## 5. Migration

- `vhtml build` / parser MAY migrate older documents in memory and MUST report
  the migration as a warning.
- A migration MUST preserve model-equivalent timing, IDs and references.
- Package and project metadata migrations are versioned by `vhtml.json`
  `version` and document `specVersion`.
- Migration tests MUST include a golden re-serialization and validation.

## 6. Profiles and extensions

Profiles are optional capability bundles layered on the Core Model:

- Project layout / external files
- WYSIWYG editing
- Modularization and deployment
- Delivery profiles
- Generation protocol

Profiles have their own version and conformance checklist. A profile may add
constraints (for example "remote Studio requires auth") but MUST NOT change core
time, clip or rendering semantics.

## 7. Conformance levels

1. **Parser** — parse, validate, serialize.
2. **Structural** — model + deterministic structure.
3. **Temporal** — exact time, frame/sample boundaries.
4. **Visual** — Chromium rendering under a pinned environment.
5. **Full runtime** — visual + audio + export + capabilities.
6. **Profile** — declared profile checks (layout, WYSIWYG, deployment, delivery).

An implementation declares levels and profiles; absence MUST be explicit.

## 8. Release checklist

- [ ] Schema updated and validated.
- [ ] Parser/serializer round-trip test.
- [ ] Migration/deprecation test (if any).
- [ ] Capability report updated.
- [ ] Conformance fixtures updated.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm examples`.
- [ ] Package tarballs installed in a clean consumer.
- [ ] Changelog records behavior changes separately from editorial changes.

## 9. Compatibility promise

Within a MINOR line:

- valid `1.x` documents remain valid;
- rendering and timing semantics do not change;
- new fields default deterministically;
- existing profile IDs are immutable;
- capability reports remain machine-readable and additive.

Breaking any of these requires a MAJOR specification release.
