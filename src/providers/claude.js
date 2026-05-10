import { BaseProvider } from "./base.js";
import { COMMIT_TYPES } from "../constants.js";

export class ClaudeProvider extends BaseProvider {
  get name() {
    return "claude";
  }

  buildSystemPrompt() {
    return [
      "You are a senior developer assistant that writes clear, conventional commit messages.",
      "Write in a professional, concise tone.",
    ].join("\n");
  }

  buildPrompt(diff, { truncated, appendText, customInstructions }) {
    const types = COMMIT_TYPES.join(", ");
    if (customInstructions) {
      return this.buildCustomPrompt(customInstructions, { diff, truncated, appendText });
    }
    return [
      "You are writing a professional git commit message for a maintainer.",
      "Return only the commit message.",
      "",
      "Format:",
      "<type>(optional-scope)!: <description>",
      "",
      "<body paragraph>",
      "",
      `Allowed types: ${types}.`,
      "Use conventional commits.",
      "Use imperative mood.",
      "Use lower-case description.",
      "No trailing period in the subject.",
      "Subject under 72 characters.",
      "Body required, 2 to 4 sentences.",
      "No footer.",
      "Focus on the main intent of the change.",
      appendText?.trim() || "",
      truncated ? "The diff is truncated. Only describe visible changes." : "",
      "",
      "Diff:",
      diff,
    ]
      .filter(Boolean)
      .join("\n");
  }

  buildPullRequestPrompt({ commits, baseBranch, customInstructions }) {
    const instructionBlock = customInstructions
      ? `Project instructions:\n${customInstructions}\n\n`
      : "";

    return [
      "You are preparing a pull request.",
      "Return ONLY a valid JSON object. No extra text, no code fences, no commentary.",
      "",
      "The JSON must have exactly two keys:",
      '  "title"       — concise imperative title, lower-case, no trailing period, under 72 chars.',
      '  "description" — Markdown string with these three sections:',
      "    ## Summary",
      "    <1-2 sentences describing the overall purpose of this PR>",
      "",
      "    ## Changes",
      "    - <key change>",
      "",
      "    ## Impact",
      "    <Breaking changes, performance effects, or behavioral differences. Write 'No breaking changes.' if none.>",
      "",
      "Example output (do not copy literally):",
      '{"title":"feat: add user authentication","description":"## Summary\\nAdd JWT-based login and token refresh.\\n\\n## Changes\\n- Add POST /auth/login endpoint\\n- Add JWT middleware\\n\\n## Impact\\nNo breaking changes."}',
      "",
      instructionBlock,
      `Base branch: ${baseBranch}`,
      "Commits:",
      commits,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async generate({ system, user }) {
    const apiKey =
      process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "";
    if (!apiKey) {
      throw new Error(
        "Missing ANTHROPIC_API_KEY or CLAUDE_API_KEY for Claude provider."
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    return data?.content?.[0]?.text ?? "";
  }

  static async listModels() {
    const apiKey =
      process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "";
    if (!apiKey) {
      throw new Error(
        "Missing ANTHROPIC_API_KEY or CLAUDE_API_KEY for Claude provider."
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const models = (data?.data || []).map((model) => model?.id).filter(Boolean);
    return Array.from(new Set(models)).sort();
  }
}
