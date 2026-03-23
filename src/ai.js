import { buildPrompt, cleanCommitMessage } from "./prompt.js";
import { callClaude } from "./providers/claude.js";
import { callOllama } from "./providers/ollama.js";
import { callOpenAI } from "./providers/openai.js";

export async function generateCommitMessage({
  provider,
  model,
  diff,
  truncated,
  host,
}) {
  const system =
    "You are a senior developer assistant that writes clear, conventional commit messages.";
  const user = buildPrompt(diff, { truncated });

  let raw = "";
  if (provider === "ollama") {
    raw = await callOllama({ system, user, model, host });
  } else if (provider === "openai") {
    raw = await callOpenAI({ system, user, model });
  } else {
    raw = await callClaude({ system, user, model });
  }

  return cleanCommitMessage(raw);
}
