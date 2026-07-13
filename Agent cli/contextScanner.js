import fs from "fs";
import path from "path";

const IGNORE = new Set(["node_modules", ".git", "dist", "build", ".agent", "Agent cli"]);

function walk(dir, depth, maxDepth, prefix = "") {
  if (depth > maxDepth) return "";
  let out = "";
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return "";
  }
  entries = entries.filter((e) => !IGNORE.has(e.name) && !e.name.startsWith("."));
  for (const entry of entries) {
    out += `${prefix}${entry.isDirectory() ? entry.name + "/" : entry.name}\n`;
    if (entry.isDirectory()) {
      out += walk(path.join(dir, entry.name), depth + 1, maxDepth, prefix + "  ");
    }
  }
  return out;
}

export function buildProjectContext(root = process.cwd()) {
  let context = "## Project file tree (depth 3)\n";
  context += walk(root, 0, 3);

  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      context += "\n## package.json summary\n";
      context += `name: ${pkg.name}\n`;
      if (pkg.scripts) context += `scripts: ${JSON.stringify(pkg.scripts)}\n`;
      if (pkg.dependencies) context += `dependencies: ${Object.keys(pkg.dependencies).join(", ")}\n`;
    } catch {
      // ignore malformed package.json
    }
  }

  return context;
}
