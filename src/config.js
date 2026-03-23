import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

export function getConfigPath() {
  return resolve(homedir(), ".committer");
}

export async function readConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not read ${configPath}: ${error.message}`);
  }
}

export async function writeConfig(configPath, config) {
  const contents = `${JSON.stringify(config, null, 2)}\n`;
  await fs.writeFile(configPath, contents, "utf8");
}
