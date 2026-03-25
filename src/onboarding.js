import {
    CONFIG_VERSION,
    DEFAULT_CLAUDE_MODEL,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_MAX_DIFF_CHARS,
} from "./constants.js";
import { promptNumber, promptSelect, writeLine } from "./ui.js";
import { writeConfig } from "./config.js";
import { getProviderClass } from "./providers/registry.js";

async function selectProviderModel({ provider, defaultModel, rl, host }) {
    const Provider = getProviderClass(provider);
    if (!Provider || typeof Provider.listModels !== "function") {
        return defaultModel;
    }

    let models = [];
    try {
        models = await Provider.listModels({ host });
    } catch (error) {
        writeLine(`⚠️ ${provider} model selection failed: ${error.message}`);
        writeLine(`↩️ Falling back to ${defaultModel}.`);
        return defaultModel;
    }

    if (!models.length) {
        return defaultModel;
    }

    const defaultIndex = Math.max(
        0,
        models.findIndex((model) => model === defaultModel)
    );

    const label = `Available ${provider} models:`;
    writeLine(`\n🧠 ${label}`);
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
        model = await selectProviderModel({
            provider,
            defaultModel: DEFAULT_OLLAMA_MODEL,
            rl,
            host: ollamaHost,
        });
    }

    if (provider === "openai") {
        model = DEFAULT_OPENAI_MODEL;
    }

    if (provider === "claude") {
        model = await selectProviderModel({
            provider,
            defaultModel: DEFAULT_CLAUDE_MODEL,
            rl,
            host: ollamaHost,
        });
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

  const useClaudeMd =
    (await promptSelect({
      rl,
      question: "Use claude.md instructions if present?",
      defaultValue: "no",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    })) === "yes";

  const config = {
    version: CONFIG_VERSION,
    provider,
    model,
    diffMode,
    maxDiffChars,
    useClaudeMd,
  };

    await writeConfig(configPath, config);
    writeLine(`✅ Saved config to ${configPath}.`);
    return config;
}
