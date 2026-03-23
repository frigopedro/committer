import { COMMIT_TYPES } from "./constants.js";

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const SUBJECT_REGEX = new RegExp(
  `^(${COMMIT_TYPES.join("|")})(\\([^)]+\\))?(!)?:\\s.+$`
);

export function hasEmoji(text) {
  return EMOJI_REGEX.test(text);
}

export function validateCommitMessage(message) {
  const normalized = message.trim().replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  const subject = lines[0]?.trim();
  if (!subject) {
    return { valid: false, reason: "Missing subject line." };
  }

  if (!SUBJECT_REGEX.test(subject.toLowerCase())) {
    return {
      valid: false,
      reason: "Subject must follow conventional format like 'feat: add ...'.",
    };
  }

  if (lines.length < 4 || lines[1].trim() !== "") {
    return { valid: false, reason: "Body must start after a blank line." };
  }

  const bodyLines = lines.slice(2);
  const bodyHasContent = bodyLines.some((line) => line.trim().length > 0);
  if (!bodyHasContent) {
    return { valid: false, reason: "Body is required." };
  }

  return { valid: true };
}
