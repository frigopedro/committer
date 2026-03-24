export async function callOllama({ system, user, model, host }) {
    const response = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model,
            stream: false,
            options: {
                temperature: 0.1,
                num_predict: 128,
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

export async function streamOllama({ system, user, model, host, onToken }) {
    const response = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model,
            stream: true,
            options: {
                temperature: 0.1,
                num_predict: 128,
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

export async function fetchOllamaModels(host) {
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
    const models = (data?.models || [])
        .map((model) => model?.name)
        .filter(Boolean);
    return Array.from(new Set(models)).sort();
}
