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
import { ensureGitRepo, getDiff } from "./src/git.js";
import { truncateDiff } from "./src/diff.js";
import { generateCommitMessage } from "./src/ai.js";
import { runOnboarding } from "./src/onboarding.js";
import { selectOllamaModel } from "./src/ollama.js";
import { write, writeLine } from "./src/ui.js";
import { commitWithMessage } from "./src/commit.js";

const PROVIDERS = ["claude", "ollama", "openai"];

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
    const args = parseArgs(process.argv.slice(2));
    if (args.has("help")) {
        printHelp();
        process.exit(0);
    }

    let hasRepo = true;
    try {
        ensureGitRepo();
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
            try {
                model = await selectOllamaModel({ host: ollamaHost, rl });
            } catch (error) {
                writeLine(`⚠️ Ollama model selection failed: ${error.message}`);
                writeLine(`↩️ Falling back to ${DEFAULT_OLLAMA_MODEL}.`);
                model = DEFAULT_OLLAMA_MODEL;
            }
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

    const diffModeFromArgs = args.get("staged")
        ? "staged"
        : args.get("all")
            ? "all"
            : null;
    const diffMode = diffModeFromArgs || storedConfig?.diffMode || "auto";

    const diff = getDiff(diffMode);
    if (!diff.trim()) {
        writeLine("🟡 No changes detected in git diff.");
        rl.close();
        process.exit(0);
    }

    const { diff: trimmedDiff, truncated } = truncateDiff(diff, maxDiffChars);
    let message = "";

    try {
        while (true) {
            writeLine("⏳ Loading commit message...");
            writeLine("\n✨ Suggested commit message:");
            let streamed = false;
            message = await generateCommitMessage({
                provider,
                model,
                diff: trimmedDiff,
                truncated,
                host: ollamaHost,
                stream: true,
                onToken: (chunk) => {
                    streamed = true;
                    write(chunk);
                },
            });

            if (!streamed && message) {
                writeLine(message);
            }

            writeLine("");

            if (!message) {
                writeLine("⚠️ AI response was empty. Regenerating...");
                continue;
            }

            const answer = await rl.question(
                "Use (y) to commit, (n) to abort, (r) to regenerate: "
            );
            const choice = answer.trim().toLowerCase();

            if (choice === "y") {
                writeLine("✅ Committing...");
                const status = await commitWithMessage(message);
                process.exit(status);
            }

            if (choice === "n") {
                writeLine("🛑 Commit aborted.");
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
