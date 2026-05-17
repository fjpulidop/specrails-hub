# Provider stream fixtures

JSONL event captures used by `parseStreamLine` tests so the parser is stable
across CLI versions.

## Layout

```
__fixtures__/
  claude/
    <event-name>.jsonl     # one line per fixture, mirrors stream-json
  codex/
    0.128.0/               # CLI version this fixture set was captured against
      <event-name>.jsonl
    0.130.0/               # add a new folder when bumping the supported floor
```

## How to regenerate

For codex:

```bash
codex --version    # must match a folder name under __fixtures__/codex/
codex exec --json --skip-git-repo-check --sandbox read-only \
  -C /tmp "say hello in 3 words" \
  > __fixtures__/codex/$(codex --version | awk '{print $2}')/hello-3-words.jsonl
```

For claude:

```bash
claude --version
claude --dangerously-skip-permissions \
  --output-format stream-json --verbose -p "say hello in 3 words" \
  > __fixtures__/claude/hello-3-words.jsonl
```

## CI guard

A test under `codex-adapter.test.ts` enforces that at least one fixture folder
matching `codex` adapter's `minCliVersion` exists. Bumping `minCliVersion`
without dropping a matching fixture set fails CI loudly.
