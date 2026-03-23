# committer

Generate conventional commit messages using Claude or a local Llama model.

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

### Options

```bash
committer --provider ollama --model llama3.1
committer --staged
committer --all
```

### Environment variables

- `AI_COMMIT_PROVIDER`: `claude` or `ollama`
- `AI_COMMIT_MODEL`: override model name
- `AI_COMMIT_MAX_DIFF_CHARS`: trim diff length
- `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`: Claude API key
- `AI_COMMIT_OLLAMA_HOST`: Ollama host (default `http://localhost:11434`)

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
