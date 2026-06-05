## ADDED Requirements

### Requirement: Plugin install path is provider-aware

The hub SHALL dispatch plugin install and uninstall through the project's resolved `ProviderAdapter`. For each plugin operation, `PluginManager` MUST first resolve `adapter = getAdapter(project.provider)` and then branch on `adapter.mcpRegistration`:

- `mcpRegistration === 'project-json'` → the existing surgical merge of `<project>/.mcp.json` (Claude path).
- `mcpRegistration === 'cli-add'` → the hub MUST invoke `adapter.binary mcp add <server-name> <command> [args...]` (or its equivalent registered subcommand) with `<project>/<adapter.providerHomeEnv>` resolved to `~/.specrails/projects/<slug>/<provider-id>-home/` so the registration is per-project, not global.

Plugins that cannot operate under one of the registration modes MUST surface as `not-applicable` for that provider in `PluginManager.listAvailable()` rather than as `not-installed`.

#### Scenario: Install on a Claude project uses .mcp.json
- **WHEN** the user installs Serena on a project with `provider: 'claude'`
- **THEN** `<project>/.mcp.json` gains an `mcpServers.serena` entry created via surgical merge
- **AND** no `codex mcp add` subprocess is spawned

#### Scenario: Install on a Codex project uses codex mcp add
- **WHEN** the user installs Serena on a project with `provider: 'codex'`
- **THEN** the hub spawns `codex mcp add serena -- uvx ...` with `CODEX_HOME` set to `~/.specrails/projects/<slug>/codex-home/`
- **AND** `<project>/.mcp.json` is not modified

#### Scenario: Install completes only after registration verifies
- **WHEN** `codex mcp add` is invoked
- **THEN** the hub confirms the entry exists via `codex mcp list` (or equivalent) before marking the plugin `installed` in `state.json`
- **AND** if the list call does not report the new entry within the verify timeout, the install is rolled back

### Requirement: Per-provider home directory isolates plugin state

For providers whose CLI maintains global plugin state (e.g. codex's `~/.codex/config.toml`), the hub SHALL invoke the CLI with a provider-specific `*_HOME` environment variable pointing at a per-project directory under `~/.specrails/projects/<slug>/<provider-id>-home/`. This guarantees that plugins installed by the hub for project A are not visible to project B, even though both projects share the same provider CLI.

#### Scenario: Codex home directory is per-project
- **WHEN** the hub registers a plugin in project A
- **THEN** the spawn environment contains `CODEX_HOME=/Users/.../.specrails/projects/<A-slug>/codex-home/`

#### Scenario: Different projects do not see each other's codex plugins
- **GIVEN** project A has Serena installed and project B does not
- **WHEN** project B's rail spawns codex with its own `CODEX_HOME`
- **THEN** `codex mcp list` inside that spawn does NOT include Serena

#### Scenario: User's terminal-level codex MCPs are not affected
- **WHEN** the user has previously run `codex mcp add my-tool ...` from their shell (without specrails-hub)
- **AND** the hub spawns codex with the per-project `CODEX_HOME`
- **THEN** `my-tool` is not visible in the hub's codex spawn (it lives in the user's home, not the per-project home)
- **AND** the user's home is unchanged

### Requirement: Plugin manifest exposes provider-specific install descriptors

Every plugin manifest SHALL declare a `providerSupport` map keyed by provider id, where each entry MAY contain a declarative `mcpEntry` (consumed by the manager for the `project-json` and `cli-add` registration modes), an imperative `install(ctx, adapter)` callback (for cases the declarative form cannot model), and a matching `uninstall(ctx, adapter)`. Every plugin MUST declare at least one entry. Providers absent from the map MUST be treated as `not-applicable` by `PluginManager.listAvailable()` for projects of that provider.

The manifest shape MUST be:

```ts
interface PluginManifest {
  // ...existing fields...
  providerSupport: {
    [providerId: string]: {
      mcpEntry?: { command: string; args: string[]; env?: Record<string, string> }
      install?: (ctx: InstallContext, adapter: ProviderAdapter) => Promise<void>
      uninstall?: (ctx: InstallContext, adapter: ProviderAdapter) => Promise<void>
    }
  }
}
```

