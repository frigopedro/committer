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
    "  committer [.] [--provider claude|ollama|openai] [--model name] [--staged] [--all]",
    "  committer [.] --pr <base-branch>",
    "  committer [.] [--pr <base-branch>] --non-interactive [--json]",
    "  committer [.] --branch [base] [--move] [--pr <base-branch>]",
    "",
    "Options:",
    "  .                     Stage all changes (git add .) before committing",
    "  --provider            AI provider (default: claude)",
    "  --model               Override model name",
    "  --staged              Use staged diff only",
    "  --all                 Combine staged + unstaged diff",
    "  --max-diff-chars       Trim diff to this many chars (default: 50000)",
    "  --prompt-append        Extra instructions appended to the prompt",
    "  --pr                  Generate PR title/description from commits and the branch diff",
    "                        (commits staged changes first when present or when . is given)",
    "  --branch [base]       Create and switch to an AI-named branch (type/short-slug) from the",
    "                        commits not in base (default: upstream) and uncommitted changes",
    "  --move                With --branch: reset the source branch to its upstream, moving",
    "                        the commits onto the new branch only",
    "  --non-interactive     No prompts: auto-commit, push and create the PR (for scripts/LLMs)",
    "  --json                Print a single JSON result object (implies --non-interactive)",
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

const MAX_RETRIES = 3;

// Prints the final result of a non-interactive run: plain text or a single JSON object on stdout
function emitResult(ctx, { status, branch, commit, pr, error, reason }) {
  const { ui, logError, json } = ctx;

  if (json) {
    const payload = {
      ok: status === 0,
      branch: branch ?? null,
      commit: commit ?? null,
      pr: pr ?? null,
    };
    if (error) payload.error = error;
    if (reason) payload.reason = reason;
    ui.writeLine(JSON.stringify(payload));
    return;
  }

  if (branch) {
    ui.writeLine(`branch ${branch.name}`);
    if (branch.moved) ui.writeLine(`moved ${branch.moved} commit(s) off ${branch.from}`);
    if (commit || pr) ui.writeLine("");
  }

  if (commit) {
    ui.writeLine(commit.message);
    ui.writeLine("");
    ui.writeLine(`committed ${commit.sha}`);
  }

  if (pr) {
    if (commit) ui.writeLine("");
    ui.writeLine(pr.title);
    ui.writeLine("");
    ui.writeLine(pr.description);
    ui.writeLine("");
    ui.writeLine(
      pr.created
        ? `PR: ${pr.url ?? "(created, URL unknown)"}`
        : `PR not created: ${error ?? reason}`
    );
  }

  if (error) logError(`❌ ${error}`);
}

