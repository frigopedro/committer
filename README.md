# AI Git Committer

I was tired of typing out commit messages, so I wrote this tool.
I know bunch of other tools exist, but I had hard times with them.

Its a personal tool, dont expect to be good because its not :/

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

Commit messages include a required body with a broader summary of the changes.

On first run, committer creates a `.committer` config file in your home
directory and walks the user through provider and model selection.
Use `committer --init` to re-run onboarding and rewrite the config.

### Options

```bash
committer --provider ollama --model llama3.1
committer --provider openai --model gpt-4o-mini
committer --staged
committer --all
committer --init
```

If you run `committer` with `--provider ollama` and no model specified, the
CLI will list your local Ollama models and prompt you to pick one.

### Environment variables

- `AI_COMMIT_PROVIDER`: `claude`, `ollama`, or `openai`
- `AI_COMMIT_MODEL`: override model name
- `AI_COMMIT_MAX_DIFF_CHARS`: trim diff length
- `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`: Claude API key
- `OPENAI_API_KEY`: OpenAI API key
- `AI_COMMIT_OLLAMA_HOST`: Ollama host (default `http://localhost:11434`)

### .committer config

The `.committer` file is a JSON config stored at `~/.committer`.

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

### Commit format

Commit messages are generated in the format:

```
<type>[optional scope]: <description>

<body>
```

The body is always present and provides a multi-sentence summary of most
changed files.

## Claude setup

Set your Claude API key before running:

```bash
export ANTHROPIC_API_KEY=your_key_here
```

## ChatGPT setup

Set your OpenAI API key before running:

```bash
export OPENAI_API_KEY=your_key_here
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
