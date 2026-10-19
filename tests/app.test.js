import test from "node:test";
import assert from "node:assert/strict";

import { runApp } from "../src/app.js";
import { parseArgs } from "../src/args.js";
import { cleanBranchName } from "../src/text.js";

function createArgs(entries = {}) {
  const map = new Map();
  Object.entries(entries).forEach(([key, value]) => {
    if (value === true) {
      map.set(key, true);
    } else if (value !== undefined) {
      map.set(key, String(value));
    }
  });
  return map;
}

function createUi() {
  const lines = [];
  const errors = [];
  return {
    lines,
    errors,
    colors: {},
    writeError: (text) => {
      errors.push(text);
    },
    colorize: (text) => text,
    write: (text) => {
      lines.push(text);
    },
    writeLine: (text) => {
      lines.push(text);
    },
  };
}

function createReadline(answers = []) {
  let index = 0;
  return {
    question: async () => answers[index++] ?? "",
    close: () => {},
  };
}

test("stages all when argv includes dot", async () => {
  const ui = createUi();
  const git = {
    ensureRepo: () => {},
    stageAllCalls: 0,
    stageAll() {
      this.stageAllCalls += 1;
    },
    getDiff: () => "diff",
    truncateDiff: (diff) => ({ diff, truncated: false }),
    commitWithMessage: async () => 0,
  };

  const ai = {
    async generateCommitMessage({ onToken }) {
      onToken("feat: test\n\nbody");
      return "feat: test\n\nbody";
    },
  };

  const exitCode = await runApp({
    argv: ["."],
    args: createArgs(),
    env: {},
    ui,
    git,
    ai,
    config: {
      getConfigPath: () => "",
      readConfig: async () => ({ provider: "openai", model: "gpt-4o" }),
      runOnboarding: async () => ({}),
    },
    providerRegistry: { getProviderClass: () => null },
    files: { readTextFile: async () => null },
    rl: createReadline(["n"]),
    createSpinner: () => () => {},
  });

  assert.equal(exitCode, 2);
  assert.equal(git.stageAllCalls, 1);
});

