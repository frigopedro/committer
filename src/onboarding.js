import {
  CONFIG_VERSION,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_MAX_DIFF_CHARS,
} from "./constants.js";
import { promptNumber, promptSelect, writeLine } from "./ui.js";
import { selectOllamaModel } from "./ollama.js";
import { selectClaudeModel } from "./claude.js";
import { writeConfig } from "./config.js";

export async function runOnboarding({ rl, configPath, ollamaHost }) {
  writeLine("\n👋 Welcome to committer! Let's create a .committer config.");

  const provider = await promptSelect({
    rl,
    question: "Choose your AI provider:",
    defaultValue: "ollama",
    options: [
      { value: "ollama", label: "Ollama (local)" },
      { value: "openai", label: "ChatGPT (OpenAI API key required)" },
      { value: "claude", label: "Claude (API key required)" },
    ],
  });

  let model = DEFAULT_CLAUDE_MODEL;
  if (provider === "ollama") {
    model = DEFAULT_OLLAMA_MODEL;
    try {
      model = await selectOllamaModel({ host: ollamaHost, rl });
    } catch (error) {
      writeLine(`⚠️ Ollama model selection failed: ${error.message}`);
      writeLine(`↩️ Falling back to ${DEFAULT_OLLAMA_MODEL}.`);
    }
  }

  if (provider === "openai") {
    model = DEFAULT_OPENAI_MODEL;
  }

  if (provider === "claude") {
    try {
      model = await selectClaudeModel({ rl });
    } catch (error) {
      writeLine(`⚠️ Claude model selection failed: ${error.message}`);
      writeLine(`↩️ Falling back to ${DEFAULT_CLAUDE_MODEL}.`);
      model = DEFAULT_CLAUDE_MODEL;
    }
  }

  const diffMode = await promptSelect({
    rl,
    question: "Which diff should committer use?",
    defaultValue: "auto",
    options: [
      { value: "auto", label: "Auto (staged if any, else unstaged)" },
      { value: "staged", label: "Staged only" },
      { value: "all", label: "Staged + unstaged" },
    ],
  });

  const maxDiffChars = await promptNumber({
    rl,
    question: "Max diff characters to send",
    defaultValue: DEFAULT_MAX_DIFF_CHARS,
    min: 500,
  });

  const config = {
    version: CONFIG_VERSION,
    provider,
    model,
    diffMode,
    maxDiffChars,
  };

  await writeConfig(configPath, config);
  writeLine(`✅ Saved config to ${configPath}.`);
  return config;
}
