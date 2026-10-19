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

const MAX_BRANCH_NAME_LENGTH = 60;

export function cleanBranchName(raw) {
  const text = raw.replace(/```[a-z]*/gi, "");
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  let name = line
    .replace(/^branch(?: name)?:\s*/i, "")
    .replace(/[`"']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/._-]+/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/(^|\/)[-.]+|[-.]+(?=\/|$)/g, "$1")
    .replace(/^\/+|\/+$/g, "");

  if (name.length > MAX_BRANCH_NAME_LENGTH) {
    name = name.slice(0, MAX_BRANCH_NAME_LENGTH).replace(/[-./]+$/, "");
  }
  if (!name) {
    throw new Error("AI returned an empty branch name.");
  }
  return name;
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
