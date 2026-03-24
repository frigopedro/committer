import { BaseProvider } from "./base.js";
import { COMMIT_TYPES } from "../constants.js";

export class OllamaProvider extends BaseProvider {
    get name() {
        return "ollama";
    }

    get supportsStreaming() {
        return true;
    }

    buildSystemPrompt() {
        return [
            "You are a senior developer assistant that writes clear, conventional commit messages.",
            "Follow instructions strictly.",
            "Return only the commit message.",
            "No markdown, no bullet lists, no numbering.",
            "Use exactly one blank line between subject and body.",
        ].join("\n");
    }

  buildPrompt(diff, { truncated, appendText }) {
    const types = COMMIT_TYPES.join(", ");
    const prompt = [
      "Write a git commit message.",
            "",
            "ONLY output the commit message.",
            "NO explanations.",
            "NO summaries.",
            "NO bullet points.",
            "NO numbered lists.",
            "NO markdown.",
            "NO extra text.",
            "",
            "Format EXACTLY:",
            "<type>(optional-scope)!: <description>",
            "",
            "<body paragraph>",
            "",
            `Allowed types: ${types}.`,
            "Use conventional commits.",
            "Subject: imperative, lower-case, no period, max 72 chars.",
            "Body: 2-3 sentences.",
            "No footer.",
            "",
            truncated ? "Diff is truncated. Do not guess missing parts." : "",
            "",
            "BAD OUTPUT:",
            "The provided code appears to be...",
            "Here are some observations:",
            "1. Updated function...",
            "",
            "GOOD OUTPUT:",
            "feat(api): add structured json response handling",
            "",
            "Update API providers to support structured JSON responses and improve",
            "response parsing. Adjust request configuration to ensure consistent",
            "output formatting across providers.",
            "",
            "Now output ONLY the commit message.",
            "",
      "Diff:",
      diff,
    ]
      .filter(Boolean)
      .join("\n");
    return this.appendPrompt(prompt, appendText);
  }

    async generate({ system, user }) {
        const response = await fetch(`${this.host}/api/chat`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: this.model,
                stream: false,
                options: {
                    temperature: 0.1,
                    num_predict: 256,
                },
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama API error: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data?.message?.content ?? data?.response ?? "";
    }

    async stream({ system, user, onToken }) {
        const response = await fetch(`${this.host}/api/chat`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: this.model,
                stream: true,
                options: {
                    temperature: 0.1,
                    num_predict: 256,
                },
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama API error: ${response.status} ${text}`);
        }

        if (!response.body) {
            throw new Error("Ollama API error: missing response body.");
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
                try {
                    const payload = JSON.parse(trimmed);
                    const content = payload?.message?.content ?? payload?.response ?? "";
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

    static async listModels({ host }) {
        const response = await fetch(`${host}/api/tags`, {
            method: "GET",
            headers: {
                "content-type": "application/json",
            },
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama API error: ${response.status} ${text}`);
        }

        const data = await response.json();
        const models = (data?.models || []).map((model) => model?.name).filter(Boolean);
        return Array.from(new Set(models)).sort();
    }
}
