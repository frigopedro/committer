import { cleanCommitMessage, extractPrJson } from "./text.js";
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
    baseBranch,
    customInstructions,
    appendText,
}) {
    const providerClient = createProvider(provider, { model, host });
    const system = providerClient.buildSystemPrompt();
    const user = providerClient.buildPullRequestPrompt({
        commits,
        baseBranch,
        customInstructions,
        appendText,
    });

    const raw = await providerClient.generate({ system, user });
    return extractPrJson(raw);
}
