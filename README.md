# committer

**The low-cost AI commit tool.** committer writes [conventional commit messages](https://www.conventionalcommits.org/), branch names, and pull request descriptions from your git diff. It works with Claude, OpenAI, and local Ollama models.

> 🤖 **Using an AI coding agent?** Install the [committer skill](./skills/committer/SKILL.md) so your agent uses committer for every commit, branch, and PR. See [Make your AI agent use committer](#make-your-ai-agent-use-committer).

## Why it's low cost

**The workflow is deterministic. The LLM only writes the text.**

Every step is fixed code: reading the diff, staging, committing, naming and creating the branch, pushing, and opening the PR. The model is called for one thing only: generating the commit message, the branch name, or the PR title and description. It never decides what to run next, never calls tools, and never loops.

Compare that with handing the whole git workflow to an AI agent through a skill or prompt:

| | Agent does the git workflow itself | committer |
|---|---|---|
| Who runs the steps | The LLM, one tool call at a time (`git status`, `git diff`, `git add`, `git commit`, `git push`, `gh pr create`, …) | Fixed code, in the same order every time |
| LLM calls per commit + PR | Many turns, each re-sending the growing conversation | One short call per message (commit, branch, PR) |
| What lands in the agent's context | Full diffs, command output, and retries | One small JSON result |
| Result | Can vary from run to run, and messages get shaped by whatever else is in the conversation | Same steps every time, and messages are written only from the diff |

On top of that:

- **Small models are enough.** Since the model only writes text, cheap fast models (`claude-3-5-haiku`, `gpt-4o-mini`) do the job. They're the defaults.
- **Free if you want.** Run it fully locally with [Ollama](#ollama-local-no-api-key) and no API key.
- **Bounded input.** Each prompt is just the trimmed diff (`--max-diff-chars`) and the commits, with no chat history.

The [committer skill](./skills/committer/SKILL.md) for agents follows the same idea. It doesn't teach the agent the git workflow. It tells the agent to run one committer command and read the JSON result.

## Demo

[![Watch the demo](https://img.youtube.com/vi/2jtUHqYycro/maxresdefault.jpg)](https://www.youtube.com/watch?v=2jtUHqYycro)

## Features

- Streams commit messages live as they are generated
- Regenerate with optional freeform instructions (`r` → type anything)
- Pull request generation from commits **and the full branch changeset**, with a structured Summary / Changes / Impact format
- AI-named branches (`feat/add-token-refresh`) from your unpushed commits or uncommitted work, with an option to move the commits off `dev`
- `--non-interactive` / `--json` mode so scripts and AI agents can commit and open PRs unattended
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

Generate a PR title and description from the commits **and the actual changeset** (`git diff <base>...HEAD` plus a per-file summary) between a base branch and your current branch. Commits tell the AI the intent; the diff tells it what really changed, so the description stays accurate even when commit messages are terse:

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

Commit and open the PR in one go. With `.` (or when you already have staged changes), committer commits first and then builds the PR, including that new commit:

```bash
committer . --pr main
```

The diff sent for PRs is capped by `--max-diff-chars`. When it is trimmed, the per-file summary is still sent in full.

---

## Branch naming

Committed on `dev` and realised it should be its own branch? Run:

```bash
committer --branch
```

committer reads the commits on your branch that are not on its remote (`@{u}..HEAD`, e.g. `origin/dev..dev`) plus any uncommitted changes. It suggests a `type/short-slug` name, then creates and switches to that branch. Your working tree and staged changes come along with you.

```
🌿 Suggested branch: feat/add-token-refresh
   from 3 commit(s) on dev not in origin/dev + uncommitted changes
Use (y) to create, (e) to edit, (n) to abort, (r) to regenerate:
Move these 3 commit(s) off dev (reset it to origin/dev)? (y/N):
```

Answering `y` to the move question resets `dev` back to `origin/dev`. The commits are then only on the new branch. Nothing is lost, because the new branch points at your old `dev` HEAD.

| Command | What it does |
|---------|--------------|
| `committer --branch` | Name from commits not on the upstream, plus uncommitted changes |
| `committer --branch main` | Name from commits not in `main` (never offers to move) |
| `committer --branch --move` | Move the commits off the source branch without asking |
| `committer . --branch` | Create the branch, then stage everything and commit on it |
| `committer . --branch --pr dev` | Branch → commit → PR into `dev` |

If the name already exists, committer appends `-2`, `-3`, and so on. You can steer naming with `--prompt-append` or `claude.md`.

---

## Using committer from scripts and AI agents

`--non-interactive` runs without any prompts, spinners, or colors:

```bash
committer . --non-interactive                 # stage everything, generate a message, commit
committer --pr main --non-interactive         # generate the PR, push the branch, open the PR
committer . --pr main --non-interactive       # commit, push, and open the PR
committer . --branch --pr dev --non-interactive  # new AI-named branch, commit, push, PR into dev
```

- Commits are made automatically. Empty AI responses are retried up to 3 times.
- For PRs, the current branch is pushed (`git push -u origin <branch>` the first time), then the PR is created with `gh` or `az`. The CLI is never auto-installed. If it is missing, the run fails and still prints the generated PR.
- `--branch` creates the branch without asking. The source branch is only reset when you pass `--move`.
- If no `~/.committer` exists, onboarding is skipped and environment variables or defaults are used.
- Progress and warnings go to **stderr**, and only the result goes to **stdout**.
- Exit code `0` means success or nothing to do. `1` means an error.

Add `--json` (which implies `--non-interactive`) to get a single JSON object on stdout:

```bash
committer . --pr main --json
```

```json
{
  "ok": true,
  "branch": { "name": "feat/add-token-refresh", "from": "dev", "base": "origin/dev", "commits": 3, "moved": 0 },
  "commit": { "sha": "8570c54", "message": "feat(api): add token refresh\n\n..." },
  "pr": {
    "title": "Add Token Refresh",
    "description": "## Summary\n...",
    "base": "main",
    "created": true,
    "url": "https://github.com/you/repo/pull/42"
  }
}
```

`branch`, `commit` and `pr` are `null` when that step did not run. On failure you get `{"ok": false, ..., "error": "<message>"}`. When there is nothing to do, or no GitHub/Azure DevOps remote is found, a `reason` field explains why.

### Make your AI agent use committer

This repo ships a ready-made skill: [`skills/committer/SKILL.md`](./skills/committer/SKILL.md). It tells an agent to use committer for every commit, branch, and PR. It also covers which flags to use, how to read the JSON, and how to handle each error.

**Claude Code.** Copy the skill into your skills folder. Use `~/.claude/skills/` for all projects, or `.claude/skills/` for one repo:

```bash
mkdir -p ~/.claude/skills/committer
curl -fsSL https://raw.githubusercontent.com/frigopedro/committer/main/skills/committer/SKILL.md \
  -o ~/.claude/skills/committer/SKILL.md
```

**Other agents (Codex, Cursor, Copilot, …).** Paste the contents of `SKILL.md` into your `AGENTS.md`, `CLAUDE.md`, or rules file. Or point the agent at it with a short instruction:

```md
For all commits, branches, and pull requests, use the `committer` CLI as described in
skills/committer/SKILL.md (always with `--json`). Never write commit messages or PR descriptions by hand.
```

---

## Providers

### Claude (default)

Two ways to authenticate:

**Option 1 — Claude Code OAuth token (no API key needed)**

If you have [Claude Code](https://claude.ai/code) installed, generate a token from within Claude Code and export it:

```bash
export CLAUDE_CODE_OAUTH_TOKEN=<your-token>
committer
```

> OAuth tokens are short-lived. If you see auth errors, generate a new token from Claude Code.

**Option 2 — Anthropic API key**

Get a key at [console.anthropic.com](https://console.anthropic.com).

```bash
export ANTHROPIC_API_KEY=sk-ant-...
committer
```

`CLAUDE_CODE_OAUTH_TOKEN` takes precedence over `ANTHROPIC_API_KEY` if both are set.

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
| `--pr <base-branch>` | Generate PR description from commits and the branch diff since base branch |
| `--branch [base]` | Create and switch to an AI-named branch from commits not in `base` (default: upstream) and uncommitted changes |
| `--move` | With `--branch`: reset the source branch to its upstream so the commits live only on the new branch |
| `--non-interactive` | No prompts: auto-commit, push, and create the PR (for scripts and AI agents) |
| `--json` | Print a single JSON result to stdout (implies `--non-interactive`) |
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
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code OAuth token (takes precedence over API key) |
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
DEBUG_PROMPT=1 committer --pr main
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
