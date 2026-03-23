# committer

I was tired of writing commit messages by hand, so I did this.

## Install

```bash
npm install -g .
```

Or for local development:

```bash
npm link
```

## Usage

```bash
committer
```

The tool reads your git diff, proposes a conventional commit message, then
asks you to (y) commit, (n) abort, or (r) regenerate.

On first run, committer creates a `.committer` config file in the repo and
walks the user through provider and model selection.
Use `committer --init` to re-run onboarding and rewrite the config.

### Options

```bash
committer --provider ollama --model llama3.1
committer --staged
committer --all
committer --init
```

If you run `committer` with `--provider ollama` and no model specified, the
CLI will list your local Ollama models and prompt you to pick one.

### Environment variables

- `AI_COMMIT_PROVIDER`: `claude` or `ollama`
- `AI_COMMIT_MODEL`: override model name
- `AI_COMMIT_MAX_DIFF_CHARS`: trim diff length
- `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`: Claude API key
- `AI_COMMIT_OLLAMA_HOST`: Ollama host (default `http://localhost:11434`)

### .committer config

The `.committer` file is a JSON config stored at the root of your git repo.

Example:

```json
{
  "version": 1,
  "provider": "ollama",
  "model": "llama3.1",
  "diffMode": "auto",
  "maxDiffChars": 12000
}
```

## Claude setup

Set your Claude API key before running:

```bash
export ANTHROPIC_API_KEY=your_key_here
```

## Local Llama setup

Install and run Ollama, then pull a model:

```bash
ollama pull llama3.1
```

Run the CLI with:

```bash
committer --provider ollama
```
