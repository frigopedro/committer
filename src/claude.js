import { fetchClaudeModels } from "./providers/claude.js";
import { writeLine } from "./ui.js";
import { DEFAULT_CLAUDE_MODEL } from "./constants.js";

export async function selectClaudeModel({ rl }) {
  const models = await fetchClaudeModels();
  if (!models.length) {
    throw new Error("No Claude models returned by API.");
  }

  const defaultIndex = Math.max(
    0,
    models.findIndex((model) => model === DEFAULT_CLAUDE_MODEL)
  );

  writeLine("\n🧠 Available Claude models:");
  models.forEach((model, index) => {
    const marker = index === defaultIndex ? " (default)" : "";
    writeLine(`${index + 1}) ${model}${marker}`);
  });

  const answer = await rl.question(`Select model [${defaultIndex + 1}]: `);
  const trimmed = answer.trim();
  if (!trimmed) {
    return models[defaultIndex];
  }

  const asNumber = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= models.length) {
    return models[asNumber - 1];
  }

  if (models.includes(trimmed)) {
    return trimmed;
  }

  writeLine("Invalid selection. Using default model.");
  return models[defaultIndex];
}
