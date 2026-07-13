#!/usr/bin/env node
import readline from "readline";
import chalk from "chalk";
import { runAgent } from "../src/agentLoop.js";

const DEFAULT_MODEL = process.env.AGENT_MODEL || "qwen3-coder-next:q4_K_M";

const args = process.argv.slice(2);
const oneShotPrompt = args.join(" ").trim();

console.log(chalk.bold.blue(`\nLocal Agent — model: ${DEFAULT_MODEL}`));
console.log(chalk.gray(`Working directory: ${process.cwd()}\n`));

if (oneShotPrompt) {
  runAgent({ model: DEFAULT_MODEL, userPrompt: oneShotPrompt }).then(() => process.exit(0));
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question(chalk.magenta("\n> "), async (input) => {
      const trimmed = input.trim();
      if (trimmed === "exit" || trimmed === "quit") {
        rl.close();
        return;
      }
      if (trimmed) {
        try {
          await runAgent({ model: DEFAULT_MODEL, userPrompt: trimmed });
        } catch (err) {
          console.log(chalk.red(`Error: ${err.message}`));
        }
      }
      ask();
    });
  };

  ask();
}