async function runCommitFlow(ctx) {
  const { ui, git, ai, rl, log, colorize, colors, createSpinner, nonInteractive } = ctx;

  if (ctx.shouldAddAll) {
    log(colorize("📦 Staging all changes (git add .)...", colors.dim));
    git.stageAll();
  }

  const diff = git.getDiff(ctx.diffMode);
  if (!diff.trim()) {
    log("🟡 No changes detected in git diff.");
    return { status: 0, reason: "no changes" };
  }

  const { diff: trimmedDiff, truncated } = git.truncateDiff(diff, ctx.maxDiffChars);
  const generate = (promptAppend, streamOptions = {}) =>
    ai.generateCommitMessage({
      provider: ctx.provider,
      model: ctx.model,
      diff: trimmedDiff,
      truncated,
      host: ctx.ollamaHost,
      promptAppend,
      customInstructions: ctx.customInstructions,
      ...streamOptions,
    });

  if (nonInteractive) {
    log("Generating commit message...");
    let message = "";
    for (let attempt = 1; attempt <= MAX_RETRIES && !message; attempt++) {
      message = await generate(ctx.promptAppend);
      if (!message && attempt < MAX_RETRIES) log("⚠️ AI response was empty. Regenerating...");
    }
    if (!message) {
      return { status: 1, error: "AI returned an empty commit message." };
    }

    const status = await git.commitWithMessage(message, { silent: true });
    if (status !== 0) {
      return { status, error: "git commit failed." };
    }
    return { status: 0, commit: { sha: git.getHeadSha(), message } };
  }

  let message = "";
  let currentAppend = ctx.promptAppend;

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

    message = await generate(currentAppend, {
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
      return { status, commit: status === 0 ? { message } : null };
    }

    if (choice === "n") {
      ui.writeLine(colorize("🛑 Commit aborted.", colors.red));
      return { status: EXIT_USER_ABORT };
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
}

// Returns { pr } on success, or { error } with the last failure after MAX_RETRIES attempts
async function generatePrWithRetries(ctx, changeset, appendText) {
  const { ai, log, colorize, colors, createSpinner } = ctx;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const spinnerMessages =
      attempt === 1
        ? [
            "Analyzing changeset...",
            "Crafting title...",
            "Writing description...",
            "Almost there...",
          ]
        : [
            `Retrying... (${attempt}/${MAX_RETRIES})`,
            "Rethinking structure...",
            "Almost there...",
          ];

    const stop = createSpinner ? createSpinner(spinnerMessages) : () => {};

    try {
      const pr = await ai.generatePullRequest({
        provider: ctx.provider,
        model: ctx.model,
        host: ctx.ollamaHost,
        ...changeset,
        baseBranch: ctx.prBase,
        customInstructions: ctx.customInstructions,
        appendText,
      });
      stop();
      return { pr };
    } catch (error) {
      lastError = error;
      stop();
      if (attempt < MAX_RETRIES) {
        log(colorize(`⚠️  PR generation failed (${error.message}), retrying...`, colors.dim));
      }
    }
  }
  return { error: lastError };
}

async function runPrFlow(ctx) {
  const { ui, git, rl, log, colorize, colors, nonInteractive, prBase } = ctx;

  const currentBranch = git.getCurrentBranch();
  let commits;
  try {
    commits = git.getCommitsSince(prBase, currentBranch);
  } catch {
    const message = `Branch "${prBase}" not found locally or on the remote.`;
    if (nonInteractive) {
      return { status: 1, error: `${message} Run: git fetch` };
    }
    ui.writeLine(colorize(`❌ ${message}`, colors.red));
    ui.writeLine(colorize(`   Run: git fetch && committer --pr ${prBase}`, colors.dim));
    return { status: 1 };
  }
  if (!commits.trim()) {
    log("🟡 No commits found for PR generation.");
    return { status: 0, reason: "no commits" };
  }

  // The changeset gives the model what actually changed; commits only give intent
  const changeset = { commits, diff: "", diffStat: "", truncated: false };
  try {
    changeset.diffStat = git.getBranchDiffStat(prBase, currentBranch);
    const branchDiff = git.getBranchDiff(prBase, currentBranch);
    const { diff, truncated } = git.truncateDiff(branchDiff, ctx.maxDiffChars);
    changeset.diff = diff;
    changeset.truncated = truncated;
  } catch (error) {
    log(`⚠️ Could not read branch diff (${error.message}). Using commits only.`);
  }

  const platform = ctx.platforms.detectPlatform(git.getRemoteUrl());

  if (nonInteractive) {
    log("Generating pull request...");
    const { pr, error } = await generatePrWithRetries(ctx, changeset, ctx.promptAppend);
    if (!pr) {
      return { status: 1, error: `Failed to generate a valid PR after multiple attempts: ${error.message}` };
    }

    const result = { ...pr, base: prBase, created: false, url: null };
    if (!platform) {
      return {
        status: 0,
        pr: result,
        reason: "No supported platform (GitHub or Azure DevOps) detected for the origin remote.",
      };
    }
    if (!platform.isCliInstalled()) {
      return {
        status: 1,
        pr: result,
        error: `${platform.cliName} CLI is not installed. Install it to create PRs on ${platform.name}.`,
      };
    }

    try {
      const { pushed, branch } = git.pushCurrentBranch();
      if (pushed) log(`Pushed ${branch}.`);
    } catch (error) {
      return { status: 1, pr: result, error: `git push failed: ${error.message}` };
    }

    log(`Creating PR on ${platform.name}...`);
    const { ok, url } = platform.createPr({
      title: pr.title,
      description: pr.description,
      baseBranch: git.stripRemotePrefix(prBase),
      headBranch: currentBranch,
    });
    if (!ok) {
      return { status: 1, pr: result, error: "PR creation failed." };
    }
    return { status: 0, pr: { ...result, created: true, url } };
  }

  let currentAppend = "";

  while (true) {
    const { pr } = await generatePrWithRetries(ctx, changeset, currentAppend);
    if (!pr) {
      ui.writeLine(
        colorize("❌ Failed to generate a valid PR after multiple attempts.", colors.red)
      );
      return { status: 0 };
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
        return { status: EXIT_USER_ABORT };
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
              return { status: 0 };
            }
          } else {
            ui.writeLine(
              `Install ${platform.cliName} manually and re-run to create the PR.`
            );
            return { status: 0 };
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
        return { status: 0 };
      }

      ui.writeLine(
        platform
          ? "Please enter y, c, n, or r."
          : "Please enter c, n, or r."
      );
    }

    if (!regenerate) return { status: 0 };
  }
}

