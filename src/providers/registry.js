import { ClaudeProvider } from "./claude.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

const PROVIDERS = {
  claude: ClaudeProvider,
  openai: OpenAIProvider,
  ollama: OllamaProvider,
};

export function getProviderClass(name) {
  const key = (name ?? "").toLowerCase();
  return PROVIDERS[key];
}

export function createProvider(name, options) {
  const key = (name ?? "").toLowerCase();
  const Provider = PROVIDERS[key];
  if (!Provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return new Provider(options);
}