test("commits when user accepts", async () => {
  const ui = createUi();
  let committed = "";
  const git = {
    ensureRepo: () => {},
    getDiff: () => "diff",
    truncateDiff: (diff) => ({ diff, truncated: false }),
    commitWithMessage: async (message) => {
      committed = message;
      return 0;
    },
  };

  const ai = {
    async generateCommitMessage({ onToken }) {
      onToken("feat: test\n\nbody");
      return "feat: test\n\nbody";
    },
  };

  const exitCode = await runApp({
    argv: [],
    args: createArgs(),
    env: {},
    ui,
    git,
    ai,
    config: {
      getConfigPath: () => "",
      readConfig: async () => ({ provider: "openai", model: "gpt-4o" }),
      runOnboarding: async () => ({}),
    },
    providerRegistry: { getProviderClass: () => null },
    files: { readTextFile: async () => null },
    rl: createReadline(["y"]),
    createSpinner: () => () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(committed, "feat: test\n\nbody");
});

test("regenerates on empty response", async () => {
  const ui = createUi();
  let calls = 0;
  const git = {
    ensureRepo: () => {},
    getDiff: () => "diff",
    truncateDiff: (diff) => ({ diff, truncated: false }),
    commitWithMessage: async () => 0,
  };

  const ai = {
    async generateCommitMessage() {
      calls += 1;
      if (calls === 1) return "";
      return "feat: test\n\nbody";
    },
  };

  const exitCode = await runApp({
    argv: [],
    args: createArgs(),
    env: {},
    ui,
    git,
    ai,
    config: {
      getConfigPath: () => "",
      readConfig: async () => ({ provider: "openai", model: "gpt-4o" }),
      runOnboarding: async () => ({}),
    },
    providerRegistry: { getProviderClass: () => null },
    files: { readTextFile: async () => null },
    rl: createReadline(["n"]),
    createSpinner: () => () => {},
  });

  assert.equal(exitCode, 2);
  assert.equal(calls, 2);
});

test("passes prompt-append to AI", async () => {
  const ui = createUi();
  const git = {
    ensureRepo: () => {},
    getDiff: () => "diff",
    truncateDiff: (diff) => ({ diff, truncated: false }),
    commitWithMessage: async () => 0,
  };

  let append = "";
  const ai = {
    async generateCommitMessage({ promptAppend }) {
      append = promptAppend;
      return "feat: test\n\nbody";
    },
  };

  const exitCode = await runApp({
    argv: [],
    args: createArgs({ "prompt-append": "mention tests" }),
    env: {},
    ui,
    git,
    ai,
    config: {
      getConfigPath: () => "",
      readConfig: async () => ({ provider: "openai", model: "gpt-4o" }),
      runOnboarding: async () => ({}),
    },
    providerRegistry: { getProviderClass: () => null },
    files: { readTextFile: async () => null },
    rl: createReadline(["n"]),
    createSpinner: () => () => {},
  });

  assert.equal(exitCode, 2);
  assert.equal(append, "mention tests");
});

test("uses claude.md instructions when enabled", async () => {
  const ui = createUi();
  const git = {
    ensureRepo: () => {},
    getRepoRoot: () => "/repo",
    getDiff: () => "diff",
    truncateDiff: (diff) => ({ diff, truncated: false }),
    commitWithMessage: async () => 0,
  };

  let instructions = "";
  const ai = {
    async generateCommitMessage({ customInstructions }) {
      instructions = customInstructions;
      return "feat: test\n\nbody";
    },
  };

  const exitCode = await runApp({
    argv: [],
    args: createArgs(),
    env: {},
    ui,
    git,
    ai,
    config: {
      getConfigPath: () => "",
      readConfig: async () => ({
        provider: "openai",
        model: "gpt-4o",
        useClaudeMd: true,
      }),
      runOnboarding: async () => ({}),
    },
    providerRegistry: { getProviderClass: () => null },
    files: { readTextFile: async () => "Use these rules" },
    rl: createReadline(["n"]),
    createSpinner: () => () => {},
  });

  assert.equal(exitCode, 2);
  assert.equal(instructions, "Use these rules");
});

test("handles no changes", async () => {
  const ui = createUi();
  const git = {
    ensureRepo: () => {},
    getDiff: () => "",
    truncateDiff: (diff) => ({ diff, truncated: false }),
    commitWithMessage: async () => 0,
  };

  const exitCode = await runApp({
    argv: [],
    args: createArgs(),
    env: {},
    ui,
    git,
    ai: { generateCommitMessage: async () => "" },
    config: {
      getConfigPath: () => "",
      readConfig: async () => ({ provider: "openai", model: "gpt-4o" }),
      runOnboarding: async () => ({}),
    },
    providerRegistry: { getProviderClass: () => null },
    files: { readTextFile: async () => null },
    rl: createReadline(),
    createSpinner: () => () => {},
  });

  assert.equal(exitCode, 0);
});

function createPrGit(overrides = {}) {
  return {
    calls: [],
    ensureRepo: () => {},
    getDiff: () => "",
    truncateDiff: (diff) => ({ diff, truncated: false }),
    getCurrentBranch: () => "my-branch",
    getCommitsSince: (base, head) => `abc123 feat: thing (${base}..${head})`,
    getBranchDiff: () => "branch diff",
    getBranchDiffStat: () => " src/a.js | 2 +-",
    getRemoteUrl: () => "",
    hasStagedChanges: () => false,
    hasUncommittedChanges: () => false,
    stripRemotePrefix: (branch) => branch.replace(/^origin\//, ""),
    getHeadSha: () => "abc1234",
    pushCurrentBranch() {
      this.calls.push("push");
      return { pushed: true, branch: "my-branch" };
    },
    async commitWithMessage(message, options) {
      this.calls.push(["commit", message, options]);
      return 0;
    },
    ...overrides,
  };
}

function createPlatform({ installed = true, ok = true } = {}) {
  return {
    name: "GitHub",
    cliName: "gh",
    created: null,
    isCliInstalled: () => installed,
    createPr(options) {
      this.created = options;
      return { ok, url: ok ? "https://github.com/o/r/pull/1" : null };
    },
  };
}

function createDeps(overrides = {}) {
  return {
    argv: [],
    args: createArgs(),
    env: {},
    ui: createUi(),
    config: {
      getConfigPath: () => "",
      readConfig: async () => ({ provider: "openai", model: "gpt-4o" }),
      runOnboarding: async () => {
        throw new Error("onboarding should not run");
      },
    },
    providerRegistry: { getProviderClass: () => null },
    files: { readTextFile: async () => null },
    rl: {
      question: async () => {
        throw new Error("rl.question should not be called");
      },
      close: () => {},
    },
    createSpinner: () => () => {},
    ...overrides,
  };
}

const PR = { title: "Add Thing", description: "## Summary\nAdds a thing." };

test("generates PR content from commits and branch changeset", async () => {
  const git = createPrGit();
  let received = null;
  const ai = {
    async generatePullRequest(options) {
      received = options;
      return PR;
    },
  };

  const exitCode = await runApp(
    createDeps({
      args: createArgs({ pr: "origin/dev" }),
      git,
      ai,
      rl: createReadline(["n"]),
    })
  );

  assert.equal(exitCode, 2);
  assert.equal(received.baseBranch, "origin/dev");
  assert.equal(received.commits, "abc123 feat: thing (origin/dev..my-branch)");
  assert.equal(received.diff, "branch diff");
  assert.equal(received.diffStat, " src/a.js | 2 +-");
  assert.equal(received.truncated, false);
});

test("non-interactive commit auto-commits without prompts or onboarding", async () => {
  const git = createPrGit({ getDiff: () => "diff" });
  const ui = createUi();
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ "non-interactive": true }),
      ui,
      git,
      ai: { generateCommitMessage: async ({ stream }) => (stream ? "" : "feat: test\n\nbody") },
      config: {
        getConfigPath: () => "",
        readConfig: async () => null,
        runOnboarding: async () => {
          throw new Error("onboarding should not run");
        },
      },
    })
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(git.calls, [["commit", "feat: test\n\nbody", { silent: true }]]);
  assert.ok(ui.lines.includes("committed abc1234"));
});

