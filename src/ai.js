import { cleanBranchName, cleanCommitMessage, extractPrJson } from "./text.js";
import { createProvider } from "./providers/registry.js";

export async function generateCommitMessage({
    provider,
    model,
    diff,
    truncated,
    host,
    promptAppend,
    customInstructions,
    stream = false,
    onToken,
}) {
    const providerClient = createProvider(provider, { model, host });
    const system = providerClient.buildSystemPrompt();
    const user = providerClient.buildPrompt(diff, {
        truncated,
        appendText: promptAppend,
        customInstructions,
    });

    if (process.env.DEBUG_PROMPT) {
        console.error("\n--- SYSTEM ---\n" + system);
        console.error("\n--- USER ---\n" + user);
        console.error("\n--- END ---\n");
    }

    let raw = "";

    if (stream && typeof onToken === "function" && providerClient.supportsStreaming) {
        raw = await providerClient.stream({ system, user, onToken });
        return cleanCommitMessage(raw);
    }

    raw = await providerClient.generate({ system, user });
    return cleanCommitMessage(raw);
}

export async function generatePullRequest({
    provider,
    model,
    host,
    commits,
    diff,
    diffStat,
    truncated,
    baseBranch,
    customInstructions,
    appendText,
}) {
    const providerClient = createProvider(provider, { model, host });
    const system = providerClient.buildPullRequestSystemPrompt();
    const user = providerClient.buildPullRequestPrompt({
        commits,
        diff,
        diffStat,
        truncated,
        baseBranch,
        customInstructions,
        appendText,
    });

    if (process.env.DEBUG_PROMPT) {
        console.error("\n--- SYSTEM ---\n" + system);
        console.error("\n--- USER ---\n" + user);
        console.error("\n--- END ---\n");
    }

    const raw = await providerClient.generate({ system, user });
    return extractPrJson(raw);
}

export async function generateBranchName({
    provider,
    model,
    host,
    commits,
    diff,
    truncated,
    customInstructions,
    appendText,
}) {
    const providerClient = createProvider(provider, { model, host });
    const system = providerClient.buildBranchNameSystemPrompt();
    const user = providerClient.buildBranchNamePrompt({
        commits,
        diff,
        truncated,
        customInstructions,
        appendText,
    });

    if (process.env.DEBUG_PROMPT) {
        console.error("\n--- SYSTEM ---\n" + system);
        console.error("\n--- USER ---\n" + user);
        console.error("\n--- END ---\n");
    }

    const raw = await providerClient.generate({ system, user });
    return cleanBranchName(raw);
}
