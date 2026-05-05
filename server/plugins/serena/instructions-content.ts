/* Embedded so the plugin survives bundling/packaging without external assets. */
export const SERENA_INSTRUCTIONS_MD = `---
name: serena-helper
description: "Serena MCP semantic-navigation hints (auto-installed by specrails-hub). Prefer Serena tools over raw Read/Grep when locating symbols, references, or definitions."
color: violet
memory: project
---

# Serena MCP — usage hints

When working in a repository where Serena is installed:

- Prefer \`find_symbol\`, \`get_references\`, \`get_definition\`, and \`get_symbols_overview\` over \`Read\` and \`Grep\` when you only need a function, class, or callsites.
- Use \`replace_symbol_body\` to edit a function or method without re-reading or re-writing the rest of the file.
- Fall back to \`Read\` / \`Grep\` only when Serena cannot handle the request (e.g., binary files, free-form text, JSON/Markdown without symbols).

These tools are added to every agent on this project automatically; no further configuration is needed.
`