test("non-interactive commit fails after repeated empty responses", async () => {
  let calls = 0;
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ "non-interactive": true }),
      git: createPrGit({ getDiff: () => "diff" }),
      ai: {
        generateCommitMessage: async () => {
          calls += 1;
          return "";
        },
      },
    })
  );

  assert.equal(exitCode, 1);
  assert.equal(calls, 3);
});

test("non-interactive PR pushes then creates the PR", async () => {
  const git = createPrGit({ getRemoteUrl: () => "git@github.com:o/r.git" });
  const platform = createPlatform();

  const exitCode = await runApp(
    createDeps({
      args: createArgs({ pr: "origin/main", "non-interactive": true }),
      git,
      ai: { generatePullRequest: async () => PR },
      platforms: { detectPlatform: () => platform },
    })
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(git.calls, ["push"]);
  assert.deepEqual(platform.created, {
    title: PR.title,
    description: PR.description,
    baseBranch: "main",
    headBranch: "my-branch",
  });
});

test("non-interactive PR fails when platform CLI is missing", async () => {
  const git = createPrGit();
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ pr: "main", "non-interactive": true }),
      git,
      ai: { generatePullRequest: async () => PR },
      platforms: { detectPlatform: () => createPlatform({ installed: false }) },
    })
  );

  assert.equal(exitCode, 1);
  assert.deepEqual(git.calls, []);
});

