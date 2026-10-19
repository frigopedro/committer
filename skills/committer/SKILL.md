---
name: committer
description: Use committer for all git commits, branch creation, and pull requests. Use it whenever you need to commit changes, create a branch for your work, or open a PR, instead of writing commit messages, branch names, or PR descriptions yourself with raw git/gh commands.
---

# committer

`committer` is a CLI that writes conventional commit messages, branch names, and PR descriptions from the actual git diff using a small, low-cost model. Use it for every commit, branch, and PR so you don't spend your own context reading diffs and writing messages.

## Rules

- **Always pass `--json`.** It makes the run non-interactive (no prompts, so it can't hang) and prints exactly one JSON object on stdout. Progress and warnings go to stderr.
- **Never run `git commit`, `git checkout -b` / `git switch -c`, or `gh pr create` yourself** for work you are committing, branching, or opening a PR for. Use committer instead.
- **Check `ok` in the output** before you report success. If `ok` is `false`, read `error` and handle it (see below).
- **Check `git status` before you use `.`**. `.` runs `git add .` and stages everything. If unrelated or sensitive files show up (`.env`, credentials, build output, scratch files), stage only the right files with `git add <paths>` and leave out `.`. committer commits whatever is staged.
- **Only pass `--move` if the user asked** for the commits to be moved off the current branch. `--move` resets the source branch to its upstream.
- Report the commit SHA, branch name, and/or PR URL from the JSON back to the user.

## Setup check

```bash
committer --help >/dev/null 2>&1 || npm install -g @frigopedro/committer
```

committer needs AI credentials in the environment. Any one of these works: `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (plus `--provider openai`), or a local Ollama (`--provider ollama`). For PRs it also needs `gh` (GitHub) or `az` (Azure DevOps) installed and authenticated.

## Commands

| Goal | Command |
|------|---------|
| Commit everything | `committer . --json` |
| Commit only what is already staged | `committer --staged --json` |
| Open a PR into `main` (commits staged changes first) | `committer --pr main --json` |
| Commit everything, then open a PR into `main` | `committer . --pr main --json` |
| Create an AI-named branch from current work | `committer --branch --json` |
| New branch, commit, and PR in one go | `committer . --branch --pr dev --json` |
| New branch and move the commits off the current branch (user asked) | `committer --branch --move --json` |

Order of steps when flags are combined: branch → stage (`.`) → commit → push → PR.

Steer the output with `--prompt-append "<instruction>"`, for example `--prompt-append "mention the ticket ABC-123"`.

## Output

```json
{
  "ok": true,
  "branch": { "name": "feat/add-token-refresh", "from": "dev", "base": "origin/dev", "commits": 3, "moved": 0 },
  "commit": { "sha": "8570c54", "message": "feat(api): add token refresh\n\n..." },
  "pr": { "title": "Add Token Refresh", "description": "## Summary\n...", "base": "main", "created": true, "url": "https://github.com/o/r/pull/42" }
}
```

- `branch`, `commit`, and `pr` are `null` when that step did not run.
- `reason` explains no-op runs (for example `"no changes"`) and PRs that were generated but not created (no GitHub or Azure DevOps remote).
- Exit code `0` means success or nothing to do. `1` means an error.

## Handling errors

| `error` contains | What to do |
|------------------|------------|
| `Missing credentials` | Tell the user which env var to set. Do not fall back to a manual commit unless they ask. |
| `gh CLI is not installed` / `az CLI is not installed` | The PR text is still in `pr`. Tell the user to install and auth the CLI, or give them the title and description. |
| `not found locally or on the remote` | The base branch is wrong or not fetched. Run `git fetch` or confirm the base branch with the user. |
| `git push failed` | Report the push error (auth, protected branch, diverged history). Do not force-push. |
| `git commit failed` | Usually nothing staged or a pre-commit hook failed. Read stderr, fix the cause, and run again. |
| `PR creation failed` | Often a PR already exists for the branch. Check with `gh pr view` and report it. |
