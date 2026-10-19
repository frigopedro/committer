import { COMMIT_TYPES } from "../constants.js";

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

  // Provider system prompts are commit-specific (e.g. "no markdown"), which conflicts with PR output
  buildPullRequestSystemPrompt() {
    return [
      "You are a senior developer assistant that writes clear, accurate pull request descriptions.",
      "Write in a professional, concise tone.",
      "Follow the requested output format strictly.",
    ].join("\n");
  }

  buildBranchNameSystemPrompt() {
    return [
      "You are a senior developer assistant that names git branches.",
      "Follow the requested output format strictly.",
    ].join("\n");
  }

  buildBranchNamePrompt({ commits, diff, truncated, customInstructions, appendText }) {
    const instructionBlock = customInstructions
      ? `Project instructions:\n${customInstructions}`
      : "";

    return [
      "Name a git branch for the work below.",
      "Return ONLY the branch name. No explanation, no quotes, no code fences.",
      "",
      "Format: <type>/<short-slug>",
      `Allowed types: ${COMMIT_TYPES.join(", ")}.`,
      "Pick the type that matches the main intent of the work.",
      "Slug: 2 to 5 lowercase words joined by hyphens, only a-z, 0-9 and -, under 50 characters.",
      "Describe what the work achieves, not file names.",
      "",
      "Examples: feat/add-token-refresh, fix/null-user-crash, docs/update-install-guide",
      "",
      instructionBlock,
      appendText?.trim() || "",
      commits ? `Commits:\n${commits}` : "",
      truncated ? "The diff is truncated. Only use visible changes." : "",
      diff ? `Uncommitted changes:\n<diff>\n${diff}\n</diff>` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  buildPullRequestPrompt({
    commits,
    diffStat,
    diff,
    truncated,
    baseBranch,
    customInstructions,
    appendText,
  }) {
    const instructionBlock = customInstructions
      ? `Project instructions:\n${customInstructions}`
      : "";

    return [
      "Write a pull request title and description.",
      "Return ONLY a valid JSON object. No extra text, no code fences, no commentary.",
      "",
      "The JSON must have exactly two keys:",
      '  "title"       — short human-readable PR title in Title Case (e.g. "Add User Authentication"), no conventional commit prefix, under 72 chars.',
      '  "description" — Markdown string with these three sections:',
      "    ## Summary",
      "    <2-3 sentences describing the overall purpose of this PR and why it is needed>",
      "",
      "    ## Changes",
      "    - <key change>",
      "",
      "    ## Impact",
      "    <Breaking changes, performance effects, or behavioral differences. Write 'No breaking changes.' if none.>",
      "",
      "Guidelines:",
      "- Commits describe the intent; the diff is the source of truth for what actually changed.",
      "- The Changes section must reflect the diff. Group bullets by area when there are many changes.",
      "- Call out notable additions such as new files, config, dependencies, migrations, and tests.",
      "- In Impact, flag API, CLI, or behavior changes visible in the diff and anything reviewers must know.",
      "- Do not invent changes that are not in the commits or the diff.",
      "",
      "Example output (do not copy literally):",
      '{"title":"Add User Authentication","description":"## Summary\\nAdd JWT-based login and token refresh.\\n\\n## Changes\\n- Add POST /auth/login endpoint\\n- Add JWT middleware\\n\\n## Impact\\nNo breaking changes."}',
      "",
      instructionBlock,
      appendText?.trim() || "",
      `Base branch: ${baseBranch}`,
      "Commits:",
      commits,
      diffStat ? `\nFiles changed:\n${diffStat}` : "",
      truncated ? "\nThe diff is truncated. Only describe visible changes and the file list above." : "",
      diff ? `\n<diff>\n${diff}\n</diff>` : "",
    ]
      .filter(Boolean)
      .join("\n");
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
