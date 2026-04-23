import { spawn } from 'child_process'
import { createInterface } from 'readline'

/**
 * Generate a draft `custom-*.md` body by spawning a one-shot claude
 * invocation with an agent-authoring system prompt. Resolves with the full
 * response text after the child process closes; rejects on non-zero exit or
 * spawn error.
 *
 * Hard cap on the child: 90 seconds wall-clock. Callers should also set a
 * timeout on their fetch/HTTP layer for safety.
 */
export async function generateCustomAgent(
  cwd: string,
  opts: { name: string; description: string },
): Promise<string> {
  const systemPrompt = [
    'You are a specrails agent-authoring assistant.',
    '',
    'Your task: given a short description of what the user wants, produce a COMPLETE',
    'Markdown file for a specrails custom agent. The file MUST be valid input for',
    'Claude Code: YAML frontmatter between `---` separators, followed by the agent body.',
    '',
    'Required frontmatter fields:',
    '  - name: the exact agent id (starts with `custom-`, lowercase, kebab-case)',
    '  - description: one sentence saying when this agent should run (include tag hints in square brackets)',
    '  - model: one of `sonnet`, `opus`, `haiku`',
    '  - color: one of `blue`, `green`, `red`, `yellow`, `purple`, `cyan`',
    '  - memory: `project`',
    '',
    'Body sections (use `#` headings): Identity, Mission, Workflow protocol, Personality.',
    'Personality block: bullet list of tone, risk_tolerance, detail_level, focus_areas.',
    '',
    'Be concise. No conversational preamble. Output ONLY the Markdown file — no code',
    'fences, no explanations. Start at `---`.',
  ].join('\n')

  const userPrompt = [
    `Generate a custom agent with id "${opts.name}".`,
    '',
    'Description of what it should do:',
    opts.description,
  ].join('\n')

  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      'claude',
      [
        '--dangerously-skip-permissions',
        '--output-format',
        'stream-json',
        '--verbose',
        '--append-system-prompt',
        systemPrompt,
        '-p',
        userPrompt,
      ],
      {
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd,
      },
    )

    let collected = ''
    const killer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      reject(new Error('agent generation timed out after 90s'))
    }, 90_000)

    const reader = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    reader.on('line', (line) => {
      let parsed: unknown
      try { parsed = JSON.parse(line) } catch { return }
      if (!parsed || typeof parsed !== 'object') return
      // Claude stream-json format: {type:"assistant", message:{content:[{type:"text", text:"..."}]}}
      const p = parsed as Record<string, unknown>
      const message = p.message as Record<string, unknown> | undefined
      const content = message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
            const text = (block as { text?: unknown }).text
            if (typeof text === 'string') collected += text
          }
        }
      }
    })

    let stderr = ''
    child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('error', (err) => {
      clearTimeout(killer)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(killer)
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}${stderr ? `: ${stderr.slice(-500)}` : ''}`))
        return
      }
      const trimmed = collected.trim()
      if (!trimmed) {
        reject(new Error('claude returned empty output'))
        return
      }
      resolve(trimmed)
    })
  })
}