// Which commits are unique to the current work: explicit base, else the upstream, else origin/<current>.
// canMove marks bases that are the current branch's own remote, so resetting to them is safe.
function resolveBranchSource(ctx) {
  const { git } = ctx;
  const current = git.getCurrentBranch();

  if (typeof ctx.branchBase === "string") {
    return { current, base: ctx.branchBase, canMove: false };
  }

  const upstream = git.getUpstream();
  if (upstream) return { current, base: upstream, canMove: current !== "HEAD" };

  if (current !== "HEAD" && git.refExists(`origin/${current}`)) {
    return { current, base: `origin/${current}`, canMove: true };
  }
  return { current, base: null, canMove: false };
}

function uniqueBranchName(git, name) {
  let candidate = name;
  for (let n = 2; git.refExists(`refs/heads/${candidate}`); n++) {
    candidate = `${name}-${n}`;
  }
  return candidate;
}

// Returns { name } on success, or { error } with the last failure after MAX_RETRIES attempts
async function generateBranchNameWithRetries(ctx, work, appendText) {
  const { ai, git, log, colorize, colors, createSpinner } = ctx;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const stop = createSpinner
      ? createSpinner(attempt === 1 ? "Naming branch..." : `Retrying... (${attempt}/${MAX_RETRIES})`)
      : () => {};

    try {
      const name = await ai.generateBranchName({
        provider: ctx.provider,
        model: ctx.model,
        host: ctx.ollamaHost,
        ...work,
        customInstructions: ctx.customInstructions,
        appendText,
      });
      stop();
      if (!git.isValidBranchName(name)) {
        throw new Error(`"${name}" is not a valid branch name`);
      }
      return { name: uniqueBranchName(git, name) };
    } catch (error) {
      lastError = error;
      stop();
      if (attempt < MAX_RETRIES) {
        log(colorize(`⚠️  Branch naming failed (${error.message}), retrying...`, colors.dim));
      }
    }
  }
  return { error: lastError };
}

