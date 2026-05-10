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

  buildCustomPrompt(instructions, { diff, truncated, appendText }) {
    return [
      instructions?.trim() || "",
      appendText?.trim() || "",
      truncated ? "The diff is truncated. Only describe visible changes." : "",
      `<diff>\n${diff}\n</diff>`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  buildSystemPrompt() {
    throw new Error("Provider buildSystemPrompt() not implemented.");
  }

  buildPrompt() {
    throw new Error("Provider buildPrompt() not implemented.");
  }

  buildPullRequestPrompt() {
    throw new Error("Provider buildPullRequestPrompt() not implemented.");
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
