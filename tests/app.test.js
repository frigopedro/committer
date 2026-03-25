import test from "node:test";
import assert from "node:assert/strict";

import { runApp } from "../src/app.js";

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
  return {
    lines,
    colors: {},
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

test("generates PR content from commits", async () => {
  const ui = createUi();
  const git = {
    ensureRepo: () => {},
    getDiff: () => "diff",
    truncateDiff: (diff) => ({ diff, truncated: false }),
    getCurrentBranch: () => "my-branch",
    getCommitsSince: (base, head) => `${base}..${head}`,
    commitWithMessage: async () => 0,
  };

  let received = "";
  const ai = {
    async generateCommitMessage() {
      return "";
    },
    async generatePullRequest({ commits, baseBranch }) {
      received = `${baseBranch}::${commits}`;
      return "PR Title\n\n- Item";
    },
  };

  const exitCode = await runApp({
    argv: [],
    args: createArgs({ pr: "origin/dev" }),
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
    rl: createReadline(),
    createSpinner: () => () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(received, "origin/dev::origin/dev..my-branch");
});
