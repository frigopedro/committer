import { cleanCommitMessage } from "./text.js";
import { createProvider } from "./providers/registry.js";

export async function generateCommitMessage({
    provider,
    model,
    diff,
    truncated,
    host,
    promptAppend,
    stream = false,
    onToken,
}) {
    const providerClient = createProvider(provider, { model, host });
    const system = providerClient.buildSystemPrompt();
    const user = providerClient.buildPrompt(diff, {
        truncated,
        appendText: promptAppend,
    });

    let raw = "";

    if (stream && typeof onToken === "function" && providerClient.supportsStreaming) {
        raw = await providerClient.stream({ system, user, onToken });
        return cleanCommitMessage(raw);
    }

    raw = await providerClient.generate({ system, user });
    return cleanCommitMessage(raw);
}