test("--json PR without a platform reports created false", async () => {
  const ui = createUi();
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ pr: "main", json: true }),
      ui,
      git: createPrGit(),
      ai: { generatePullRequest: async () => PR },
      platforms: { detectPlatform: () => null },
    })
  );

  assert.equal(exitCode, 0);
  assert.equal(ui.lines.length, 1);
  const result = JSON.parse(ui.lines[0]);
  assert.equal(result.ok, true);
  assert.equal(result.commit, null);
  assert.equal(result.pr.title, PR.title);
  assert.equal(result.pr.created, false);
  assert.ok(result.reason);
});

test("--json reports errors as ok false", async () => {
  const ui = createUi();
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ json: true }),
      ui,
      git: createPrGit({
        ensureRepo: () => {
          throw new Error("Not inside a git repository.");
        },
      }),
      ai: {},
    })
  );

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(ui.lines[0]), {
    ok: false,
    branch: null,
    commit: null,
    pr: null,
    error: "Not inside a git repository.",
  });
});

test("dot with --pr commits before generating the PR", async () => {
  const order = [];
  const ui = createUi();
  const git = createPrGit({
    getDiff: () => "diff",
    stageAll: () => order.push("stage"),
    async commitWithMessage() {
      order.push("commit");
      return 0;
    },
  });

  const exitCode = await runApp(
    createDeps({
      argv: [".", "--pr", "main", "--json"],
      args: createArgs({ pr: "main", json: true }),
      ui,
      git,
      ai: {
        generateCommitMessage: async () => "feat: test\n\nbody",
        generatePullRequest: async () => {
          order.push("pr");
          return PR;
        },
      },
      platforms: { detectPlatform: () => null },
    })
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(order, ["stage", "commit", "pr"]);
  const result = JSON.parse(ui.lines[0]);
  assert.deepEqual(result.commit, { sha: "abc1234", message: "feat: test\n\nbody" });
  assert.equal(result.pr.title, PR.title);
});

test("boolean flags do not swallow positional arguments", () => {
  const args = parseArgs(["--non-interactive", ".", "--pr", "main", "--json"]);
  assert.equal(args.get("non-interactive"), true);
  assert.equal(args.get("pr"), "main");
  assert.equal(args.get("json"), true);
});

function createBranchGit(overrides = {}) {
  return createPrGit({
    getCurrentBranch: () => "dev",
    getUpstream: () => "origin/dev",
    getCommitsSince: () => "abc123 feat: add x\nAdds x.",
    countCommits: () => 2,
    refExists: () => false,
    isValidBranchName: () => true,
    createBranch(name) {
      this.calls.push(["create", name]);
    },
    resetBranch(branch, ref) {
      this.calls.push(["reset", branch, ref]);
    },
    ...overrides,
  });
}

const branchAi = { generateBranchName: async () => "feat/add-x" };

test("--branch names and creates a branch without moving commits by default", async () => {
  const git = createBranchGit();
  const ui = createUi();
  let received = null;

  const exitCode = await runApp(
    createDeps({
      args: createArgs({ branch: true, json: true }),
      ui,
      git,
      ai: {
        generateBranchName: async (options) => {
          received = options;
          return "feat/add-x";
        },
      },
    })
  );

  assert.equal(exitCode, 0);
  assert.equal(received.commits, "abc123 feat: add x\nAdds x.");
  assert.deepEqual(git.calls, [["create", "feat/add-x"]]);
  assert.deepEqual(JSON.parse(ui.lines[0]), {
    ok: true,
    branch: { name: "feat/add-x", from: "dev", base: "origin/dev", commits: 2, moved: 0 },
    commit: null,
    pr: null,
  });
});

test("--branch --move resets the source branch to its upstream", async () => {
  const git = createBranchGit();
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ branch: true, move: true, "non-interactive": true }),
      git,
      ai: branchAi,
    })
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(git.calls, [
    ["create", "feat/add-x"],
    ["reset", "dev", "origin/dev"],
  ]);
});