#### Scenario: Serena declares support for both providers
- **WHEN** Serena's manifest is inspected
- **THEN** `providerSupport.claude.mcpEntry` and `providerSupport.codex.mcpEntry` both exist with matching `command: 'uvx'` and matching `args`

#### Scenario: A claude-only plugin surfaces as not-applicable on codex
- **GIVEN** a plugin whose manifest has only `providerSupport.claude` defined
- **WHEN** the user views the Plugins page on a codex project
- **THEN** the plugin's card renders with status `not-applicable` and an explanatory hint
- **AND** the Install button is disabled

### Requirement: Shared-file contributors target the provider's instructions file

Plugin shared-file contributors (today the `CLAUDE.md` block insertion path) SHALL target `adapter.instructionsFilename` for the resolved project provider. The contributor sentinel format (`<!-- specrails-hub-managed:<plugin-name> -->` … `<!-- /specrails-hub-managed:<plugin-name> -->`) is unchanged; only the destination filename varies.

#### Scenario: Contributor writes to CLAUDE.md on a Claude project
- **WHEN** Serena is installed on a project with `provider: 'claude'`
- **THEN** `<project>/CLAUDE.md` gains a sentinel block written by the contributor
- **AND** no `AGENTS.md` is touched

#### Scenario: Contributor writes to AGENTS.md on a Codex project
- **WHEN** Serena is installed on a project with `provider: 'codex'`
- **THEN** `<project>/AGENTS.md` gains a sentinel block written by the contributor
- **AND** no `CLAUDE.md` is touched

#### Scenario: Uninstall removes only the sentinel block
- **WHEN** Serena is uninstalled from a codex project
- **THEN** the `<!-- specrails-hub-managed:serena -->` block is removed from `AGENTS.md`
- **AND** the rest of `AGENTS.md` (including user-authored content) is byte-identical to the pre-uninstall state

## MODIFIED Requirements

### Requirement: Additive install/uninstall

Installing or uninstalling plugin N MUST NOT mutate any artifact owned by another plugin or by the user, regardless of the provider's MCP registration mode. All mutations to shared artifacts MUST be surgical:

- For `mcpRegistration === 'project-json'`: read `<project>/.mcp.json`, modify only the plugin's owned keys, write atomically.
- For `mcpRegistration === 'cli-add'`: invoke `<binary> mcp add` / `<binary> mcp remove` only for the plugin's owned server names; never bulk-edit the provider's config file directly.

In both cases, ownership conflicts (two registered plugins claiming the same MCP server name) MUST fail fast at startup and are detected by the existing `buildOwnershipMap` startup check unchanged.

#### Scenario: Installing a second plugin preserves the first (Claude)
- **GIVEN** plugin A is installed and contributed `mcpServers.serena` to `.mcp.json`
- **WHEN** plugin B is installed and contributes `mcpServers.foo`
- **THEN** `.mcp.json` contains both `serena` and `foo` entries unchanged from each plugin's contribution

#### Scenario: Installing a second plugin preserves the first (Codex)
- **GIVEN** plugin A is installed via `codex mcp add serena` on a codex project
- **WHEN** plugin B is installed via `codex mcp add foo`
- **THEN** `codex mcp list` reports both `serena` and `foo`
- **AND** neither plugin's entry is overwritten by the other

#### Scenario: Uninstalling a plugin preserves user-authored MCP entries
- **GIVEN** the user manually added `mcpServers.myown` to `.mcp.json` on a claude project, and plugin A contributed `mcpServers.serena`
- **WHEN** plugin A is uninstalled
- **THEN** `.mcp.json` still contains `myown` exactly as the user wrote it; only `serena` is removed

#### Scenario: Uninstall does not touch other plugins' fragments (provider-aware)
- **GIVEN** plugin A owns `<project>/<adapter.projectDirName>/agents/custom-serena.md` and plugin B owns `<project>/<adapter.projectDirName>/agents/custom-foo.md`
- **WHEN** plugin A is uninstalled
- **THEN** `custom-foo.md` is untouched
- **AND** the `projectDirName` resolution is dictated by the project's provider, not hardcoded to `.claude`

