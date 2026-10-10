import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const guard = "    if (depth > 100) throw new SyntaxError('AST nesting depth exceeds max depth (100)');\n";
export const backports = [{
  name: "braces", version: "3.0.3", source: 1240992,
  original: "9da0231e9d18c6dc4bfe24c1f445ff3efcd935547a9bf8b4947a79e05ddc3964",
  patched: "298464a62b9ee11fd0e4448fa37140dcd1e3c7c0916f145be109617225c05297",
  changes: {
    "lib/parse.js": [["    if (value === CHAR_LEFT_PARENTHESES) {", "    if (value === CHAR_LEFT_PARENTHESES) {\n      if (stack.length >= 100) throw new SyntaxError('Input nesting depth exceeds max depth (100)');"],
      ["    if (value === CHAR_LEFT_CURLY_BRACE) {", "    if (value === CHAR_LEFT_CURLY_BRACE) {\n      if (stack.length >= 100) throw new SyntaxError('Input nesting depth exceeds max depth (100)');"]],
    "lib/compile.js": [["  const walk = (node, parent = {}) => {", "  const walk = (node, parent = {}, depth = 0) => {\n" + guard.trimEnd()],
      ["walk(child, node)", "walk(child, node, depth + 1)"]],
    "lib/expand.js": [["  const walk = (node, parent = {}) => {", "  const walk = (node, parent = {}, depth = 0) => {\n" + guard.trimEnd()],
      ["walk(child, node)", "walk(child, node, depth + 1)"]],
    "lib/stringify.js": [["  const stringify = (node, parent = {}) => {", "  const stringify = (node, parent = {}, depth = 0) => {\n" + guard.trimEnd()],
      ["stringify(child)", "stringify(child, {}, depth + 1)"]],
  },
}, {
  name: "node-forge", version: "1.4.0", source: 1240912,
  original: "844b0c1402210f4d6d65ac0faceffa2f96f13c705ff284f1a527efa1a50f2d1d",
  patched: "10034d90cf080bafe171306d73f7a4d5aaad319d95a99a536e3964b46c06fa05",
  changes: {
    "lib/rsa.js": [["            obj.value.length !== 2) {", "            obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)) {"]],
  },
}];

// Hash the complete executable/JSON tree, not a patch marker or just the modified line.
export async function sourceTree(directory) {
  const files = new Map();
  async function visit(relative = "") {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${name}`);
      if (entry.isDirectory() && entry.name !== "node_modules") await visit(name);
      else if (entry.isFile() && /\.(?:js|cjs|mjs|json)$/.test(name)) files.set(name, await readFile(path.join(directory, name)));
    }
  }
  await visit();
  return files;
}

export function digestTree(files) {
  const hash = createHash("sha256");
  for (const name of [...files.keys()].sort()) {
    hash.update(name + "\0");
    hash.update(createHash("sha256").update(files.get(name)).digest());
  }
  return hash.digest("hex");
}

export function patchedTree(files, backport) {
  const updated = new Map(files);
  for (const [name, changes] of Object.entries(backport.changes)) {
    let value = files.get(name)?.toString("utf8");
    if (typeof value !== "string") throw new Error(`Missing source: ${name}`);
    for (const [before, after] of changes) {
      if (value.split(before).length !== 2) throw new Error(`Unexpected patch context: ${name}`);
      value = value.replace(before, after);
    }
    updated.set(name, Buffer.from(value));
  }
  return updated;
}

export async function installedInstances(backport, root = projectRoot) {
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const nodes = Object.keys(lock.packages).filter((name) => name.endsWith(`/node_modules/${backport.name}`) || name === `node_modules/${backport.name}`);
  if (!nodes.length) throw new Error(`Missing locked dependency: ${backport.name}`);
  for (const node of nodes) {
    const directory = path.resolve(root, node);
    if (!node.split("/").every((part) => part && part !== "." && part !== "..") || !directory.startsWith(path.resolve(root) + path.sep)) throw new Error("Unsafe dependency path");
    if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error(`Unexpected dependency link: ${node}`);
    const pkg = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    if (lock.packages[node].version !== backport.version || pkg.name !== backport.name || pkg.version !== backport.version) throw new Error(`Unsupported dependency version: ${node}`);
  }
  return nodes;
}

export async function verifyBackport(backport, reportedNodes, root = projectRoot) {
  const nodes = await installedInstances(backport, root);
  if (!Array.isArray(reportedNodes) || !reportedNodes.length || reportedNodes.some((node) => !nodes.includes(node))) throw new Error(`Unverified audit nodes: ${backport.name}`);
  for (const node of nodes) {
    if (digestTree(await sourceTree(path.join(root, node))) !== backport.patched) throw new Error(`Security backport missing or modified: ${node}`);
  }
  return { source: backport.source, name: backport.name, version: backport.version, nodes, sha256: backport.patched };
}

export async function installBackports(root = projectRoot) {
  for (const backport of backports) {
    for (const node of await installedInstances(backport, root)) {
      const directory = path.join(root, node);
      const files = await sourceTree(directory);
      const current = digestTree(files);
      if (current === backport.patched) continue;
      if (current !== backport.original) throw new Error(`Refusing to patch unknown source: ${node}`);
      const updated = patchedTree(files, backport);
      if (digestTree(updated) !== backport.patched) throw new Error(`Invalid security backport: ${node}`);
      for (const name of Object.keys(backport.changes)) await writeFile(path.join(directory, name), updated.get(name));
      console.log(`Applied security backport: ${backport.name}@${backport.version} advisory ${backport.source}`);
    }
    await verifyBackport(backport, await installedInstances(backport, root), root);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await installBackports();
