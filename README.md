# AI Git Committer 🤖

I was tired of typing out commit messages, so I wrote this tool. I know bunch of other tools exist, but I had hard times with them.

Its a personal tool, dont expect to be good because its not :/

## Install 📦

```bash
npm install -g @frigopedro/committer
```

Local development:

```bash
npm link
```

## Quick start ⚡

```bash
committer
```

Stage everything and commit in one go:

```bash
committer .
```

You will get a suggested commit message and can:

- `y` to commit
- `n` to abort
- `r` to regenerate

The commit message streams live as it is generated.

On first run, committer creates `~/.committer` and walks you through provider + model selection.
Re-run onboarding anytime with:

```bash
committer --init
```

## Usage ✅

```bash
committer --provider ollama --model llama3.1
committer --provider openai --model gpt-4o-mini
committer --prompt-append "Prefer mentioning tests if they changed."
committer --staged
committer --all
```

If you run with `--provider ollama` and no model, it will list local models and let you pick one.

## Commit format ✍️

Commit messages are generated as:

```
<type>[optional scope]: <description>

<body>
```

The body is always present and provides a multi‑sentence summary covering most changed files.

## Providers 🔌

### Claude

```bash
export ANTHROPIC_API_KEY=your_key_here
```

### ChatGPT (OpenAI)

```bash
export OPENAI_API_KEY=your_key_here
```

### Local Llama (Ollama)

```bash
ollama pull llama3.1
```

```bash
committer --provider ollama
```

## Config file 🧰

`~/.committer` is a JSON config shared across all repos.
You can override `promptAppend` per run with `--prompt-append`.

If `useClaudeMd` is `true`, committer will load `claude.md` from the current
repo root and use its instructions instead of the built-in prompt.

```json
{
  "version": 1,
  "provider": "ollama",
  "model": "llama3.1",
  "diffMode": "auto",
  "maxDiffChars": 12000,
  "promptAppend": "",
  "useClaudeMd": false
}
```

## Environment variables 🌱

- `AI_COMMIT_PROVIDER`: `claude`, `ollama`, or `openai`
- `AI_COMMIT_MODEL`: override model name
- `AI_COMMIT_MAX_DIFF_CHARS`: trim diff length
- `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`: Claude API key
- `OPENAI_API_KEY`: OpenAI API key
- `AI_COMMIT_OLLAMA_HOST`: Ollama host (default `http://localhost:11434`)

## Tests 🧪

```bash
npm test
```

## Contributing 🤝

Contributions are welcome! Feel free to open issues or pull requests.
