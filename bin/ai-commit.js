#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
];

const DEFAULT_MAX_DIFF_CHARS = 12000;
const DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-latest";
const DEFAULT_OLLAMA_MODEL = "llama3.1";

const EXIT_USER_ABORT = 2;

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, true);
    }
  }
  return args;
}

function printHelp() {
  const lines = [
    "committer - generate conventional commit messages with AI",
    "",
    "Usage:",
    "  committer [--provider claude|ollama] [--model name] [--staged] [--all]",
    "",
    "Options:",
    "  --provider            AI provider (default: claude)",
    "  --model               Override model name",
    "  --staged              Use staged diff only",
    "  --all                 Combine staged + unstaged diff",
    "  --max-diff-chars       Trim diff to this many chars (default: 12000)",
    "  --init                Run onboarding and write .committer",
    "  --help                Show this help",
    "",
    "Environment:",
    "  AI_COMMIT_PROVIDER    claude | ollama",
    "  AI_COMMIT_MODEL       model override",
    "  AI_COMMIT_MAX_DIFF_CHARS   trim diff length",
    "  ANTHROPIC_API_KEY     Claude API key",
    "  CLAUDE_API_KEY        Claude API key (alias)",
    "  AI_COMMIT_OLLAMA_HOST Ollama host (default: http://localhost:11434)",
  ];
  output.write(`${lines.join("\n")}\n`);
}