test("--branch with an explicit base never moves commits", async () => {
  const git = createBranchGit();
  const ui = createUi();
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ branch: "main", move: true, "non-interactive": true }),
      ui,
      git,
      ai: branchAi,
    })
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(git.calls, [["create", "feat/add-x"]]);
  assert.ok(ui.errors.some((line) => line.includes("--move ignored")));
});

test("--branch appends a suffix when the name already exists", async () => {
  const git = createBranchGit({
    refExists: (ref) => ["refs/heads/feat/add-x", "refs/heads/feat/add-x-2"].includes(ref),
  });
  await runApp(
    createDeps({ args: createArgs({ branch: true, json: true }), git, ai: branchAi })
  );

  assert.deepEqual(git.calls, [["create", "feat/add-x-3"]]);
});

test("--branch with nothing to name exits cleanly with a reason", async () => {
  const ui = createUi();
  const git = createBranchGit({ getCommitsSince: () => "", getDiff: () => "" });
  const exitCode = await runApp(
    createDeps({ args: createArgs({ branch: true, json: true }), ui, git, ai: branchAi })
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(git.calls, []);
  assert.ok(JSON.parse(ui.lines[0]).reason);
});

test("interactive --branch supports edit and the move prompt", async () => {
  const git = createBranchGit();
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ branch: true }),
      git,
      ai: branchAi,
      rl: createReadline(["e", "fix/better-name", "y"]),
    })
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(git.calls, [
    ["create", "fix/better-name"],
    ["reset", "dev", "origin/dev"],
  ]);
});

test("interactive --branch abort creates nothing", async () => {
  const git = createBranchGit();
  const exitCode = await runApp(
    createDeps({
      args: createArgs({ branch: true }),
      git,
      ai: branchAi,
      rl: createReadline(["n"]),
    })
  );

  assert.equal(exitCode, 2);
  assert.deepEqual(git.calls, []);
});

test(". --branch --pr runs branch, commit, then PR", async () => {
  const order = [];
  const ui = createUi();
  const git = createBranchGit({
    getDiff: () => "diff",
    stageAll: () => order.push("stage"),
    createBranch: () => order.push("branch"),
    async commitWithMessage() {
      order.push("commit");
      return 0;
    },
  });

  const exitCode = await runApp(
    createDeps({
      argv: [".", "--branch", "--pr", "main", "--json"],
      args: createArgs({ branch: true, pr: "main", json: true }),
      ui,
      git,
      ai: {
        ...branchAi,
        generateCommitMessage: async () => "feat: x\n\nbody",
        generatePullRequest: async () => {
          order.push("pr");
          return PR;
        },
      },
      platforms: { detectPlatform: () => null },
    })
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(order, ["branch", "stage", "commit", "pr"]);
  const result = JSON.parse(ui.lines[0]);
  assert.equal(result.branch.name, "feat/add-x");
  assert.equal(result.commit.sha, "abc1234");
  assert.equal(result.pr.title, PR.title);
});

test("cleanBranchName normalizes AI output", () => {
  assert.equal(cleanBranchName("feat/add-token-refresh"), "feat/add-token-refresh");
  assert.equal(cleanBranchName("```\nfeat/Add Token Refresh\n```"), "feat/add-token-refresh");
  assert.equal(cleanBranchName('Branch name: "fix/null user crash!"'), "fix/null-user-crash");
  assert.throws(() => cleanBranchName("```\n```"));
});

test("dot is never consumed as a flag value", () => {
  const args = parseArgs(["--branch", ".", "--pr", "main"]);
  assert.equal(args.get("branch"), true);
  assert.equal(args.get("pr"), "main");
});
