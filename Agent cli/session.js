import readline from "readline";
import fs from "fs";
import path from "path";
import chalk from "chalk";

const SESSION_DIR = path.resolve(process.cwd(), ".agent");
const SESSION_FILE = path.join(SESSION_DIR, "session.json");

export const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

export function question(promptText) {
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => resolve(answer));
  });
}

export async function confirm(promptText) {
  const answer = await question(chalk.yellow(`${promptText} (y/N): `));
  return answer.trim().toLowerCase() === "y";
}

export function saveSession(messages) {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(messages, null, 2), "utf-8");
  } catch {
    // non-fatal
  }
}

export function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch {
    // ignore
  }
}
