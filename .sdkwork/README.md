# SDKWork Workspace Metadata — sdkwork-vhtml

This directory follows `../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`.

It stores repository-local SDKWork development knowledge for the VHTML 1.1
workspace (specification, packages, CLI, Studio, examples):

- `skills/` contains reusable agent skills for VHTML video creation, editing,
  generation and delivery. Start at [skills/README.md](skills/README.md).
- `plugins/` contains repository-local plugins or plugin placeholders.
- `manifests/` contains the optional machine-readable workspace manifest.
- `local/`, `tmp/`, `cache/`, `secrets/` are local-only state (ignored) and
  must never be committed.

Do not store secrets, API keys, runtime files, exported media, generated
provider output, or user-private data here. Video projects authored with the
skills belong in the author's own project directory (or `examples/` for
committed examples), not inside `.sdkwork/`.

## Execution References

- Agent entrypoint: `../AGENTS.md`
- Shared execution soul: `../../sdkwork-specs/SOUL.md`
- Workspace metadata standard: `../../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`
- VHTML domain specs: `../specification/README.md`
