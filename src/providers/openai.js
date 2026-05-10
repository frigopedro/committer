import { BaseProvider } from "./base.js";
import { COMMIT_TYPES } from "../constants.js";

export class OpenAIProvider extends BaseProvider {
    get name() {
        return "openai";
    }

    get supportsStreaming() {
        return true;
    }

    buildSystemPrompt() {
        return "You are a senior developer assistant that writes clear, conventional commit messages.";
    }

  buildPrompt(diff, { truncated, appendText, customInstructions }) {
    const types = COMMIT_TYPES.join(", ");
    if (customInstructions) {
      return this.buildCustomPrompt(customInstructions, { diff, truncated, appendText });
    }
    return [
      "Write a professional git commit message from this diff.",
      "Return only the commit message.",
      "No preface, no commentary, no markdown.",
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
      appendText?.trim() || "",
      truncated ? "The diff is truncated. Only describe visible changes." : "",
      "",
      "Diff:",
      diff,
    ]
      .filter(Boolean)
      .join("\n");
  }

  buildPullRequestPrompt({ commits, baseBranch, customInstructions, appendText }) {
    const instructionBlock = customInstructions
      ? `Project instructions:\n${customInstructions}`
      : "";

    return [
      "Write a pull request title and description.",
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
      appendText?.trim() || "",
      `Base branch: ${baseBranch}`,
      "Commits:",
      commits,
    ]
      .filter(Boolean)
      .join("\n");
  }

    async generate({ system, user }) {
        const apiKey = process.env.OPENAI_API_KEY || "";
        if (!apiKey) {
            throw new Error("Missing OPENAI_API_KEY for OpenAI provider.");
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                temperature: 0.2,
                max_tokens: 512,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OpenAI API error: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data?.choices?.[0]?.message?.content ?? "";
    }

    async stream({ system, user, onToken }) {
        const apiKey = process.env.OPENAI_API_KEY || "";
        if (!apiKey) {
            throw new Error("Missing OPENAI_API_KEY for OpenAI provider.");
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                temperature: 0.2,
                max_tokens: 512,
                stream: true,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OpenAI API error: ${response.status} ${text}`);
        }

        if (!response.body) {
            throw new Error("OpenAI API error: missing response body.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed === "data: [DONE]") {
                    break;
                }
                if (!trimmed.startsWith("data: ")) continue;

                try {
                    const payload = JSON.parse(trimmed.slice(6));
                    const content = payload?.choices?.[0]?.delta?.content ?? "";
                    if (content) {
                        full += content;
                        onToken(content);
                    }
                } catch {
                    continue;
                }
            }
        }

        return full;
    }

    static async listModels() {
        return [];
    }
}
