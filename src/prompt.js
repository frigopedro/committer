import { COMMIT_TYPES } from "./constants.js";

function buildCommonTypes() {
    return COMMIT_TYPES.join(", ");
}

function buildOpenAIPrompt(diff, { truncated, types }) {
    return [
        "Write a professional git commit message from this diff.",
        "Return only the commit message.",
        "No preface, no commentary, no markdown.",
        "",
        "Format:",
        "<type>(optional-scope)!: <description>",
        "",
        "<body paragraph>",
        "",
        `Allowed types: ${types}.`,
        "Use conventional commits.",
        "Use imperative mood.",
        "Use lower-case description.",
        "No trailing period in the subject.",
        "Subject under 72 characters.",
        "Body required, 2 to 4 sentences.",
        "No footer.",
        truncated ? "The diff is truncated. Only describe visible changes." : "",
        "",
        "Diff:",
        diff,
    ]
        .filter(Boolean)
        .join("\n");
}

function buildClaudePrompt(diff, { truncated, types }) {
    return [
        "You are writing a professional git commit message for a maintainer.",
        "Return only the commit message.",
        "",
        "Format:",
        "<type>(optional-scope)!: <description>",
        "",
        "<body paragraph>",
        "",
        `Allowed types: ${types}.`,
        "Use conventional commits.",
        "Use imperative mood.",
        "Use lower-case description.",
        "No trailing period in the subject.",
        "Subject under 72 characters.",
        "Body required, 2 to 4 sentences.",
        "No footer.",
        "Focus on the main intent of the change.",
        truncated ? "The diff is truncated. Only describe visible changes." : "",
        "",
        "Diff:",
        diff,
    ]
        .filter(Boolean)
        .join("\n");
}

function buildLlamaPrompt(diff, { truncated, types }) {
    return [
        "Write a git commit message from this diff.",
        "",
        "Only output the commit message.",
        "Do not explain the code.",
        "Do not summarize the code.",
        "Do not give observations.",
        "Do not give suggestions.",
        "Do not use markdown.",
        "Do not use bullet points.",
        "Do not use numbering.",
        "Do not use quotes.",
        "Do not add any text before the commit message.",
        "Do not add any text after the commit message.",
        "",
        "Required format:",
        "<type>(optional-scope)!: <description>",
        "",
        "<body paragraph>",
        "",
        `Allowed types: ${types}.`,
        "Use conventional commits.",
        "Use imperative mood.",
        "Use lower-case description.",
        "No trailing period in the subject.",
        "Keep the subject under 72 characters.",
        "Body is required.",
        "Body must be 2 to 4 sentences.",
        "No footer.",
        "Choose one main change only.",
        "Be specific.",
        "Do not invent details not visible in the diff.",
        truncated ? "The diff is truncated. Only describe visible changes." : "",
        "",
        "Bad output:",
        "The provided code appears to be...",
        "Here is a summary of the changes:",
        "1. Updated function...",
        "",
        "Good output:",
        "feat(openai): return structured json responses for commit generation",
        "",
        "Configure the OpenAI provider to request JSON object responses and tune",
        "generation settings for more consistent commit message output. Adjust",
        "temperature and token limits to improve reliability and keep responses focused.",
        "",
        "Diff:",
        diff,
    ]
        .filter(Boolean)
        .join("\n");
}

export function buildPrompt(provider, diff, { truncated }) {
    const types = buildCommonTypes();
    const p = (provider ?? "").toLowerCase();

    if (p === "claude") return buildClaudePrompt(diff, { truncated, types });
    if (p === "openai") return buildOpenAIPrompt(diff, { truncated, types });
    if (p === "ollama" || p.includes("llama")) {
        return buildLlamaPrompt(diff, { truncated, types });
    }

    return buildOpenAIPrompt(diff, { truncated, types });
}
