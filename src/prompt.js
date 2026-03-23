import { COMMIT_TYPES } from "./constants.js";

export function buildPrompt(diff, { truncated }) {
  const types = COMMIT_TYPES.join(", ");
  return [
    "You generate conventional commit messages.",
    "Return JSON only, no extra text.",
    "JSON schema:",
    '{"subject":"...","body":"...","footer":"..."}',
    "Subject format: <type>(optional-scope)!: <description> (use ! only for breaking changes)",
    "Body and footer are REQUIRED.",
    `Allowed types: ${types}.`,
    "Use imperative mood, lower-case description, no trailing period.",
    "Keep the subject under 72 characters.",
    "Do not use emojis.",
    "Footer must use git trailer format, e.g. 'Refs: N/A' or 'BREAKING CHANGE: ...'.",
    "If no references are available, use 'Refs: N/A'.",
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
    const footer = parsed?.footer?.trim();

    if (!subject || !body || !footer) return "";
    return `${subject}\n\n${body}\n\n${footer}`.trim();
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        const subject = parsed?.subject?.trim();
        const body = parsed?.body?.trim();
        const footer = parsed?.footer?.trim();

        if (!subject || !body || !footer) return "";
        return `${subject}\n\n${body}\n\n${footer}`.trim();
      } catch {
        return "";
      }
    }
    return "";
  }
}
