import { buildPrompt, buildSystemPrompt } from "./prompt.js";
import { callClaude } from "./providers/claude.js";
import { callOllama, streamOllama } from "./providers/ollama.js";
import { callOpenAI, streamOpenAI } from "./providers/openai.js";

export async function generateCommitMessage({
    provider,
    model,
    diff,
    truncated,
    host,
    stream = false,
    onToken,
}) {
    const system = buildSystemPrompt(provider);
    const user = buildPrompt(provider, diff, { truncated });

    let raw = "";

    if (stream && typeof onToken === "function") {
        if (provider === "ollama") {
            raw = await streamOllama({ system, user, model, host, onToken });
            return raw;
        }

        if (provider === "openai") {
            raw = await streamOpenAI({ system, user, model, onToken });
            return raw;
        }

        if (provider === "claude") {
            // Claude streaming is not enabled; fall back to non-stream.
        }
    }

    if (provider === "ollama") {
        raw = await callOllama({ system, user, model, host });
    } else if (provider === "openai") {
        raw = await callOpenAI({ system, user, model });
    } else {
        raw = await callClaude({ system, user, model });
    }

    return raw;
}
