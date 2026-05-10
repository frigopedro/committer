import { spawnSync } from "node:child_process";

export class AzurePlatform {
  get name() {
    return "Azure DevOps";
  }

  get cliName() {
    return "az";
  }

  isCliInstalled() {
    const azResult = spawnSync("az", ["--version"], { stdio: "ignore" });
    if (azResult.status !== 0) return false;

    const extResult = spawnSync(
      "az",
      ["extension", "show", "--name", "azure-devops"],
      { stdio: "ignore" }
    );
    return extResult.status === 0;
  }

  installCli() {
    const { platform } = process;
    const azResult = spawnSync("az", ["--version"], { stdio: "ignore" });
    const azMissing = azResult.status !== 0;

    if (azMissing) {
      if (platform === "darwin") {
        const result = spawnSync("brew", ["install", "azure-cli"], {
          stdio: "inherit",
        });
        if (result.status !== 0) throw new Error("brew install azure-cli failed.");
      } else if (platform === "linux") {
        const result = spawnSync(
          "bash",
          ["-c", "curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash"],
          { stdio: "inherit" }
        );
        if (result.status !== 0) throw new Error("az install failed.");
      } else if (platform === "win32") {
        const result = spawnSync(
          "winget",
          ["install", "--id", "Microsoft.AzureCLI"],
          { stdio: "inherit" }
        );
        if (result.status !== 0) throw new Error("winget install az failed.");
      } else {
        throw new Error(
          `Automatic install not supported on ${platform}. Visit https://docs.microsoft.com/cli/azure/install-azure-cli to install manually.`
        );
      }
    }

    // Install the azure-devops extension regardless — idempotent
    const extResult = spawnSync(
      "az",
      ["extension", "add", "--name", "azure-devops"],
      { stdio: "inherit" }
    );
    if (extResult.status !== 0)
      throw new Error("Failed to install azure-devops CLI extension.");
  }

  createPr({ title, description, baseBranch }) {
    const result = spawnSync(
      "az",
      [
        "repos", "pr", "create",
        "--title", title,
        "--description", description,
        "--target-branch", baseBranch,
        "--detect", "true",
        "--output", "json",
      ],
      { stdio: ["inherit", "pipe", "inherit"] }
    );

    let url = null;
    if (result.status === 0 && result.stdout) {
      try {
        const pr = JSON.parse(result.stdout.toString());
        const repoWebUrl = pr?.repository?.webUrl ?? "";
        const prId = pr?.pullRequestId;
        if (repoWebUrl && prId) url = `${repoWebUrl}/pullrequest/${prId}`;
      } catch { /* leave url null */ }
    }

    return { ok: result.status === 0, url };
  }
}
