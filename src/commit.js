import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export async function commitWithMessage(message) {
  const filePath = join(tmpdir(), `committer-${randomUUID()}.txt`);
  await fs.writeFile(filePath, `${message}\n`, "utf8");

  try {
    const result = spawnSync("git", ["commit", "-F", filePath], {
      stdio: "inherit",
    });
    return result.status ?? 1;
  } finally {
    await fs.rm(filePath, { force: true });
  }
}
