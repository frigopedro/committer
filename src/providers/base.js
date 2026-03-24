export class BaseProvider {
  constructor({ model, host }) {
    this.model = model;
    this.host = host;
  }

  get name() {
    return "base";
  }

  get supportsStreaming() {
    return false;
  }

  appendPrompt(prompt, appendText) {
    const extra = (appendText ?? "").trim();
    if (!extra) return prompt;
    return `${prompt}\n\nAdditional instructions:\n${extra}`;
  }

  buildSystemPrompt() {
    throw new Error("Provider buildSystemPrompt() not implemented.");
  }

  buildPrompt() {
    throw new Error("Provider buildPrompt() not implemented.");
  }

  async generate() {
    throw new Error("Provider generate() not implemented.");
  }

  async stream() {
    throw new Error("Provider stream() not implemented.");
  }

  static async listModels() {
    return [];
  }
}
