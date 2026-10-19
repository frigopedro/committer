import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export class GitClient {
  runGit(args) {
    const result = spawnSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || `git ${args[0]} failed`);
    }
    return result.stdout.trimEnd();
  }

  stageAll() {
    this.runGit(["add", "."]);
  }

  ensureRepo() {
    try {
      this.runGit(["rev-parse", "--show-toplevel"]);
    } catch {
      throw new Error("Not inside a git repository.");
    }
  }

  getRepoRoot() {
    return this.runGit(["rev-parse", "--show-toplevel"]);
  }

  getCurrentBranch() {
    return this.runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  }

  getRemoteUrl(remote = "origin") {
    try {
      return this.runGit(["remote", "get-url", remote]);
    } catch {
      return "";
    }
  }

  stripRemotePrefix(branch) {
    try {
      const remotes = this.runGit(["remote"]).split("\n").filter(Boolean);
      for (const remote of remotes) {
        if (branch.startsWith(`${remote}/`)) {
          return branch.slice(remote.length + 1);
        }
      }
    } catch { /* no remotes configured */ }
    return branch;
  }

  getDiff(mode) {
    const staged = this.runGit(["diff", "--staged"]);
    const unstaged = this.runGit(["diff"]);

    if (mode === "staged") return staged;
    if (mode === "all") {
      if (staged && unstaged) return `${staged}\n\n${unstaged}`;
      return staged || unstaged;
    }

    return staged || unstaged;
  }

  getCommitsSince(baseRef, headRef) {
    const base = baseRef?.trim();
    const head = headRef?.trim() || "HEAD";
    if (!base) {
      throw new Error("Base branch is required to list commits.");
    }

    // If base looks like remote/branch, fetch it so the ref exists locally
    const slashIdx = base.indexOf("/");
    if (slashIdx !== -1) {
      const remote = base.slice(0, slashIdx);
      const branch = base.slice(slashIdx + 1);
      try {
        this.runGit(["fetch", remote, branch]);
      } catch { /* ignore — log will fail with a clear message if ref still missing */ }
    }

    return this.runGit(["log", `${base}..${head}`, "--pretty=format:%h%x20%s%n%b"]);
  }

  // Three-dot diff: changes since the merge-base, i.e. what the PR will show
  getBranchDiff(baseRef, headRef = "HEAD") {
    return this.runGit(["diff", `${baseRef}...${headRef}`]);
  }

  getBranchDiffStat(baseRef, headRef = "HEAD") {
    return this.runGit(["diff", "--stat", `${baseRef}...${headRef}`]);
  }

  hasStagedChanges() {
    return Boolean(this.runGit(["diff", "--staged", "--name-only"]));
  }

  hasUncommittedChanges() {
    return Boolean(this.runGit(["status", "--porcelain"]));
  }

  getHeadSha() {
    return this.runGit(["rev-parse", "--short", "HEAD"]);
  }

  getUpstream() {
    try {
      return this.runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    } catch {
      return "";
    }
  }

  refExists(ref) {
    try {
      this.runGit(["rev-parse", "--verify", "--quiet", ref]);
      return true;
    } catch {
      return false;
    }
  }

  isValidBranchName(name) {
    try {
      this.runGit(["check-ref-format", "--branch", name]);
      return true;
    } catch {
      return false;
    }
  }

  countCommits(baseRef, headRef = "HEAD") {
    return Number.parseInt(this.runGit(["rev-list", "--count", `${baseRef}..${headRef}`]), 10);
  }

  // Keeps the working tree and staged changes
  createBranch(name) {
    this.runGit(["switch", "-c", name]);
  }

  // Moves a branch ref that is not checked out; the working tree is untouched
  resetBranch(branch, ref) {
    this.runGit(["branch", "-f", branch, ref]);
  }

  // Pushes the current branch, setting upstream on first push. No-op when up to date.
  pushCurrentBranch(remote = "origin") {
    const branch = this.getCurrentBranch();
    const upstream = this.getUpstream();

    if (!upstream) {
      this.runGit(["push", "-u", remote, branch]);
      return { pushed: true, branch };
    }

    if (this.countCommits(upstream) > 0) {
      this.runGit(["push"]);
      return { pushed: true, branch };
    }
    return { pushed: false, branch };
  }

  truncateDiff(diff, maxChars) {
    if (diff.length <= maxChars) return { diff, truncated: false };
    const keep = Math.floor(maxChars / 2);
    const start = diff.slice(0, keep);
    const end = diff.slice(diff.length - keep);
    return {
      diff: `${start}\n\n...diff truncated...\n\n${end}`,
      truncated: true,
    };
  }

  // silent: keep git's output off stdout (forwarded to stderr only on failure)
  async commitWithMessage(message, { silent = false } = {}) {
    const filePath = join(tmpdir(), `committer-${randomUUID()}.txt`);
    await fs.writeFile(filePath, `${message}\n`, "utf8");

    try {
      const result = spawnSync("git", ["commit", "-F", filePath], {
        stdio: silent ? ["ignore", "pipe", "pipe"] : "inherit",
        encoding: "utf8",
      });
      if (silent && result.status !== 0) {
        process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
      }
      return result.status ?? 1;
    } finally {
      await fs.rm(filePath, { force: true });
    }
  }
}
