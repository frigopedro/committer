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

  applyUserRequest(prompt, appendText, anchor = "Diff:") {
    const extra = (appendText ?? "").trim();
    if (!extra) return prompt;

    const insertBlock = [
      "User request:",
      extra,
      "Ensure the commit message reflects this request.",
      "",
    ].join("\n");

    const index = prompt.lastIndexOf(anchor);
    if (index === -1) {
      return `${prompt}\n\n${insertBlock}`;
    }

    return `${prompt.slice(0, index)}${insertBlock}${prompt.slice(index)}`;
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
