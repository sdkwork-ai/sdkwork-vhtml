# SDKWork Plugins — sdkwork-vhtml

Repository-local agent extensions and plugin bundles live here, following
`../../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md` section 4.

## How to add a plugin

1. Create `.sdkwork/plugins/<plugin-name>/` with a lowercase kebab-case name.
2. An installable plugin MUST declare `.codex-plugin/plugin.json` naming the
   plugin, its version, owner, description and contributed skills/tools/apps.
3. Plugin skills follow the same rules as `.sdkwork/skills/`.
4. Plugins may contain MCP server definitions, app definitions, scripts or
   bundled assets only when they are repository-specific and documented.
5. A plugin that wraps build, generation or export commands MUST call the
   canonical `vhtml` CLI commands; it must not substitute local stubs.

No repository-local plugin exists yet. Video-production agents should use the
skills in `.sdkwork/skills/` directly.
