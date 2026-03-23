import { COMMIT_TYPES } from "./constants.js";

export function buildPrompt(diff, { truncated }) {
  const types = COMMIT_TYPES.join(", ");
  return [
    "You generate conventional commit messages.",
    "Output exactly one line.",
    "Format: <type>(optional-scope): <description>",
    `Allowed types: ${types}.`,
    "Use imperative mood, lower-case description, no trailing period.",
    "Keep it under 72 characters.",
    "Do not use emojis.",
    "Do not wrap in quotes or code fences.",
    truncated ? "The diff was truncated." : "",
    "",
    "Diff:",
    diff,
  ]
    .filter(Boolean)
    .join("\n");
}

export function cleanCommitMessage(message) {
  let cleaned = message.trim();
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "");
  cleaned = cleaned.replace(/^commit message:\s*/i, "");
  cleaned = cleaned.replace(/^"|"$/g, "");
  cleaned = cleaned.replace(/^'|'$/g, "");
  if (cleaned.includes("\n")) {
    cleaned = cleaned.split("\n")[0].trim();
  }
  return cleaned.trim();
}
