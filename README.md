# committer

AI-powered CLI that generates [conventional commit messages](https://www.conventionalcommits.org/) and pull request descriptions from your git diff, with support for Claude, OpenAI, and local Ollama models.

## Demo

[![Watch the demo](https://img.youtube.com/vi/2jtUHqYycro/maxresdefault.jpg)](https://www.youtube.com/watch?v=2jtUHqYycro)

## Features

- Streams commit messages live as they are generated
- Regenerate with optional freeform instructions (`r` → type anything)
- Pull request generation with structured Summary / Changes / Impact format
- Auto-detects GitHub or Azure DevOps and can open the PR for you
- Three AI providers: Claude (Anthropic), OpenAI, and local Ollama
- Interactive onboarding on first run — no manual config editing needed
- Per-repo custom instructions via `claude.md`

---

## Install

```bash
npm install -g @frigopedro/committer
```

Requires **Node.js 18+**.

---

## Quick start

```bash
committer
```

Stage everything and commit in one step:

```bash
committer .
```

You will see a suggested commit message and can:

| Key | Action |
|-----|--------|
| `y` | Accept and commit |
| `n` | Abort |
| `r` | Regenerate — optionally type extra instructions for the AI |

On first run, committer walks you through provider and model selection and writes `~/.committer`. Re-run setup any time:

```bash
committer --init
```

---

## Pull request generation

Generate a PR title and description from all commits between a base branch and your current branch:

```bash
committer --pr main
```

The PR is displayed in readable format in the terminal:

```
✨ Suggested PR:
────────────────────────────────────────────────────────────────
feat: add pull request generation from commits

Summary
Generate PR title and description from commits using AI with a
structured Summary / Changes / Impact layout.

Changes
• Add --pr flag with base branch argument
• Add platform detection for GitHub and Azure DevOps
• Add auto-install flow for gh and az CLIs

Impact
No breaking changes.
────────────────────────────────────────────────────────────────
Use (y) to create PR on GitHub, (n) to abort, (r) to regenerate:
```

Same `y / n / r` flow as commits — press `r` to regenerate with optional instructions.

If the remote is GitHub or Azure DevOps, choosing `y` uses the platform CLI (`gh` or `az`) to open the PR. If the CLI is not installed, committer offers to install it for you.

---

## Providers

### Claude (default)

Get an API key at [console.anthropic.com](https://console.anthropic.com).

```bash
export ANTHROPIC_API_KEY=sk-ant-...
committer
```

Default model: `claude-3-5-haiku-20241022`

### OpenAI

Get an API key at [platform.openai.com](https://platform.openai.com).

```bash
export OPENAI_API_KEY=sk-...
committer --provider openai
```

Default model: `gpt-4o-mini`

### Ollama (local, no API key)

Install Ollama from [ollama.com](https://ollama.com), then pull a model:

```bash
ollama pull llama3.1
committer --provider ollama
```

If no model is configured, committer lists your local models and lets you pick one interactively. Default model: `llama3.1`

---

## CLI reference

```
committer [options] [.]
```

| Flag | Description |
|------|-------------|
| `.` | Stage all changes (`git add .`) before generating |
| `--provider <name>` | `claude`, `openai`, or `ollama` |
| `--model <name>` | Override the model for this run |
| `--staged` | Use only staged diff |
| `--all` | Use staged + unstaged diff |
| `--max-diff-chars <n>` | Truncate diff to N characters (default: 50000) |
| `--prompt-append <text>` | Extra instruction added to the AI prompt |
| `--pr <base-branch>` | Generate PR description from commits since base branch |
| `--init` | Re-run onboarding and update `~/.committer` |
| `--help` | Show help |

---

## Config file

`~/.committer` is a JSON file shared across all repos. It is created automatically on first run.

```json
{
  "version": 1,
  "provider": "claude",
  "model": "claude-3-5-haiku-20241022",
  "diffMode": "auto",
  "maxDiffChars": 50000,
  "promptAppend": "",
  "useClaudeMd": false
}
```

| Field | Description |
|-------|-------------|
| `provider` | Default AI provider |
| `model` | Default model for that provider |
| `diffMode` | `auto` (staged if present, else unstaged), `staged`, or `all` |
| `maxDiffChars` | Max diff length sent to the AI |
| `promptAppend` | Extra instruction always appended to prompts |
| `useClaudeMd` | Load `claude.md` from the repo root as custom instructions |

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `AI_COMMIT_PROVIDER` | Provider override (`claude`, `openai`, `ollama`) |
| `AI_COMMIT_MODEL` | Model override |
| `AI_COMMIT_MAX_DIFF_CHARS` | Diff length override |
| `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `AI_COMMIT_OLLAMA_HOST` | Ollama base URL (default: `http://localhost:11434`) |

CLI flags take precedence over environment variables, which take precedence over `~/.committer`.

---

## Custom instructions (`claude.md`)

Enable `useClaudeMd` in your config, then create a `claude.md` file at the root of a repo:

```bash
committer --init   # toggle useClaudeMd to true
echo "Always reference the Jira ticket in the commit body." > claude.md
```

That file's content replaces the built-in prompt for that repo, giving you full control over the commit message style.

---

## Debug

Print the exact prompt sent to the AI:

```bash
DEBUG_PROMPT=1 committer
```

Output goes to stderr so it does not interfere with normal use.

---

## Tests

```bash
npm test
```

Uses Node's built-in `node:test` runner — no extra dependencies.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions, project structure, and how to add a new provider or platform.
