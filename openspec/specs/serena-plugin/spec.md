# serena-plugin Specification

## Purpose
TBD - created by archiving change add-plugin-system. Update Purpose after archive.
## Requirements
### Requirement: Serena ships as a bundled plugin
The hub SHALL ship a built-in plugin named `serena` registered in `server/plugins/index.ts`, implementing the `Plugin` interface defined by the plugin system. Its manifest MUST declare:
- `name: "serena"`, `version` matching the bundled module's package version,
- `description` and `whatItDoes` copy describing semantic code navigation via LSP+MCP,
- `requirements: [{ name: "uv", minVersion: "0.1.0" }]`,
- `owns.mcpServers: ["serena"]`,
- `owns.agentFragments: [".claude/agents/custom-serena.md"]` (only if the plugin chooses to ship that file; see optional fragment requirement below).

#### Scenario: Hub registers serena at startup
- **WHEN** the hub process starts with no startup errors
- **THEN** `PluginManager.listAvailable()` includes one entry whose `name === "serena"`

#### Scenario: Manifest exposes uv requirement
- **WHEN** the client fetches `GET /api/projects/:id/plugins`
- **THEN** Serena's catalog entry lists `uv` under `requirements`

### Requirement: Serena install writes the MCP server entry
When `Plugin.install` runs, the Serena plugin MUST write or merge into `<project>/.mcp.json` the following entry under `mcpServers.serena`:
```json
{
  "command": "uvx",
  "args": [
    "--from", "git+https://github.com/oraios/serena",
    "serena", "start-mcp-server",
    "--context", "ide-assistant",
    "--project", "."
  ]
}
```
The merge MUST be surgical: if `mcpServers` does not exist, it is created; existing sibling entries are preserved exactly.

#### Scenario: Install writes the serena entry into a fresh .mcp.json
- **GIVEN** `<project>/.mcp.json` does not exist
- **WHEN** Serena is installed
- **THEN** `<project>/.mcp.json` is created containing exactly `{ "mcpServers": { "serena": { ...spec'd entry... } } }`

#### Scenario: Install preserves existing mcpServers entries
- **GIVEN** `<project>/.mcp.json` contains `mcpServers.myown` authored by the user
- **WHEN** Serena is installed
- **THEN** the file contains both `myown` (byte-identical) and `serena`

### Requirement: Serena prerequisite resolution
The Serena plugin MUST advertise `uv` as a prerequisite. The hub's prerequisites detector (`setup-prerequisites.ts`) MUST be extended to detect `uv` (`uv --version` exit 0 with parsed semver) and report it under the same shape as Node/git/etc. The Install dialog MUST surface an "Auto-install uv" affordance when `uv` is missing, using OS-aware install commands consistent with the existing `InstallInstructionsModal`.

#### Scenario: uv detected when installed
- **GIVEN** `uv` is on PATH and `uv --version` exits 0
- **WHEN** the prerequisites endpoint is called
- **THEN** the response reports `uv` as `installed: true, executable: true` with the parsed version

#### Scenario: uv missing surfaces in dialog
- **GIVEN** `uv` is not on PATH
- **WHEN** the user opens the Serena Install dialog
- **THEN** the dialog displays a missing-`uv` indicator and the confirm button is disabled until the user runs auto-install or installs `uv` manually

### Requirement: Serena verify
`Plugin.verify` for Serena MUST run `uvx serena --version` (or equivalent non-installing probe) with a 2000ms default timeout. It MUST return `{ ok: true }` when exit code is 0 and the stdout matches the expected format, and `{ ok: false, reason }` otherwise (with reasons such as `uv-not-on-path`, `uvx-non-zero-exit`, `verify-timeout`).

#### Scenario: Verify ok after install
- **GIVEN** Serena was just installed and `uv` is healthy
- **WHEN** `Plugin.verify` runs
- **THEN** it resolves `{ ok: true }` within the timeout

#### Scenario: Verify reports uv-not-on-path
- **GIVEN** Serena is installed but `uv` has been removed from PATH
- **WHEN** `Plugin.verify` runs
- **THEN** it resolves `{ ok: false, reason: "uv-not-on-path" }`

### Requirement: Serena uninstall is surgical
`Plugin.uninstall` MUST remove only the `mcpServers.serena` key from `<project>/.mcp.json`, MUST remove `<project>/.specrails/plugins/state.json#plugins.serena`, and MUST remove `.claude/agents/custom-serena.md` if and only if that file was created by this plugin (verified via the state file's `installedFiles` list). It MUST NOT touch `uv` (the system-wide tool) or any other plugin's contributions.

#### Scenario: Uninstall removes only serena from .mcp.json
- **GIVEN** `.mcp.json` contains `mcpServers.serena` (from this plugin) and `mcpServers.myown` (user)
- **WHEN** Serena is uninstalled
- **THEN** the file contains only `mcpServers.myown`, byte-identical to its original form

#### Scenario: Uninstall does not remove uv
- **GIVEN** Serena is installed and `uv` was auto-installed by the install flow
- **WHEN** Serena is uninstalled
- **THEN** `uv` remains available on PATH

### Requirement: Optional Serena agent fragment
The Serena plugin MAY ship a `templates/instructions.md` fragment that, when present, is written to `<project>/.claude/agents/custom-serena.md` during install and removed during uninstall. The fragment MUST live in the `.claude/agents/custom-*.md` namespace already protected by `specrails-core` so core init/update never touches it. v1 MAY ship without this fragment; if so, no file is created and uninstall has no fragment to remove.

#### Scenario: Fragment is written when shipped
- **GIVEN** the plugin bundle contains `templates/instructions.md`
- **WHEN** Serena is installed
- **THEN** `<project>/.claude/agents/custom-serena.md` exists with the fragment contents and is recorded in `state.json#plugins.serena.installedFiles`

#### Scenario: Uninstall removes only plugin-created fragment
- **GIVEN** `.claude/agents/custom-serena.md` exists and was recorded as plugin-created in state.json
- **WHEN** Serena is uninstalled
- **THEN** that file is deleted; if a user-authored `custom-other.md` exists alongside, it remains untouched

### Requirement: Diff preview describes Serena changes accurately
The `GET /api/projects/:id/plugins/serena/preview-install` response MUST list, for the current state of the target project: every file the install would create (with `op: "create"`), every file it would modify (with `op: "modify"` and a line-level summary of additions), and every prerequisite that needs auto-install.

#### Scenario: Preview on fresh project
- **GIVEN** a project with no `.mcp.json` and no `.claude/` directory
- **WHEN** the client calls preview-install for Serena
- **THEN** the response lists creates for `.mcp.json`, optionally `.claude/agents/custom-serena.md`, and `.specrails/plugins/state.json` (if not present)

#### Scenario: Preview on project with existing .mcp.json
- **GIVEN** a project whose `.mcp.json` already has user entries
- **WHEN** the client calls preview-install for Serena
- **THEN** the response marks `.mcp.json` with `op: "modify"` and lists `serena` as the added key under `mcpServers`

