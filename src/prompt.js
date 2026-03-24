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
        "Write a git commit message.",
        "",
        "ONLY output the commit message.",
        "NO explanations.",
        "NO summaries.",
        "NO bullet points.",
        "NO numbered lists.",
        "NO markdown.",
        "NO extra text.",
        "",
        "Format EXACTLY:",
        "<type>(optional-scope)!: <description>",
        "",
        "<body paragraph>",
        "",
        `Allowed types: ${types}.`,
        "Use conventional commits.",
        "Subject: imperative, lower-case, no period, max 72 chars.",
        "Body: 2-3 sentences.",
        "No footer.",
        "",
        truncated ? "Diff is truncated. Do not guess missing parts." : "",
        "",
        "BAD OUTPUT:",
        "The provided code appears to be...",
        "Here are some observations:",
        "1. Updated function...",
        "",
        "GOOD OUTPUT:",
        "feat(api): add structured json response handling",
        "",
        "Update API providers to support structured JSON responses and improve",
        "response parsing. Adjust request configuration to ensure consistent",
        "output formatting across providers.",
        "",
        "Now output ONLY the commit message.",
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

export function buildSystemPrompt(provider) {
    const base =
        "You are a senior developer assistant that writes clear, conventional commit messages.";
    const p = (provider ?? "").toLowerCase();

    if (p === "ollama" || p.includes("llama")) {
        return [
            base,
            "Follow instructions strictly.",
            "Return only the commit message.",
            "No markdown, no bullet lists, no numbering.",
            "Use exactly one blank line between subject and body.",
        ].join("\n");
    }

    return base;
}
