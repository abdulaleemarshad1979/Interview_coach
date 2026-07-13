#!/usr/bin/env node
import chalk from "chalk";
import { runAgent } from "./agentLoop.js";
import { rl, confirm, loadSession, clearSession } from "./session.js";

let currentModel = process.env.AGENT_MODEL || "qwen3-coder-next:q4_K_M";
let messages = null;

const args = process.argv.slice(2);
const oneShotPrompt = args.join(" ").trim();

console.log(chalk.bold.blue(`\nLocal Agent — model: ${currentModel}`));
console.log(chalk.gray(`Working directory: ${process.cwd()}\n`));
console.log(chalk.gray(`Commands: /model <name>  /model  /new  exit\n`));

async function maybeResumeSession() {
  const saved = loadSession();
  if (saved && saved.length > 1) {
    const resume = await confirm("Found a previous session for this project. Resume it?");
    if (resume) {
      messages = saved;
      console.log(chalk.green(`Resumed session (${saved.length} messages of context).`));
    } else {
      clearSession();
    }
  }
}

async function handleTurn(input) {
  try {
    const result = await runAgent({ model: currentModel, userPrompt: input, messages });
    messages = result.messages;
  } catch (err) {
    console.log(chalk.red(`Error: ${err.message}`));
  }
}

if (oneShotPrompt) {
  await maybeResumeSession();
  await handleTurn(oneShotPrompt);
  process.exit(0);
} else {
  await maybeResumeSession();

  const ask = () => {
    rl.question(chalk.magenta("\n> "), async (input) => {
      const trimmed = input.trim();

      if (trimmed === "exit" || trimmed === "quit") {
        rl.close();
        return;
      }

      if (trimmed === "/model") {
        console.log(chalk.yellow(`Current model: ${currentModel}`));
        ask();
        return;
      }

      if (trimmed.startsWith("/model ")) {
        const newModel = trimmed.slice("/model ".length).trim();
        if (newModel) {
          currentModel = newModel;
          console.log(chalk.green(`Switched model to: ${currentModel}`));
        } else {
          console.log(chalk.red("Usage: /model <model-name>"));
        }
        ask();
        return;
      }

      if (trimmed === "/new") {
        messages = null;
        clearSession();
        console.log(chalk.green("Started a fresh session (previous context cleared)."));
        ask();
        return;
      }

      if (trimmed) {
        await handleTurn(trimmed);
      }
      ask();
    });
  };

  ask();
}
