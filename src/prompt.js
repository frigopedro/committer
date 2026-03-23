import { COMMIT_TYPES } from "./constants.js";

export function buildPrompt(diff, { truncated }) {
  const types = COMMIT_TYPES.join(", ");
  return [
    "Write a professional git commit message based on the diff below.",
    "Return JSON ONLY, no extra text.",
    "JSON schema:",
    '{"subject":"...","body":"..."}',
    "Do not preface the commit with anything.",
    "Use the conventional commits specification:",
    "Subject format: <type>(optional-scope)!: <description> (use ! only for breaking changes).",
    "Body is REQUIRED.",
    `Allowed types: ${types}.`,
    "Use imperative mood, lower-case description, no trailing period.",
    "Keep the subject under 72 characters.",
    "Do not use emojis.",
    "Body should be a concise, multi-sentence summary covering most changed files.",
    "Do not include a footer.",
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
  cleaned = cleaned.replace(/\r\n/g, "\n");
  return cleaned.trim();
}

export function parseCommitMessage(raw) {
  const cleaned = cleanCommitMessage(raw);
  try {
    const parsed = JSON.parse(cleaned);
    const subject = parsed?.subject?.trim();
    const body = parsed?.body?.trim();
    if (!subject || !body) return "";
    return `${subject}\n\n${body}`.trim();
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        const subject = parsed?.subject?.trim();
        const body = parsed?.body?.trim();
        if (!subject || !body) return "";
        return `${subject}\n\n${body}`.trim();
      } catch {
        return "";
      }
    }
    return "";
  }
}
