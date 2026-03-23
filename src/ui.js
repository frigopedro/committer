import { stdout as output } from "node:process";

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
