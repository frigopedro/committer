export async function callOpenAI({ system, user, model }) {
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
            model,
            temperature: 0.2,
            max_tokens: 256,
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
    const content = data?.choices?.[0]?.message?.content ?? "";
    return content;
}

export async function streamOpenAI({ system, user, model, onToken }) {
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
            model,
            temperature: 0.2,
            max_tokens: 256,
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
