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

for (const backport of backports) test(`${backport.name} verification rejects unknown nodes, changes, versions and missing installs`, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "zhixian-backport-"));
  const node = `node_modules/${backport.name}`;
  try {
    const packages = {};
    for (const item of backports) {
      const itemNode = `node_modules/${item.name}`;
      await cp(path.join(projectRoot, itemNode), path.join(temporary, itemNode), { recursive: true });
      packages[itemNode] = { version: item.version };
    }
    await writeFile(path.join(temporary, "package-lock.json"), JSON.stringify({ packages }));
    assert.equal(digestTree(await sourceTree(path.join(temporary, node))), backport.patched);
    await verifyBackport(backport, [node], temporary);
    await installBackports(temporary);
    await assert.rejects(verifyBackport(backport, [`node_modules/unknown/${backport.name}`], temporary), /Unverified/);
    const changedFile = Object.keys(backport.changes)[0];
    await writeFile(path.join(temporary, node, changedFile), "module.exports = () => {};\n");
    await assert.rejects(verifyBackport(backport, [node], temporary), /missing or modified/);
    await assert.rejects(installBackports(temporary), /unknown source/);
    await writeFile(path.join(temporary, "package-lock.json"), JSON.stringify({ packages: { [node]: { version: "0.0.0" } } }));
    await assert.rejects(verifyBackport(backport, [node], temporary), /Unsupported/);
    await writeFile(path.join(temporary, "package-lock.json"), JSON.stringify({ packages: {} }));
    await assert.rejects(verifyBackport(backport, [node], temporary), /Missing locked/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("clean source and nested duplicates are patched deterministically and idempotently", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "zhixian-clean-backport-"));
  try {
    const packages = {};
    for (const backport of backports) {
      for (const node of [`node_modules/${backport.name}`, `node_modules/fixture/node_modules/${backport.name}`]) {
        await cp(path.join(projectRoot, `node_modules/${backport.name}`), path.join(temporary, node), { recursive: true });
        const files = await sourceTree(path.join(temporary, node));
        for (const [name, changes] of Object.entries(backport.changes)) {
          let value = files.get(name).toString("utf8");
          for (const [before, after] of [...changes].reverse()) value = value.replace(after, before);
          await writeFile(path.join(temporary, node, name), value);
        }
        assert.equal(digestTree(await sourceTree(path.join(temporary, node))), backport.original);
        packages[node] = { version: backport.version };
      }
    }
    await writeFile(path.join(temporary, "package-lock.json"), JSON.stringify({ packages }));
    await installBackports(temporary);
    await installBackports(temporary);
    for (const backport of backports) {
      const evidence = await verifyBackport(backport, Object.keys(packages).filter((node) => node.endsWith(`/${backport.name}`)), temporary);
      assert.equal(evidence.nodes.length, 2);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
