# Contributing

Thanks for your interest. This document covers everything you need to get the project running locally and make changes.

---

## Setup

You need **Node.js 18+** and **npm**.

```bash
git clone https://github.com/frigopedro/conventional-ai-commit.git
cd conventional-ai-commit
npm link
```

`npm link` installs the `committer` binary globally from your local source, so changes take effect immediately — no rebuild step needed.

Verify it works:

```bash
committer --help
```

---

## Project structure

```
conventional-ai-commit/
├── index.js                 Entry point — spinner, readline, wires everything together
├── src/
│   ├── app.js               Main interactive loop (commit + PR flows)
│   ├── ai.js                generateCommitMessage / generatePullRequest
│   ├── args.js              CLI flag parser
│   ├── config.js            Read/write ~/.committer
│   ├── constants.js         Defaults, allowed commit types, exit codes
│   ├── files.js             readTextFile (used for claude.md)
│   ├── git-client.js        All git shell operations
│   ├── onboarding.js        First-run setup wizard
│   ├── text.js              extractPrJson, cleanCommitMessage
│   ├── ui.js                ANSI colors, write/writeLine helpers
│   ├── validate.js          Conventional commit format validation
│   ├── providers/
│   │   ├── base.js          BaseProvider abstract class
│   │   ├── registry.js      createProvider factory
│   │   ├── claude.js        Anthropic Claude
│   │   ├── openai.js        OpenAI with streaming
│   │   └── ollama.js        Local Ollama with streaming
│   └── platforms/
│       ├── index.js         detectPlatform from remote URL
│       ├── github.js        GitHub CLI integration
│       └── azure.js         Azure DevOps CLI integration
└── tests/
    └── app.test.js
```

---

## Running tests

```bash
npm test
```

Uses Node's built-in `node:test` — no extra packages required.

---

## How things work

### Commit flow

1. `app.js` reads the diff via `GitClient`
2. Calls `ai.generateCommitMessage({ provider, model, diff, ... })`
3. The provider builds a prompt (rules + diff) and streams tokens back
4. User sees the message and picks `y / n / r`
5. On `r` the user can type extra instructions — these are injected directly into the rules block of the prompt so the model treats them as a first-class constraint

### PR flow

1. `app.js` collects commits since the base branch
2. Calls `ai.generatePullRequest({ provider, model, commits, baseBranch, ... })`
3. The provider returns a JSON object `{ title, description }`
4. `app.js` renders it as readable terminal output
5. User picks `y / n / r` — `y` delegates to the detected platform CLI

### Prompt injection order (commit)

```
<user instruction if any>      ← peer rule, injected inside the rules block
Use conventional commits.
Subject under 72 characters.
...other rules...

Diff:
<git diff>
```

User instructions are part of the rules array, not appended after the diff.

---

## Adding a new AI provider

1. Create `src/providers/yourprovider.js` extending `BaseProvider`:

```js
import { BaseProvider } from "./base.js";
import { COMMIT_TYPES } from "../constants.js";

export class YourProvider extends BaseProvider {
  get name() { return "yourprovider"; }
  get supportsStreaming() { return false; } // set true if you implement stream()

  buildSystemPrompt() {
    return "You are a senior developer assistant that writes clear, conventional commit messages.";
  }

  buildPrompt(diff, { truncated, appendText, customInstructions }) {
    // customInstructions path
    if (customInstructions) {
      return this.buildCustomPrompt(customInstructions, { diff, truncated, appendText });
    }
    const types = COMMIT_TYPES.join(", ");
    return [
      "Return only the commit message.",
      `Allowed types: ${types}.`,
      appendText?.trim() || "",
      truncated ? "The diff is truncated." : "",
      "",
      "Diff:",
      diff,
    ].filter(Boolean).join("\n");
  }

  buildPullRequestPrompt({ commits, baseBranch, customInstructions, appendText }) {
    // Must return a prompt that produces JSON: { title, description }
    // See claude.js for a reference implementation
  }

  async generate({ system, user }) {
    // Call your API and return the raw text string
  }

  // Optional — implement if supportsStreaming is true
  async stream({ system, user, onToken }) {
    // Call onToken(chunk) for each streamed token, return full string
  }

  static async listModels() {
    // Return string[] of model names, or [] if not supported
    return [];
  }
}
```

2. Register it in `src/providers/registry.js`:

```js
import { YourProvider } from "./yourprovider.js";

// add to the switch/map that createProvider uses
```

3. Add the name to `PROVIDERS` in `src/app.js` and the help text.

4. Add the default model constant to `src/constants.js` and handle it in `resolveModel()` inside `app.js`.

---

## Adding a new git platform

1. Create `src/platforms/yourplatform.js`:

```js
import { spawnSync } from "node:child_process";

export class YourPlatform {
  get name() { return "Your Platform"; }
  get cliName() { return "yourcli"; }

  isCliInstalled() {
    return spawnSync("yourcli", ["--version"], { stdio: "ignore" }).status === 0;
  }

  installCli() {
    // use spawnSync with stdio: "inherit"
    // throw an Error if install fails
  }

  createPr({ title, description, baseBranch }) {
    const result = spawnSync(
      "yourcli",
      ["pr", "create", "--title", title, "--body", description, "--base", baseBranch],
      { stdio: "inherit" }
    );
    return result.status === 0;
  }
}
```

2. Register it in `src/platforms/index.js`:

```js
import { YourPlatform } from "./yourplatform.js";

export function detectPlatform(remoteUrl) {
  if (!remoteUrl) return null;
  if (remoteUrl.includes("github.com")) return new GithubPlatform();
  if (remoteUrl.includes("yourplatform.com")) return new YourPlatform(); // add this
  // ...
}
```

---

## Debug

Print the full prompt sent to the AI on any run:

```bash
DEBUG_PROMPT=1 committer
```

---

## Pull requests

- Keep changes focused — one feature or fix per PR
- Run `npm test` before opening a PR
- Commit messages should follow conventional commits (the tool eats its own dog food)
- No external runtime dependencies — the project intentionally uses only Node built-ins
