#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { parseArgs } from "./src/args.js";
import {
    DEFAULT_CLAUDE_MODEL,
    DEFAULT_MAX_DIFF_CHARS,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_PROVIDER,
    EXIT_USER_ABORT,
} from "./src/constants.js";
import { getConfigPath, readConfig } from "./src/config.js";
import { generateCommitMessage } from "./src/ai.js";
import { runOnboarding } from "./src/onboarding.js";
import { colorize, colors, write, writeLine } from "./src/ui.js";
import { getProviderClass } from "./src/providers/registry.js";
import { GitClient } from "./src/git-client.js";

const PROVIDERS = ["claude", "ollama", "openai"];
const SEPARATOR = "-".repeat(64);
const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function startSpinner(text) {
    let frame = 0;
    const label = colorize(text, colors.dim);
    const icon = colorize(SPINNER_FRAMES[frame], colors.dim);
    output.write(`${label} ${icon}`);
    const timer = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        const icon = colorize(SPINNER_FRAMES[frame], colors.dim);
        output.write(`\r${label} ${icon}`);
    }, 120);

    return () => {
        clearInterval(timer);
        output.write(`\r${" ".repeat(text.length + 2)}\r`);
    };
}

async function promptRuntimeModel({ provider, defaultModel, rl, host }) {
    const Provider = getProviderClass(provider);
    if (!Provider || typeof Provider.listModels !== "function") {
        return defaultModel;
    }

    let models = [];
    try {
        models = await Provider.listModels({ host });
    } catch (error) {
        writeLine(`⚠️ ${provider} model selection failed: ${error.message}`);
        writeLine(`↩️ Falling back to ${defaultModel}.`);
        return defaultModel;
    }

    if (!models.length) {
        return defaultModel;
    }

    const defaultIndex = Math.max(
        0,
        models.findIndex((model) => model === defaultModel)
    );

    writeLine(`\n🧠 Available ${provider} models:`);
    models.forEach((model, index) => {
        const marker = index === defaultIndex ? " (default)" : "";
        writeLine(`${index + 1}) ${model}${marker}`);
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

    writeLine("Invalid selection. Using default model.");
    return models[defaultIndex];
}

function normalizeProvider(provider) {
    if (provider === "chatgpt") return "openai";
    return provider;
}

function printHelp() {
    const lines = [
        "committer - generate conventional commit messages with AI",
        "",
        "Usage:",
        "  committer [--provider claude|ollama|openai] [--model name] [--staged] [--all]",
        "",
        "Options:",
        "  --provider            AI provider (default: claude)",
        "  --model               Override model name",
        "  --staged              Use staged diff only",
        "  --all                 Combine staged + unstaged diff",
        "  --max-diff-chars       Trim diff to this many chars (default: 12000)",
        "  --prompt-append        Extra instructions appended to the prompt",
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

    writeLine(lines.join("\n"));
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

async function main() {
    const git = new GitClient();
    const args = parseArgs(process.argv.slice(2));
    const shouldAddAll = process.argv.slice(2).includes(".");
    if (args.has("help")) {
        printHelp();
        process.exit(0);
    }

    let hasRepo = true;
    try {
        git.ensureRepo();
    } catch (error) {
        hasRepo = false;
        if (!args.has("init")) {
            writeLine(`❌ ${error.message}`);
            process.exit(1);
        }
    }

    const configPath = getConfigPath();
    const ollamaHost = process.env.AI_COMMIT_OLLAMA_HOST || "http://localhost:11434";
    const rl = createInterface({ input, output });

    let storedConfig = null;
    try {
        storedConfig = await readConfig(configPath);
    } catch (error) {
        writeLine(`⚠️ ${error.message}`);
    }

    if (!storedConfig || args.has("init")) {
        storedConfig = await runOnboarding({ rl, configPath, ollamaHost });
        if (!hasRepo) {
            rl.close();
            process.exit(0);
        }
    }

    const providerInput =
        args.get("provider") ||
        process.env.AI_COMMIT_PROVIDER ||
        storedConfig?.provider ||
        DEFAULT_PROVIDER;
    const provider = normalizeProvider(providerInput);

    if (!PROVIDERS.includes(provider)) {
        writeLine("❌ Provider must be claude, openai, or ollama.");
        process.exit(1);
    }

    const modelFromArgs = args.get("model") || process.env.AI_COMMIT_MODEL || null;
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
            });
        }
    }

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

    const promptAppend =
        args.get("prompt-append") || args.get("append") || storedConfig?.promptAppend || "";

    const diffModeFromArgs = args.get("staged")
        ? "staged"
        : args.get("all")
            ? "all"
            : null;
    const diffMode = diffModeFromArgs || storedConfig?.diffMode || "auto";

    if (shouldAddAll) {
        writeLine(colorize("📦 Staging all changes (git add .)...", colors.dim));
        git.runGit("add .");
    }

    const diff = git.getDiff(diffMode);
    if (!diff.trim()) {
        writeLine("🟡 No changes detected in git diff.");
        rl.close();
        process.exit(0);
    }

    const { diff: trimmedDiff, truncated } = git.truncateDiff(diff, maxDiffChars);
    let message = "";

    try {
        while (true) {
            const stop = startSpinner("Loading commit message");
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
                writeLine("");
                writeLine(colorize("✨ Suggested commit message:", colors.bold));
                writeLine(colorize(SEPARATOR, colors.dim));
                headerPrinted = true;
            };

            message = await generateCommitMessage({
                provider,
                model,
                diff: trimmedDiff,
                truncated,
                host: ollamaHost,
                promptAppend,
                stream: true,
                onToken: (chunk) => {
                    streamed = true;
                    startOutput();
                    write(chunk);
                },
            });

            stopSpinner();
            if (!headerPrinted) {
                startOutput();
            }

            if (!streamed && message) {
                writeLine(message);
            }

            writeLine("");
            writeLine(colorize(SEPARATOR, colors.dim));

            if (!message) {
                writeLine(colorize("⚠️ AI response was empty. Regenerating...", colors.yellow));
                continue;
            }

            const answer = await rl.question(
                "Use (y) to commit, (n) to abort, (r) to regenerate: "
            );
            const choice = answer.trim().toLowerCase();

            if (choice === "y") {
                writeLine(colorize("✅ Committing...", colors.green));
                const status = await git.commitWithMessage(message);
                process.exit(status);
            }

            if (choice === "n") {
                writeLine(colorize("🛑 Commit aborted.", colors.red));
                process.exit(EXIT_USER_ABORT);
            }

            if (choice === "r") {
                writeLine("🔁 Regenerating commit message...");
                continue;
            }

            writeLine("Please enter y, n, or r.");
        }
    } catch (error) {
        writeLine(`❌ Error: ${error.message}`);
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();
