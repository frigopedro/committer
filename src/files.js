import { promises as fs } from "node:fs";

export async function readTextFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}
