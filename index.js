#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { parseArgs } from "./src/args.js";
import { runApp } from "./src/app.js";
import { generateCommitMessage } from "./src/ai.js";
import { runOnboarding } from "./src/onboarding.js";
import { colorize, colors, write, writeLine } from "./src/ui.js";
import { getProviderClass } from "./src/providers/registry.js";
import { GitClient } from "./src/git-client.js";
import { getConfigPath, readConfig } from "./src/config.js";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function createSpinner(text) {
    let frame = 0;
    const label = colorize(text, colors.dim);
    const icon = colorize(SPINNER_FRAMES[frame], colors.dim);
    output.write(`${label} ${icon}`);
    const timer = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        const next = colorize(SPINNER_FRAMES[frame], colors.dim);
        output.write(`\r${label} ${next}`);
    }, 120);

    return () => {
        clearInterval(timer);
        output.write(`\r${" ".repeat(text.length + 2)}\r`);
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const rl = createInterface({ input, output });
    const git = new GitClient();

    const exitCode = await runApp({
        argv: process.argv.slice(2),
        args,
        env: process.env,
        ui: { write, writeLine, colorize, colors },
        git,
        ai: { generateCommitMessage },
        config: { getConfigPath, readConfig, runOnboarding },
        providerRegistry: { getProviderClass },
        rl,
        createSpinner,
    });

    process.exit(exitCode);
}

main();
