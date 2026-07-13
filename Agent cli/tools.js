import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();

// Safety: keep every file operation inside the project root
function safePath(rel) {
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT)) {
    throw new Error(`Refusing to access path outside project root: ${rel}`);
  }
  return full;
}

// ---- Tool implementations ----

function listDir({ dir = "." }) {
  const full = safePath(dir);
  const entries = fs.readdirSync(full, { withFileTypes: true });
  return entries
    .filter((e) => !["node_modules", ".git", "dist", "build"].includes(e.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .join("\n");
}

function readFile({ path: rel }) {
  const full = safePath(rel);
  if (!fs.existsSync(full)) return `ERROR: file not found: ${rel}`;
  const content = fs.readFileSync(full, "utf-8");
  // Cap very large files so we don't blow the context window
  const MAX = 12000;
  if (content.length > MAX) {
    return content.slice(0, MAX) + `\n\n...[truncated, file has ${content.length} chars total]`;
  }
  return content;
}

function writeFile({ path: rel, content }) {
  const full = safePath(rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return `Wrote ${content.length} chars to ${rel}`;
}

// Simple find/replace edit — safer than full overwrite for small changes
function editFile({ path: rel, old_str, new_str }) {
  const full = safePath(rel);
  if (!fs.existsSync(full)) return `ERROR: file not found: ${rel}`;
  const content = fs.readFileSync(full, "utf-8");
  const count = content.split(old_str).length - 1;
  if (count === 0) return `ERROR: old_str not found in ${rel}`;
  if (count > 1) return `ERROR: old_str is not unique in ${rel} (${count} matches). Include more context.`;
  const updated = content.replace(old_str, new_str);
  fs.writeFileSync(full, updated, "utf-8");
  return `Edited ${rel}`;
}

function runCommand({ command }) {
  try {
    const output = execSync(command, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 5,
    });
    return output || "(no output)";
  } catch (err) {
    return `ERROR (exit ${err.status}):\n${err.stdout || ""}\n${err.stderr || err.message}`;
  }
}

function searchFiles({ pattern, dir = "." }) {
  const full = safePath(dir);
  try {
    const output = execSync(
      `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" -E "${pattern.replace(/"/g, '\\"')}" "${full}" | grep -v node_modules | head -100`,
      { encoding: "utf-8", timeout: 15000 }
    );
    return output || "(no matches)";
  } catch (err) {
    return err.stdout || "(no matches)";
  }
}

export const toolImpls = {
  list_dir: listDir,
  read_file: readFile,
  write_file: writeFile,
  edit_file: editFile,
  run_command: runCommand,
  search_files: searchFiles,
};

// ---- Tool schemas (sent to Ollama) ----

export const toolSchemas = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and folders in a directory relative to the project root.",
      parameters: {
        type: "object",
        properties: { dir: { type: "string", description: "Relative directory path, default '.'" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full contents of a file relative to the project root.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative file path" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a new file or completely overwrite an existing file with new content.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Make a targeted edit to an existing file by replacing an exact, unique block of text (old_str) with new_str. Preferred over write_file for small changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_str: { type: "string", description: "Exact existing text to find (must be unique in the file)" },
          new_str: { type: "string", description: "Replacement text" },
        },
        required: ["path", "old_str", "new_str"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the project root (e.g. npm install, npm run build, git status).",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search project source files for a regex pattern (like grep).",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          dir: { type: "string", description: "Relative directory to search in, default '.'" },
        },
        required: ["pattern"],
      },
    },
  },
];
