import chalk from "chalk";
import { chat } from "./ollamaClient.js";
import { toolImpls, toolSchemas } from "./tools.js";
import { buildProjectContext } from "./contextScanner.js";
import { saveSession } from "./session.js";

const BASE_SYSTEM_PROMPT = `You are a local coding agent working directly inside the user's project directory.
You have tools to list directories, read files, write files, make targeted edits, run shell commands, and search files.

Rules:
- Always inspect relevant files with read_file or search_files before editing them. Don't guess at file contents.
- Prefer edit_file (targeted find/replace) over write_file when modifying an existing file, unless a full rewrite is truly needed.
- After making changes, verify with run_command when it makes sense (e.g. run a build, typecheck, or the relevant tests).
- Work in small, verifiable steps. Don't try to do everything in one giant tool call.
- Follow the user's stated requirements literally and completely. If they describe specific data/behavior (e.g. "show registrations", "let admin assign X to Y"), implement exactly that — don't substitute a generic version of the feature.
- Before writing new UI, check how existing similar features get their data (e.g. Supabase, local state, an API) and reuse that same pattern rather than inventing placeholder/fake data.
- When you are done, reply with plain text summarizing what you changed and why — with no further tool calls.
- If a task is ambiguous, make a reasonable assumption, state it clearly in your final summary, and proceed rather than stalling.`;

const MAX_TURNS = 40;

export async function runAgent({ model, userPrompt, verbose = true, messages: existingMessages }) {
  const messages = existingMessages || [
    { role: "system", content: BASE_SYSTEM_PROMPT + "\n\n" + buildProjectContext() },
  ];
  messages.push({ role: "user", content: userPrompt });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const assistantMsg = await chat({ model, messages, tools: toolSchemas });
    messages.push(assistantMsg);

    const toolCalls = assistantMsg.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      if (verbose && assistantMsg.content) {
        console.log(chalk.green("\n✓ Agent:\n") + assistantMsg.content);
      }
      saveSession(messages);
      return { content: assistantMsg.content, messages };
    }

    for (const call of toolCalls) {
      const name = call.function.name;
      let args = call.function.arguments;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }

      if (verbose) {
        console.log(chalk.cyan(`\n→ ${name}(${JSON.stringify(args).slice(0, 200)})`));
      }

      let result;
      try {
        const impl = toolImpls[name];
        if (!impl) throw new Error(`Unknown tool: ${name}`);
        result = await impl(args);
      } catch (err) {
        result = `ERROR: ${err.message}`;
      }

      if (verbose) {
        const preview = String(result).slice(0, 400);
        console.log(chalk.gray(preview + (String(result).length > 400 ? "\n...[truncated]" : "")));
      }

      messages.push({
        role: "tool",
        content: typeof result === "string" ? result : JSON.stringify(result),
      });
    }

    saveSession(messages);
  }

  console.log(chalk.yellow(`\n⚠ Hit max turns (${MAX_TURNS}) without finishing. Session saved — send another message to continue.`));
  return { content: null, messages };
}
