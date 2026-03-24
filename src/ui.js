import { stdout as output } from "node:process";

const RESET = "\u001b[0m";
const BOLD = "\u001b[1m";
const DIM = "\u001b[2m";
const YELLOW = "\u001b[33m";
const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const CYAN = "\u001b[36m";

export const colors = {
  reset: RESET,
  bold: BOLD,
  dim: DIM,
  yellow: YELLOW,
  green: GREEN,
  red: RED,
  cyan: CYAN,
};

export function colorize(text, color) {
  return `${color}${text}${RESET}`;
}

export function writeLine(text) {
  output.write(`${text}\n`);
}

export function write(text) {
  output.write(text);
}

export async function promptSelect({ rl, question, options, defaultValue }) {
  writeLine(`\n${question}`);
  options.forEach((option, index) => {
    const marker = option.value === defaultValue ? " (default)" : "";
    writeLine(`${index + 1}) ${option.label}${marker}`);
  });

  const answer = await rl.question("Select option: ");
  const trimmed = answer.trim();
  if (!trimmed) return defaultValue;

  const asNumber = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1].value;
  }

  const matched = options.find((option) => option.value === trimmed);
  if (matched) return matched.value;

  writeLine("Invalid selection. Using default.");
  return defaultValue;
}

export async function promptNumber({ rl, question, defaultValue, min }) {
  while (true) {
    const answer = await rl.question(`${question} [${defaultValue}]: `);
    const trimmed = answer.trim();
    if (!trimmed) return defaultValue;
    const value = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(value) && value >= min) return value;
    writeLine(`Please enter a number >= ${min}.`);
  }
}
