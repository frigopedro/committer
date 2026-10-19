#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { parseArgs } from "./src/args.js";
import { runApp } from "./src/app.js";
import { generateBranchName, generateCommitMessage, generatePullRequest } from "./src/ai.js";
import { runOnboarding } from "./src/onboarding.js";
import { colorize, colors, write, writeError, writeLine } from "./src/ui.js";
import { getProviderClass } from "./src/providers/registry.js";
import { GitClient } from "./src/git-client.js";
import { getConfigPath, readConfig } from "./src/config.js";
import { readTextFile } from "./src/files.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// textOrMessages: string or string[] — if array, cycles through messages every 2.5s
function createSpinner(textOrMessages) {
    const messages = Array.isArray(textOrMessages) ? textOrMessages : [textOrMessages];
    let frame = 0;
    let msgIndex = 0;
    let lastLineLen = 0;

    const render = () => {
        const spinner = colorize(SPINNER_FRAMES[frame], colors.dim);
        const label = colorize(messages[msgIndex], colors.dim);
        const line = `${spinner} ${label}`;
        const padding = " ".repeat(Math.max(0, lastLineLen - line.length));
        output.write(`\r${line}${padding}`);
        lastLineLen = line.length;
    };

    render();

    const frameTimer = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        render();
    }, 80);

    const msgTimer =
        messages.length > 1
            ? setInterval(() => {
                  msgIndex = (msgIndex + 1) % messages.length;
                  render();
              }, 2500)
            : null;

    return () => {
        clearInterval(frameTimer);
        if (msgTimer) clearInterval(msgTimer);
        output.write(`\r${" ".repeat(lastLineLen)}\r`);
    };
}

// Safety net: in non-interactive mode no code path may block waiting on stdin
const nonInteractiveReadline = {
    question: async () => {
        throw new Error("Interactive prompt requested in --non-interactive mode.");
    },
    close: () => {},
};

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const nonInteractive = args.has("non-interactive") || args.has("json");
    const rl = nonInteractive ? nonInteractiveReadline : createInterface({ input, output });
    const git = new GitClient();

    const exitCode = await runApp({
        argv: process.argv.slice(2),
        args,
        env: process.env,
        ui: { write, writeLine, writeError, colorize, colors },
        git,
        ai: { generateBranchName, generateCommitMessage, generatePullRequest },
        config: { getConfigPath, readConfig, runOnboarding },
        providerRegistry: { getProviderClass },
        files: { readTextFile },
        rl,
        createSpinner,
    });

    process.exit(exitCode);
}

main();