function runGit(args) {
  return execSync(`git ${args}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function ensureGitRepo() {
  try {
    runGit("rev-parse --show-toplevel");
  } catch (error) {
    output.write("Not inside a git repository.\n");
    process.exit(1);
  }
}

function getRepoRoot() {
  return runGit("rev-parse --show-toplevel");
}

async function readConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    output.write(
      `Could not read ${configPath}. Falling back to defaults.\n`
    );
    return null;
  }
}

async function writeConfig(configPath, config) {
  const contents = `${JSON.stringify(config, null, 2)}\n`;
  await fs.writeFile(configPath, contents, "utf8");
}

async function promptSelect({ rl, question, options, defaultValue }) {
  output.write(`\n${question}\n`);
  options.forEach((option, index) => {
    const marker = option.value === defaultValue ? " (default)" : "";
    output.write(`${index + 1}) ${option.label}${marker}\n`);
  });

  const answer = await rl.question("Select option: ");
  const trimmed = answer.trim();
  if (!trimmed) return defaultValue;

  const asNumber = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1].value;
  }

  const matched = options.find((option) => option.value === trimmed);
  if (matched) return matched.value;

  output.write("Invalid selection. Using default.\n");
  return defaultValue;
}

async function promptNumber({ rl, question, defaultValue, min }) {
  while (true) {
    const answer = await rl.question(`${question} [${defaultValue}]: `);
    const trimmed = answer.trim();
    if (!trimmed) return defaultValue;
    const value = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(value) && value >= min) return value;
    output.write(`Please enter a number >= ${min}.\n`);
  }
}

function getDiff(mode) {
  const staged = runGit("diff --staged");
  const unstaged = runGit("diff");

  if (mode === "staged") return staged;
  if (mode === "all") {
    if (staged && unstaged) return `${staged}\n\n${unstaged}`;
    return staged || unstaged;
  }

  return staged || unstaged;
}

function truncateDiff(diff, maxChars) {
  if (diff.length <= maxChars) return { diff, truncated: false };
  const keep = Math.floor(maxChars / 2);
  const start = diff.slice(0, keep);
  const end = diff.slice(diff.length - keep);
  return {
    diff: `${start}\n\n...diff truncated...\n\n${end}`,
    truncated: true,
  };
}

function buildPrompt(diff, { truncated }) {
  const types = COMMIT_TYPES.join(", ");
  return [
    "You generate conventional commit messages.",
    "Output exactly one line.",
    "Format: <type>(optional-scope): <description>",
    `Allowed types: ${types}.`,
    "Use imperative mood, lower-case description, no trailing period.",
    "Keep it under 72 characters.",
    "Do not wrap in quotes or code fences.",
    truncated ? "The diff was truncated." : "",
    "",
    "Diff:",
    diff,
  ]
    .filter(Boolean)
    .join("\n");
}

function cleanCommitMessage(message) {
  let cleaned = message.trim();
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "");
  cleaned = cleaned.replace(/^commit message:\s*/i, "");
  cleaned = cleaned.replace(/^"|"$/g, "");
  cleaned = cleaned.replace(/^'|'$/g, "");
  if (cleaned.includes("\n")) {
    cleaned = cleaned.split("\n")[0].trim();
  }
  return cleaned.trim();
}

async function callClaude({ system, user, model }) {
  const apiKey =
    process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "";
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY or CLAUDE_API_KEY for Claude provider."
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 64,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.content?.[0]?.text ?? "";
  return content;
}

async function callOllama({ system, user, model }) {
  const host = process.env.AI_COMMIT_OLLAMA_HOST || "http://localhost:11434";
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 64,
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data?.message?.content ?? data?.response ?? "";
}

async function generateCommitMessage({ provider, model, diff, truncated }) {
  const system =
    "You are a senior developer assistant that writes clear, conventional commit messages.";
  const user = buildPrompt(diff, { truncated });

  const raw =
    provider === "ollama"
      ? await callOllama({ system, user, model })
      : await callClaude({ system, user, model });

  return cleanCommitMessage(raw);
}

async function fetchOllamaModels(host) {
  const response = await fetch(`${host}/api/tags`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const models = (data?.models || [])
    .map((model) => model?.name)
    .filter(Boolean);
  return Array.from(new Set(models)).sort();
}

async function selectOllamaModel({ host, rl }) {
  const models = await fetchOllamaModels(host);
  if (!models.length) {
    throw new Error(
      "No Ollama models found. Run 'ollama pull <model>' first."
    );
  }

  const defaultIndex = Math.max(
    0,
    models.findIndex((model) => model === DEFAULT_OLLAMA_MODEL)
  );

  output.write("\nAvailable Ollama models:\n");
  models.forEach((model, index) => {
    const marker = index === defaultIndex ? " (default)" : "";
    output.write(`${index + 1}) ${model}${marker}\n`);
  });

  const answer = await rl.question(
    `Select model [${defaultIndex + 1}]: `
  );
  const trimmed = answer.trim();
  if (!trimmed) {
    return models[defaultIndex];
  }

  const asNumber = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= models.length) {
    return models[asNumber - 1];
  }

  if (models.includes(trimmed)) {
    return trimmed;
  }

  output.write("Invalid selection. Using default model.\n");
  return models[defaultIndex];
}

async function runOnboarding({ rl, configPath }) {
  output.write("\nWelcome to committer! Let's create a .committer config.\n");

  const provider = await promptSelect({
    rl,
    question: "Choose your AI provider:",
    defaultValue: "ollama",
    options: [
      { value: "ollama", label: "Ollama (local)" },
      { value: "claude", label: "Claude (API key required)" },
    ],
  });

  let model =
    provider === "ollama" ? DEFAULT_OLLAMA_MODEL : DEFAULT_CLAUDE_MODEL;
  if (provider === "ollama") {
    const host = process.env.AI_COMMIT_OLLAMA_HOST || "http://localhost:11434";
    try {
      model = await selectOllamaModel({ host, rl });
    } catch (error) {
      output.write(`Ollama model selection failed: ${error.message}\n`);
      output.write(`Falling back to ${DEFAULT_OLLAMA_MODEL}.\n`);
    }
  }

  const diffMode = await promptSelect({
    rl,
    question: "Which diff should committer use?",
    defaultValue: "auto",
    options: [
      { value: "auto", label: "Auto (staged if any, else unstaged)" },
      { value: "staged", label: "Staged only" },
      { value: "all", label: "Staged + unstaged" },
    ],
  });

  const maxDiffChars = await promptNumber({
    rl,
    question: "Max diff characters to send",
    defaultValue: DEFAULT_MAX_DIFF_CHARS,
    min: 500,
  });

  const config = {
    version: 1,
    provider,
    model,
    diffMode,
    maxDiffChars,
  };

  await writeConfig(configPath, config);
  output.write(`Saved config to ${configPath}.\n`);
  return config;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("help")) {
    printHelp();
    process.exit(0);
  }

  ensureGitRepo();
  const repoRoot = getRepoRoot();
  const configPath = resolve(repoRoot, ".committer");

  const rl = createInterface({ input, output });
  let storedConfig = await readConfig(configPath);
  if (!storedConfig || args.has("init")) {
    storedConfig = await runOnboarding({ rl, configPath });
  }

  const provider =
    args.get("provider") ||
    process.env.AI_COMMIT_PROVIDER ||
    storedConfig?.provider ||
    "claude";
  if (provider !== "claude" && provider !== "ollama") {
    output.write("Provider must be claude or ollama.\n");
    process.exit(1);
  }
  const modelOverride =
    args.get("model") || process.env.AI_COMMIT_MODEL || storedConfig?.model;
  let model =
    modelOverride ||
    (provider === "ollama" ? DEFAULT_OLLAMA_MODEL : DEFAULT_CLAUDE_MODEL);
  let maxDiffChars = Number.parseInt(
    args.get("max-diff-chars") ||
      process.env.AI_COMMIT_MAX_DIFF_CHARS ||
      storedConfig?.maxDiffChars ||
      DEFAULT_MAX_DIFF_CHARS,
    10
  );
  if (Number.isNaN(maxDiffChars) || maxDiffChars <= 0) {
    maxDiffChars = DEFAULT_MAX_DIFF_CHARS;
  }

  const diffModeFromArgs = args.get("staged")
    ? "staged"
    : args.get("all")
    ? "all"
    : null;
  const diffMode = diffModeFromArgs || storedConfig?.diffMode || "auto";

  const diff = getDiff(diffMode);

  if (!diff.trim()) {
    output.write("No changes detected in git diff.\n");
    rl.close();
    process.exit(0);
  }

  const { diff: trimmedDiff, truncated } = truncateDiff(diff, maxDiffChars);

  let message = "";

  try {
    if (provider === "ollama" && !modelOverride) {
      const host = process.env.AI_COMMIT_OLLAMA_HOST || "http://localhost:11434";
      try {
        model = await selectOllamaModel({ host, rl });
      } catch (error) {
        output.write(`Ollama model selection failed: ${error.message}\n`);
        output.write(`Falling back to ${DEFAULT_OLLAMA_MODEL}.\n`);
        model = DEFAULT_OLLAMA_MODEL;
      }
    }

    while (true) {
      message = await generateCommitMessage({
        provider,
        model,
        diff: trimmedDiff,
        truncated,
      });

      if (!message) {
        output.write("AI did not return a commit message.\n");
      } else {
        output.write(`\nSuggested commit message:\n${message}\n\n`);
      }

      if (!message) {
        output.write("Regenerating commit message...\n");
        continue;
      }

      const answer = await rl.question(
        "Use (y) to commit, (n) to abort, (r) to regenerate: "
      );
      const choice = answer.trim().toLowerCase();

      if (choice === "y") {
        const result = spawnSync("git", ["commit", "-m", message], {
          stdio: "inherit",
        });
        process.exit(result.status ?? 1);
      }

      if (choice === "n") {
        output.write("Commit aborted.\n");
        process.exit(EXIT_USER_ABORT);
      }

      if (choice === "r") {
        output.write("Regenerating commit message...\n");
        continue;
      }

      output.write("Please enter y, n, or r.\n");
    }
  } catch (error) {
    output.write(`Error: ${error.message}\n`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
