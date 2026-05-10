export function extractPrJson(raw) {
  let text = raw.trim();
  // Strip markdown code fences if the model wrapped the JSON
  text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(text);
  if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
    throw new Error("PR JSON missing required 'title' or 'description' fields.");
  }
  return { title: parsed.title.trim(), description: parsed.description.trim() };
}

export function cleanCommitMessage(message) {
  let cleaned = message.trim();
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "");
  cleaned = cleaned.replace(/^commit message:\s*/i, "");
  cleaned = cleaned.replace(/^"|"$/g, "");
  cleaned = cleaned.replace(/^'|'$/g, "");
  cleaned = cleaned.replace(/\r\n/g, "\n");
  return cleaned.trim();
}
