import { diffLines } from "diff";
import chalk from "chalk";

export function renderDiff(oldContent, newContent) {
  const parts = diffLines(oldContent || "", newContent || "");
  let out = "";
  for (const part of parts) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const line of lines) {
      if (part.added) out += chalk.green(`+ ${line}\n`);
      else if (part.removed) out += chalk.red(`- ${line}\n`);
      else out += chalk.gray(`  ${line}\n`);
    }
  }
  return out;
}
