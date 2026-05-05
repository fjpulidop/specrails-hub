import type { PluginManifest } from '../../types'

export const serenaManifest: PluginManifest = {
  name: 'serena',
  version: '1.0.0',
  description: 'Semantic code navigation via Language Server Protocol. Lets agents look up symbols, references, and definitions instead of grepping or reading whole files — typically cutting input tokens 40–60% on real workloads.',
  whatItDoes: [
    'Adds a Serena MCP server backed by uvx (Python).',
    'Exposes find_symbol, get_references, get_definition, and replace_symbol_body to all agents.',
    'Auto-detects project language; supports TS/JS, Python, Go, Rust, Java, and more.',
    'Runs locally — your code never leaves your machine.',
  ],
  platformNotes: {
    'darwin-arm64': 'On Apple Silicon, macOS may prompt to install Rosetta the first time Serena runs. Some Python language-server dependencies ship x86_64 only; click "Install" on the Apple prompt — it is safe and only happens once.',
  },
  category: 'code-navigation',
  requirements: [
    { name: 'uv', minVersion: '0.1.0' },
  ],
  owns: {
    mcpServers: ['serena'],
    agentFragments: ['.claude/agents/custom-serena.md'],
  },
  // Format: structured "when / tools / why / fallback" block. Lets generic
  // agent prompts (specrails-core sr-* "Tool Selection — Honor Project-
  // Documented MCP Tools" section) match the right entry to the task.
  claudeMdInstructions: `## Plugin: serena (semantic code navigation)

**When to use**: Locating symbols, references, or definitions in source code; refactoring a single function in place.

**Tools**:
- \`mcp__serena__find_symbol\` — locate a class, function, or method by name path.
- \`mcp__serena__get_references\` — list every caller / usage of a symbol.
- \`mcp__serena__get_definition\` — jump to where a symbol is defined.
- \`mcp__serena__get_symbols_overview\` — file-level symbol skeleton (no bodies).
- \`mcp__serena__replace_symbol_body\` — edit one function without rewriting the file.

**Why prefer over built-ins**: Serena returns only the relevant symbol body, not whole files. Empirically cuts input tokens 40–60% on real workloads compared to \`Read\` / \`Grep\`.

**Fallback to \`Read\` / \`Grep\` for**: binary files, free-form prose, structured data without symbols (logs, JSON, Markdown).

**Subagents**: MCP access is inherited from the parent Claude session; pass these tool names through when delegating via the \`Task\` tool.`,
}

export const SERENA_MCP_ENTRY = {
  command: 'uvx',
  args: [
    '--from',
    'git+https://github.com/oraios/serena',
    'serena',
    'start-mcp-server',
    '--context',
    'ide-assistant',
    '--project',
    '.',
    // Suppress the auto-opened web dashboard. Serena defaults to launching a
    // local browser tab on start; users running rail jobs find the popup
    // disruptive.
    '--enable-web-dashboard',
    'false',
  ],
}
