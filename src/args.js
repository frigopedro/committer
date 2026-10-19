// Flags that never take a value, so `committer --non-interactive .` keeps `.` positional
const BOOLEAN_FLAGS = new Set(["non-interactive", "json", "move", "staged", "all", "init", "help"]);

export function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    // `.` is always positional (stage all), never a flag value: `committer --branch .`
    if (!BOOLEAN_FLAGS.has(key) && next && next !== "." && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, true);
    }
  }
  return args;
}
