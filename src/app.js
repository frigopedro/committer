import { spawnSync } from "node:child_process";
import {
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PROVIDER,
  EXIT_USER_ABORT,
} from "./constants.js";
import { detectPlatform } from "./platforms/index.js";

const PROVIDERS = ["claude", "ollama", "openai"];
const SEPARATOR = "-".repeat(64);

function renderPr(pr, colorize, colors) {
  const lines = [`${colorize(pr.title, colors.bold)}`, ""];
  for (const line of pr.description.split("\n")) {
    if (line.startsWith("## ")) {
      lines.push(colorize(line.slice(3), colors.bold));
    } else if (line.startsWith("- ")) {
      lines.push("• " + line.slice(2));
    } else {
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function copyToClipboard(text) {
  const { platform } = process;
  const input = Buffer.from(text);

  if (platform === "darwin") {
    return spawnSync("pbcopy", [], { input }).status === 0;
  }

  if (platform === "win32") {
    return spawnSync("clip", [], { input }).status === 0;
  }

  // Linux — try common clipboard tools in order
  for (const [cmd, args] of [
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]],
  ]) {
    const result = spawnSync(cmd, args, { input, stdio: ["pipe", "ignore", "ignore"] });
    if (result.status === 0) return true;
  }

  return false;
}

function normalizeProvider(provider) {
  if (provider === "chatgpt") return "openai";
  return provider;
}

function resolveModel({ provider, modelFromArgs, storedConfig }) {
  if (modelFromArgs) return modelFromArgs;

  if (storedConfig?.provider === provider && storedConfig?.model) {
    return storedConfig.model;
  }

  if (provider === "ollama") return DEFAULT_OLLAMA_MODEL;
  if (provider === "openai") return DEFAULT_OPENAI_MODEL;
  return DEFAULT_CLAUDE_MODEL;
}

async function promptRuntimeModel({
  provider,
  defaultModel,
  rl,
  host,
  providerRegistry,
  ui,
}) {
  const Provider = providerRegistry.getProviderClass(provider);
  if (!Provider || typeof Provider.listModels !== "function") {
    return defaultModel;
  }

  let models = [];
  try {
    models = await Provider.listModels({ host });
  } catch (error) {
    ui.writeLine(`⚠️ ${provider} model selection failed: ${error.message}`);
    ui.writeLine(`↩️ Falling back to ${defaultModel}.`);
    return defaultModel;
  }

  if (!models.length) {
    return defaultModel;
  }

  const defaultIndex = Math.max(
    0,
    models.findIndex((model) => model === defaultModel)
  );

  ui.writeLine(`\n🧠 Available ${provider} models:`);
  models.forEach((model, index) => {
    const marker = index === defaultIndex ? " (default)" : "";
    ui.writeLine(`${index + 1}) ${model}${marker}`);
  });

  const answer = await rl.question(`Select model [${defaultIndex + 1}]: `);
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

  ui.writeLine("Invalid selection. Using default model.");
  return models[defaultIndex];
}

function printHelp(ui) {
  const lines = [
    "committer - generate conventional commit messages with AI",
    "",
    "Usage:",
    "  committer [--provider claude|ollama|openai] [--model name] [--staged] [--all]",
    "  committer --pr <base-branch>",
    "",
    "Options:",
    "  --provider            AI provider (default: claude)",
    "  --model               Override model name",
    "  --staged              Use staged diff only",
    "  --all                 Combine staged + unstaged diff",
    "  --max-diff-chars       Trim diff to this many chars (default: 12000)",
    "  --prompt-append        Extra instructions appended to the prompt",
    "  --pr                  Generate PR title/description from commits",
    "  --init                Run onboarding and write ~/.committer",
    "  --help                Show this help",
    "",
    "Environment:",
    "  AI_COMMIT_PROVIDER    claude | ollama | openai",
    "  AI_COMMIT_MODEL       model override",
    "  AI_COMMIT_MAX_DIFF_CHARS   trim diff length",
    "  ANTHROPIC_API_KEY     Claude API key",
    "  CLAUDE_API_KEY        Claude API key (alias)",
    "  OPENAI_API_KEY        OpenAI API key",
    "  AI_COMMIT_OLLAMA_HOST Ollama host (default: http://localhost:11434)",
  ];

  ui.writeLine(lines.join("\n"));
}

export async function runApp({
  argv,
  args,
  env,
  ui,
  git,
  ai,
  config,
  providerRegistry,
  files,
  rl,
  createSpinner,
}) {
  const colorize = ui.colorize ?? ((text) => text);
  const colors = ui.colors ?? {};
  const shouldAddAll = (argv ?? []).includes(".");

  try {
    if (args.has("help")) {
      printHelp(ui);
      return 0;
    }

    let hasRepo = true;
    try {
      git.ensureRepo();
    } catch (error) {
      hasRepo = false;
      if (!args.has("init")) {
        ui.writeLine(`❌ ${error.message}`);
        return 1;
      }
    }

    const configPath = config.getConfigPath();
    const ollamaHost = env.AI_COMMIT_OLLAMA_HOST || "http://localhost:11434";

    let storedConfig = null;
    try {
      storedConfig = await config.readConfig(configPath);
    } catch (error) {
      ui.writeLine(`⚠️ ${error.message}`);
    }

    if (!storedConfig || args.has("init")) {
      storedConfig = await config.runOnboarding({ rl, configPath, ollamaHost });
      if (!hasRepo) {
        return 0;
      }
    }

    const providerInput =
      args.get("provider") || env.AI_COMMIT_PROVIDER || storedConfig?.provider || DEFAULT_PROVIDER;
    const provider = normalizeProvider(providerInput);

    if (!PROVIDERS.includes(provider)) {
      ui.writeLine("❌ Provider must be claude, openai, or ollama.");
      return 1;
    }

    const modelFromArgs = args.get("model") || env.AI_COMMIT_MODEL || null;
    let model = resolveModel({
      provider,
      modelFromArgs,
      storedConfig,
    });

    if (provider === "ollama" && !modelFromArgs) {
      const configMatches = storedConfig?.provider === "ollama" && storedConfig?.model;
      if (!configMatches) {
        model = await promptRuntimeModel({
          provider,
          defaultModel: DEFAULT_OLLAMA_MODEL,
          rl,
          host: ollamaHost,
          providerRegistry,
          ui,
        });
      }
    }

    let maxDiffChars = Number.parseInt(
      args.get("max-diff-chars") || env.AI_COMMIT_MAX_DIFF_CHARS || storedConfig?.maxDiffChars || DEFAULT_MAX_DIFF_CHARS,
      10
    );
    if (Number.isNaN(maxDiffChars) || maxDiffChars <= 0) {
      maxDiffChars = DEFAULT_MAX_DIFF_CHARS;
    }

    const promptAppend =
      args.get("prompt-append") || args.get("append") || storedConfig?.promptAppend || "";

    const prBase = args.get("pr");

    let customInstructions = "";
    if (storedConfig?.useClaudeMd) {
      const repoRoot = git.getRepoRoot();
      const claudePath = `${repoRoot}/claude.md`;
      try {
        const claudeContent = await files.readTextFile(claudePath);
        if (claudeContent && claudeContent.trim()) {
          customInstructions = claudeContent.trim();
        } else {
          ui.writeLine("⚠️ claude.md not found or empty. Using default prompts.");
        }
      } catch (error) {
        ui.writeLine(`⚠️ ${error.message} Using default prompts.`);
      }
    }

    const diffModeFromArgs = args.get("staged")
      ? "staged"
      : args.get("all")
      ? "all"
      : null;
    const diffMode = diffModeFromArgs || storedConfig?.diffMode || "auto";

    if (prBase) {
      const currentBranch = git.getCurrentBranch();
      let commits;
      try {
        commits = git.getCommitsSince(prBase, currentBranch);
      } catch {
        ui.writeLine(
          colorize(
            `❌ Branch "${prBase}" not found locally or on the remote.`,
            colors.red
          )
        );
        ui.writeLine(
          colorize(`   Run: git fetch && committer --pr ${prBase}`, colors.dim)
        );
        return 1;
      }
      if (!commits.trim()) {
        ui.writeLine("🟡 No commits found for PR generation.");
        return 0;
      }

      const remoteUrl = git.getRemoteUrl();
      const platform = detectPlatform(remoteUrl);
      const MAX_PR_RETRIES = 3;
      let pr = null;
      let currentAppend = "";

      while (true) {
        for (let attempt = 1; attempt <= MAX_PR_RETRIES; attempt++) {
          const spinnerMessages =
            attempt === 1
              ? [
                  "Analyzing commits...",
                  "Crafting title...",
                  "Writing description...",
                  "Almost there...",
                ]
              : [
                  `Retrying... (${attempt}/${MAX_PR_RETRIES})`,
                  "Rethinking structure...",
                  "Almost there...",
                ];

          const stop = createSpinner ? createSpinner(spinnerMessages) : () => {};

          try {
            pr = await ai.generatePullRequest({
              provider,
              model,
              host: ollamaHost,
              commits,
              baseBranch: prBase,
              customInstructions,
              appendText: currentAppend,
            });
            stop();
            break;
          } catch {
            stop();
            if (attempt < MAX_PR_RETRIES) {
              ui.writeLine(
                colorize(
                  "⚠️  Response wasn't structured correctly, retrying...",
                  colors.dim
                )
              );
            } else {
              ui.writeLine(
                colorize(
                  "❌ Failed to generate a valid PR after multiple attempts.",
                  colors.red
                )
              );
              return 0;
            }
          }
        }

        ui.writeLine("");
        ui.writeLine(colorize("✨ Suggested PR:", colors.bold));
        ui.writeLine(colorize(SEPARATOR, colors.dim));
        ui.writeLine(renderPr(pr, colorize, colors));
        ui.writeLine(colorize(SEPARATOR, colors.dim));

        const promptLine = platform
          ? `Use (y) to create PR on ${platform.name}, (c) to copy, (n) to abort, (r) to regenerate: `
          : "Use (c) to copy, (n) to abort, (r) to regenerate: ";

        let regenerate = false;
        while (true) {
          const answer = await rl.question(promptLine);
          const choice = answer.trim().toLowerCase();

          if (choice === "n") {
            ui.writeLine(colorize("🛑 PR aborted.", colors.red));
            return EXIT_USER_ABORT;
          }

          if (choice === "c") {
            const content = `${pr.title}\n\n${pr.description}`;
            const copied = copyToClipboard(content);
            ui.writeLine(
              copied
                ? colorize("📋 PR message copied to clipboard.", colors.green)
                : colorize("❌ Could not copy — no clipboard tool found.", colors.red)
            );
            continue;
          }

          if (choice === "r") {
            const instruction = await rl.question(
              colorize("Add instructions for the AI (or press Enter to skip): ", colors.dim)
            );
            if (instruction.trim()) currentAppend = instruction.trim();
            ui.writeLine("🔁 Regenerating PR...");
            regenerate = true;
            break;
          }

          if (choice === "y" && platform) {
            if (!platform.isCliInstalled()) {
              ui.writeLine(
                colorize(`⚠️  ${platform.cliName} CLI is not installed.`, colors.dim)
              );
              const installAnswer = await rl.question(
                `Install ${platform.cliName} now? (y/n): `
              );
              if (installAnswer.trim().toLowerCase() === "y") {
                ui.writeLine(`Installing ${platform.cliName}...`);
                try {
                  platform.installCli();
                  ui.writeLine(
                    colorize(`✅ ${platform.cliName} installed.`, colors.green)
                  );
                } catch (err) {
                  ui.writeLine(colorize(`❌ Install failed: ${err.message}`, colors.red));
                  return 0;
                }
              } else {
                ui.writeLine(
                  `Install ${platform.cliName} manually and re-run to create the PR.`
                );
                return 0;
              }
            }

            ui.writeLine(colorize("Creating PR...", colors.dim));
            const { ok, url } = platform.createPr({
              title: pr.title,
              description: pr.description,
              baseBranch: git.stripRemotePrefix(prBase),
            });
            if (ok) {
              ui.writeLine("");
              ui.writeLine(colorize("✅ PR created successfully!", colors.green));
              if (url) ui.writeLine(colorize(`🔗 ${url}`, colors.bold));
            } else {
              ui.writeLine(colorize("❌ PR creation failed.", colors.red));
            }
            return 0;
          }

          ui.writeLine(
            platform
              ? "Please enter y, c, n, or r."
              : "Please enter c, n, or r."
          );
        }

        if (!regenerate) break;
      }
    }

    if (shouldAddAll) {
      ui.writeLine(colorize("📦 Staging all changes (git add .)...", colors.dim));
      git.stageAll();
    }

    const diff = git.getDiff(diffMode);
    if (!diff.trim()) {
      ui.writeLine("🟡 No changes detected in git diff.");
      return 0;
    }

    const { diff: trimmedDiff, truncated } = git.truncateDiff(diff, maxDiffChars);
    let message = "";
    let currentAppend = promptAppend;

    while (true) {
      const stop = createSpinner ? createSpinner("Loading commit message") : () => {};
      let spinnerStopped = false;
      let headerPrinted = false;
      let streamed = false;

      const stopSpinner = () => {
        if (spinnerStopped) return;
        spinnerStopped = true;
        stop();
      };

      const startOutput = () => {
        if (headerPrinted) return;
        stopSpinner();
        ui.writeLine("");
        ui.writeLine(colorize("✨ Suggested commit message:", colors.bold));
        ui.writeLine(colorize(SEPARATOR, colors.dim));
        headerPrinted = true;
      };

      message = await ai.generateCommitMessage({
        provider,
        model,
        diff: trimmedDiff,
        truncated,
        host: ollamaHost,
        promptAppend: currentAppend,
        customInstructions,
        stream: true,
        onToken: (chunk) => {
          streamed = true;
          startOutput();
          ui.write(chunk);
        },
      });

      stopSpinner();
      if (!headerPrinted) {
        startOutput();
      }

      if (!streamed && message) {
        ui.writeLine(message);
      }

      ui.writeLine("");
      ui.writeLine(colorize(SEPARATOR, colors.dim));

      if (!message) {
        ui.writeLine(colorize("⚠️ AI response was empty. Regenerating...", colors.yellow));
        continue;
      }

      const answer = await rl.question(
        "Use (y) to commit, (n) to abort, (r) to regenerate: "
      );
      const choice = answer.trim().toLowerCase();

      if (choice === "y") {
        ui.writeLine(colorize("✅ Committing...", colors.green));
        const status = await git.commitWithMessage(message);
        return status;
      }

      if (choice === "n") {
        ui.writeLine(colorize("🛑 Commit aborted.", colors.red));
        return EXIT_USER_ABORT;
      }

      if (choice === "r") {
        const instruction = await rl.question(
          colorize("Add instructions for the AI (or press Enter to skip): ", colors.dim)
        );
        if (instruction.trim()) {
          currentAppend = instruction.trim();
        }
        ui.writeLine("🔁 Regenerating commit message...");
        continue;
      }

      ui.writeLine("Please enter y, n, or r.");
    }
  } finally {
    if (typeof rl.close === "function") {
      rl.close();
    }
  }
}
