import { GithubPlatform } from "./github.js";
import { AzurePlatform } from "./azure.js";

export function detectPlatform(remoteUrl) {
  if (!remoteUrl) return null;
  if (remoteUrl.includes("github.com")) return new GithubPlatform();
  if (
    remoteUrl.includes("dev.azure.com") ||
    remoteUrl.includes("visualstudio.com")
  )
    return new AzurePlatform();
  return null;
}