async function runBranchFlow(ctx) {
  const { ui, git, rl, log, colorize, colors, nonInteractive } = ctx;

  const source = resolveBranchSource(ctx);
  let commits = "";
  let count = 0;
  if (source.base) {
    try {
      commits = git.getCommitsSince(source.base, "HEAD");
      count = commits.trim() ? git.countCommits(source.base) : 0;
    } catch {
      const message = `Branch "${source.base}" not found locally or on the remote.`;
      if (nonInteractive) return { status: 1, error: message };
      ui.writeLine(colorize(`❌ ${message}`, colors.red));
      return { status: 1 };
    }
  }

  const rawDiff = git.getDiff(ctx.diffMode);
  const { diff, truncated } = rawDiff.trim()
    ? git.truncateDiff(rawDiff, ctx.maxDiffChars)
    : { diff: "", truncated: false };

  if (!commits.trim() && !diff) {
    const reason = source.base
      ? `No commits ahead of ${source.base} and no uncommitted changes to name a branch from.`
      : "No upstream to compare against and no uncommitted changes. Pass a base: --branch main";
    log(`🟡 ${reason}`);
    return { status: 0, reason };
  }

  const describeWork = [
    count ? `${count} commit(s) on ${source.current} not in ${source.base}` : "",
    diff ? "uncommitted changes" : "",
  ]
    .filter(Boolean)
    .join(" + ");

  const work = { commits, diff, truncated };
  let name = "";

  if (nonInteractive) {
    log(`Naming branch from ${describeWork}...`);
    const result = await generateBranchNameWithRetries(ctx, work, ctx.promptAppend);
    if (!result.name) {
      return { status: 1, error: `Failed to name the branch: ${result.error.message}` };
    }
    name = result.name;
  } else {
    let currentAppend = ctx.promptAppend;
    while (!name) {
      const result = await generateBranchNameWithRetries(ctx, work, currentAppend);
      if (!result.name) {
        ui.writeLine(colorize(`❌ Failed to name the branch: ${result.error.message}`, colors.red));
        return { status: 1 };
      }

      ui.writeLine("");
      ui.writeLine(`${colorize("🌿 Suggested branch:", colors.bold)} ${result.name}`);
      ui.writeLine(colorize(`   from ${describeWork}`, colors.dim));

      while (true) {
        const answer = await rl.question(
          "Use (y) to create, (e) to edit, (n) to abort, (r) to regenerate: "
        );
        const choice = answer.trim().toLowerCase();

        if (choice === "y") {
          name = result.name;
          break;
        }

        if (choice === "n") {
          ui.writeLine(colorize("🛑 Branch creation aborted.", colors.red));
          return { status: EXIT_USER_ABORT };
        }

        if (choice === "e") {
          const edited = (await rl.question("Branch name: ")).trim();
          if (!edited) continue;
          if (!git.isValidBranchName(edited)) {
            ui.writeLine(`"${edited}" is not a valid branch name.`);
            continue;
          }
          if (git.refExists(`refs/heads/${edited}`)) {
            ui.writeLine(`Branch "${edited}" already exists.`);
            continue;
          }
          name = edited;
          break;
        }

        if (choice === "r") {
          const instruction = await rl.question(
            colorize("Add instructions for the AI (or press Enter to skip): ", colors.dim)
          );
          if (instruction.trim()) currentAppend = instruction.trim();
          ui.writeLine("🔁 Regenerating branch name...");
          break;
        }

        ui.writeLine("Please enter y, e, n, or r.");
      }
    }
  }

  try {
    git.createBranch(name);
  } catch (error) {
    const message = `Could not create branch "${name}": ${error.message}`;
    if (nonInteractive) return { status: 1, error: message };
    ui.writeLine(colorize(`❌ ${message}`, colors.red));
    return { status: 1 };
  }
  log(colorize(`✅ Switched to new branch ${name}`, colors.green));

  // The commits now live on the new branch, so the source branch can be rewound to its remote
  let moved = 0;
  if (source.canMove && count > 0) {
    let shouldMove = ctx.move;
    if (!shouldMove && !nonInteractive) {
      const answer = await rl.question(
        `Move these ${count} commit(s) off ${source.current} (reset it to ${source.base})? (y/N): `
      );
      shouldMove = answer.trim().toLowerCase() === "y";
    }
    if (shouldMove) {
      git.resetBranch(source.current, source.base);
      moved = count;
      log(colorize(`↩️  Reset ${source.current} to ${source.base}.`, colors.dim));
    }
  } else if (ctx.move) {
    log("⚠️ --move ignored: it only applies to commits ahead of the current branch's own remote.");
  }

  return {
    status: 0,
    branch: { name, from: source.current, base: source.base, commits: count, moved },
  };
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
  platforms = { detectPlatform },
}) {
  const json = args.has("json");
  const nonInteractive = json || args.has("non-interactive");
  const colorize = nonInteractive ? (text) => text : ui.colorize ?? ((text) => text);
  const colors = ui.colors ?? {};
  const logError = ui.writeError ?? ui.writeLine;
  // Progress and warnings; kept off stdout in non-interactive mode so the result stays parseable
  const log = nonInteractive ? logError : ui.writeLine;

  const ctx = {
    ui,
    git,
    ai,
    rl,
    log,
    logError,
    colorize,
    colors,
    json,
    nonInteractive,
    createSpinner: nonInteractive ? null : createSpinner,
    platforms,
    shouldAddAll: (argv ?? []).includes("."),
  };

  const finish = (result) => {
    if (nonInteractive) emitResult(ctx, result);
    return result.status;
  };

  const fail = (message) => {
    if (nonInteractive) return finish({ status: 1, error: message });
    ui.writeLine(`❌ ${message}`);
    return 1;
  };

  try {
    if (args.has("help")) {
      printHelp(ui);
      return 0;
    }

    if (nonInteractive && args.has("init")) {
      return fail("--init cannot be used with --non-interactive.");
    }

    let hasRepo = true;
    try {
      git.ensureRepo();
    } catch (error) {
      hasRepo = false;
      if (!args.has("init")) {
        return fail(error.message);
      }
    }

    const configPath = config.getConfigPath();
    const ollamaHost = env.AI_COMMIT_OLLAMA_HOST || "http://localhost:11434";

    let storedConfig = null;
    try {
      storedConfig = await config.readConfig(configPath);
    } catch (error) {
      log(`⚠️ ${error.message}`);
    }

    if (!storedConfig && nonInteractive) {
      log("ℹ️ No ~/.committer config found. Using environment and defaults.");
      storedConfig = {};
    } else if (!storedConfig || args.has("init")) {
      storedConfig = await config.runOnboarding({ rl, configPath, ollamaHost });
      if (!hasRepo) {
        return 0;
      }
    }

    const providerInput =
      args.get("provider") || env.AI_COMMIT_PROVIDER || storedConfig?.provider || DEFAULT_PROVIDER;
    const provider = normalizeProvider(providerInput);

    if (!PROVIDERS.includes(provider)) {
      return fail("Provider must be claude, openai, or ollama.");
    }

    const modelFromArgs = args.get("model") || env.AI_COMMIT_MODEL || null;
    let model = resolveModel({
      provider,
      modelFromArgs,
      storedConfig,
    });

    if (provider === "ollama" && !modelFromArgs && !nonInteractive) {
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
    if (prBase === true) {
      return fail("--pr requires a base branch, e.g. --pr main.");
    }

    let customInstructions = "";
    if (storedConfig?.useClaudeMd) {
      const repoRoot = git.getRepoRoot();
      const claudePath = `${repoRoot}/claude.md`;
      try {
        const claudeContent = await files.readTextFile(claudePath);
        if (claudeContent && claudeContent.trim()) {
          customInstructions = claudeContent.trim();
        } else {
          log("⚠️ claude.md not found or empty. Using default prompts.");
        }
      } catch (error) {
        log(`⚠️ ${error.message} Using default prompts.`);
      }
    }

    const diffModeFromArgs = args.get("staged")
      ? "staged"
      : args.get("all")
      ? "all"
      : null;
    const diffMode = diffModeFromArgs || storedConfig?.diffMode || "auto";

    Object.assign(ctx, {
      provider,
      model,
      ollamaHost,
      maxDiffChars,
      promptAppend,
      customInstructions,
      diffMode,
      prBase,
      branchBase: args.get("branch"),
      move: args.has("move"),
    });

    // Branch step runs first so a following commit/PR lands on the new branch
    let branch = null;
    if (ctx.branchBase) {
      const branchResult = await runBranchFlow(ctx);
      if (branchResult.status !== 0 || !branchResult.branch) return finish(branchResult);
      branch = branchResult.branch;
      if (!prBase && !ctx.shouldAddAll) return finish(branchResult);
    }

    if (prBase) {
      // Commit pending work first so the PR includes it
      let commitResult = null;
      if (ctx.shouldAddAll || git.hasStagedChanges()) {
        commitResult = await runCommitFlow(ctx);
        if (commitResult.status !== 0) return finish({ ...commitResult, branch });
      } else if (nonInteractive && git.hasUncommittedChanges()) {
        log("⚠️ Uncommitted changes are not part of the PR. Pass . to commit them first.");
      }

      const prResult = await runPrFlow(ctx);
      return finish({ ...prResult, branch, commit: commitResult?.commit ?? null });
    }

    return finish({ ...(await runCommitFlow(ctx)), branch });
  } catch (error) {
    if (nonInteractive) return finish({ status: 1, error: error.message });
    throw error;
  } finally {
    if (typeof rl.close === "function") {
      rl.close();
    }
  }
}
