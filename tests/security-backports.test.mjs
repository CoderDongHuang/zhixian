import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { backports, digestTree, installBackports, projectRoot, sourceTree, verifyBackport } from "../scripts/security-backports.mjs";

const require = createRequire(import.meta.url);
const braces = require("braces");
for (const [label, input] of [
  ["braces", "{".repeat(4000) + "a" + "}".repeat(4000)],
  ["parentheses", "(".repeat(4000) + "a" + ")".repeat(4000)],
  ["mixed", "{(".repeat(1000) + "a" + ")}".repeat(1000)],
  ["unclosed", "{".repeat(4000)],
]) {
  for (const method of ["parse", "compile", "expand", "stringify"]) test(`braces backport rejects ${label} through ${method}`, () => {
    assert.throws(() => braces[method](input, { maxDepth: Infinity }), { name: "SyntaxError", message: /nesting depth/ });
  });
}

for (const method of ["compile", "expand", "stringify"]) test(`braces backport guards direct and cyclic AST through ${method}`, () => {
  let ast = { type: "text", value: "x", nodes: [] };
  for (let i = 0; i < 4000; i++) ast = { type: "root", nodes: [ast] };
  assert.throws(() => braces[method](ast), { name: "SyntaxError", message: /AST nesting depth/ });
  const cyclic = { type: "root", nodes: [] };
  cyclic.nodes.push(cyclic);
  assert.throws(() => braces[method](cyclic), { name: "SyntaxError", message: /AST nesting depth/ });
});

test("braces retains ranges, sets, escaping, quotes and safe-depth behavior", () => {
  assert.deepEqual(braces.expand("a/{b,c}/{1..3}"), ["a/b/1", "a/b/2", "a/b/3", "a/c/1", "a/c/2", "a/c/3"]);
  assert.deepEqual(braces.expand("'" + "{".repeat(200) + "'"), ["{".repeat(200)]);
  assert.deepEqual(braces.expand("\\{a,b\\}"), ["{a,b}"]);
  assert.doesNotThrow(() => braces.compile("{a,".repeat(99) + "a" + "}".repeat(99)));
  assert.equal(braces.expand("{a,".repeat(99) + "a" + "}".repeat(99)).length, 100);
  assert.throws(() => braces.parse("{".repeat(100)), SyntaxError);
});

test("backport verification rejects unknown nodes, changes, versions and missing installs", async () => {
  const backport = backports[0];
  const temporary = await mkdtemp(path.join(os.tmpdir(), "zhixian-backport-"));
  const node = `node_modules/${backport.name}`;
  try {
    await cp(path.join(projectRoot, node), path.join(temporary, node), { recursive: true });
    await writeFile(path.join(temporary, "package-lock.json"), JSON.stringify({ packages: { [node]: { version: backport.version } } }));
    assert.equal(digestTree(await sourceTree(path.join(temporary, node))), backport.patched);
    await verifyBackport(backport, [node], temporary);
    await installBackports(temporary);
    await assert.rejects(verifyBackport(backport, ["node_modules/unknown/braces"], temporary), /Unverified/);
    await writeFile(path.join(temporary, node, "lib/parse.js"), "module.exports = () => {};\n");
    await assert.rejects(verifyBackport(backport, [node], temporary), /missing or modified/);
    await assert.rejects(installBackports(temporary), /unknown source/);
    await writeFile(path.join(temporary, "package-lock.json"), JSON.stringify({ packages: { [node]: { version: "3.0.4" } } }));
    await assert.rejects(verifyBackport(backport, [node], temporary), /Unsupported/);
    await writeFile(path.join(temporary, "package-lock.json"), JSON.stringify({ packages: {} }));
    await assert.rejects(verifyBackport(backport, [node], temporary), /Missing locked/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
