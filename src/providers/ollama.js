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
        temperature: 0.2,
        num_predict: 64,
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
