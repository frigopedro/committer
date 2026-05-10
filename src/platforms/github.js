import { spawnSync } from "node:child_process";

export class GithubPlatform {
  get name() {
    return "GitHub";
  }

  get cliName() {
    return "gh";
  }

  isCliInstalled() {
    const result = spawnSync("gh", ["--version"], { stdio: "ignore" });
    return result.status === 0;
  }

  installCli() {
    const { platform } = process;

    if (platform === "darwin") {
      const result = spawnSync("brew", ["install", "gh"], { stdio: "inherit" });
      if (result.status !== 0) throw new Error("brew install gh failed.");
    } else if (platform === "linux") {
      const script = [
        "type -p curl >/dev/null || (sudo apt update && sudo apt install curl -y)",
        "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg",
        "sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg",
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
        "sudo apt update && sudo apt install gh -y",
      ].join(" && ");
      const result = spawnSync("bash", ["-c", script], { stdio: "inherit" });
      if (result.status !== 0) throw new Error("gh install failed.");
    } else if (platform === "win32") {
      const result = spawnSync("winget", ["install", "--id", "GitHub.cli"], {
        stdio: "inherit",
      });
      if (result.status !== 0) throw new Error("winget install gh failed.");
    } else {
      throw new Error(
        `Automatic install not supported on ${platform}. Visit https://cli.github.com to install manually.`
      );
    }
  }

  createPr({ title, description, baseBranch }) {
    const result = spawnSync(
      "gh",
      ["pr", "create", "--title", title, "--body", description, "--base", baseBranch],
      { stdio: "inherit" }
    );
    return result.status === 0;
  }
}
