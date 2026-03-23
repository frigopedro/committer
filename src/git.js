import { execSync } from "node:child_process";

export function runGit(args) {
  return execSync(`git ${args}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

export function ensureGitRepo() {
  try {
    runGit("rev-parse --show-toplevel");
  } catch (error) {
    throw new Error("Not inside a git repository.");
  }
}

export function getRepoRoot() {
  return runGit("rev-parse --show-toplevel");
}

export function getDiff(mode) {
  const staged = runGit("diff --staged");
  const unstaged = runGit("diff");

  if (mode === "staged") return staged;
  if (mode === "all") {
    if (staged && unstaged) return `${staged}\n\n${unstaged}`;
    return staged || unstaged;
  }

  return staged || unstaged;
}