### Requirement: Atomic, locked file mutation

All writes by the hub to shared files MUST hold a `proper-lockfile` advisory lock for the duration of the read-modify-write cycle and MUST replace the file via temp-file + rename so partial writes are never observable. The set of locked files depends on the provider:

- For `mcpRegistration === 'project-json'`: `<project>/.mcp.json` and `<project>/.specrails/plugins/state.json`.
- For `mcpRegistration === 'cli-add'`: `<project>/.specrails/plugins/state.json` AND a hub-level synthetic lockfile at `~/.specrails/projects/<slug>/<provider-id>-home/.specrails.lock` to serialise `codex mcp add` / `codex mcp remove` calls under the same lock semantics.

#### Scenario: Concurrent installs serialize correctly (Claude)
- **WHEN** two installs of different plugins start within the same millisecond on a claude project
- **THEN** both ultimately succeed and the final `.mcp.json` contains entries from both with no lost update

#### Scenario: Concurrent installs serialize correctly (Codex)
- **WHEN** two installs of different plugins start within the same millisecond on a codex project
- **THEN** both ultimately succeed and the final `codex mcp list` reports both entries
- **AND** the second invocation waits on the per-project synthetic lockfile before spawning its own `codex mcp add`

#### Scenario: Crash mid-write leaves the previous file intact
- **WHEN** the hub process is killed between the temp write and the rename
- **THEN** the original `.mcp.json` (claude path) or the existing `codex mcp` state (codex path) remains valid

### Requirement: Install rollback on failure

If `plugin.install(ctx, adapter)` fails or `plugin.verify` returns `ok: false` immediately after install, `PluginManager` MUST roll back every mutation performed during the failed install. The rollback target state MUST be byte-identical to the pre-install state, with the rollback strategy depending on the provider:

- For `mcpRegistration === 'project-json'`: restore the original `.mcp.json` bytes from the pre-install snapshot.
- For `mcpRegistration === 'cli-add'`: invoke `<binary> mcp remove <server-name>` for every server the failed install registered, and surface any failure of the removal as a warning (but do not block the rollback caller from completing).

In both cases the plugin's `state.json` entry MUST NOT be written.

#### Scenario: Verify failure rolls back .mcp.json (Claude)
- **GIVEN** plugin A's `install` succeeds on a claude project but `verify` reports `ok: false`
- **WHEN** the install transaction completes
- **THEN** `.mcp.json` is restored to its pre-install contents and `state.json` does not contain plugin A

#### Scenario: Verify failure rolls back codex mcp registration
- **GIVEN** plugin A's `install` succeeds on a codex project but `verify` reports `ok: false`
- **WHEN** the install transaction completes
- **THEN** `codex mcp remove <server-name>` is invoked for every owned server
- **AND** `state.json` does not contain plugin A
- **AND** subsequent `codex mcp list` does not show any of plugin A's owned entries

### Requirement: Per-project isolation

Plugin state, install effects, and lifecycle MUST be strictly per-project. Installing a plugin in project A MUST have no effect on project B. For providers whose CLI maintains global state, isolation is achieved by setting the provider's `*_HOME` environment variable to a per-project path under `~/.specrails/projects/<slug>/<provider-id>-home/` for every CLI invocation initiated by the hub.

#### Scenario: Install in project A leaves project B untouched (Claude)
- **GIVEN** projects A and B exist with no plugins installed and both have `provider: 'claude'`
- **WHEN** the user installs Serena in project A
- **THEN** project B's `.mcp.json` and `.specrails/plugins/state.json` are unchanged

#### Scenario: Install in project A leaves project B untouched (Codex)
- **GIVEN** projects A and B exist with no plugins installed and both have `provider: 'codex'`
- **WHEN** the user installs Serena in project A
- **THEN** project B's `.specrails/plugins/state.json` is unchanged
- **AND** when project B's rail spawns codex with its own `CODEX_HOME`, `codex mcp list` reports zero hub-managed entries
