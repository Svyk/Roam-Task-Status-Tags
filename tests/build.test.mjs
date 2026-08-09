import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { bundleEntry, verifyGeneratedArtifacts } from "../build.mjs";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

async function fixture(files) {
  const directory = await mkdtemp(resolve(tmpdir(), "roam-template-bundle-"));
  for (const [filename, content] of Object.entries(files)) {
    const target = resolve(directory, filename);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return directory;
}

test("build emits deterministic, matching browser ESM artifacts with a default export", async () => {
  await run(process.execPath, ["build.mjs"], { cwd: rootPath });
  const [rootJs, pagesJs, rootCss, pagesCss] = await Promise.all([
    readFile(new URL("../extension.js", import.meta.url), "utf8"),
    readFile(new URL("../deploy/extension.js", import.meta.url), "utf8"),
    readFile(new URL("../extension.css", import.meta.url), "utf8"),
    readFile(new URL("../deploy/extension.css", import.meta.url), "utf8"),
  ]);

  assert.equal(pagesJs, rootJs);
  assert.equal(pagesCss, rootCss);
  assert.doesNotMatch(rootJs, /sourceMappingURL/);
  assert.doesNotMatch(rootJs, /^import\s/m);
  assert.match(rootJs, /export\s*\{[\s\S]*default/);
  assert.match(rootJs, /BUNDLED_VERSION = (?:true \? )?"0\.3\.0"/);
  assert.doesNotMatch(rootJs, /__TASK_STATUS_VERSION__/);
  const rebuilt = await bundleEntry({
    rootDirectory: rootPath,
    banner: "/* Roam Task Status Tags v0.3.0 | generated; edit src/ */",
    version: "0.3.0",
  });
  assert.equal(rebuilt, rootJs);

  await run(process.execPath, ["--check", resolve(rootPath, "extension.js")]);
  const loaded = await import(`${pathToFileURL(resolve(rootPath, "extension.js")).href}?test=${Date.now()}`);
  assert.equal(typeof loaded.default.onload, "function");
  assert.equal(typeof loaded.default.onunload, "function");
});

test("esbuild bundles legitimate relative source modules", async () => {
  const directory = await fixture({
    "src/message.js": 'export const message = "hello";\n',
    "src/index.js": 'import { message } from "./message.js";\nexport default { onload: () => message, onunload: () => {} };\n',
  });
  try {
    const output = await bundleEntry({ rootDirectory: directory, entryPoint: "src/index.js" });
    assert.match(output, /hello/);
    assert.match(output, /export\s*\{[\s\S]*default/);
    assert.doesNotMatch(output, /^import\s/m);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function assertBundleFailure(source, expected) {
  const directory = await fixture({ "src/index.js": source });
  try {
    await assert.rejects(
      bundleEntry({ rootDirectory: directory, entryPoint: "src/index.js" }),
      expected,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("browser bundle rejects an unresolved package hidden after same-line code", async () => {
  await assertBundleFailure(
    'const marker = 1; import value from "definitely-not-installed-roam-template-package"; export default { marker, value };',
    /Could not resolve/,
  );
});

test("browser bundle rejects a Node built-in", async () => {
  await assertBundleFailure(
    'import fs from "node:fs"; export default fs;',
    /Could not resolve "node:fs"|not built into browser/i,
  );
});

test("browser bundle rejects a remote import hidden after a comment prefix", async () => {
  await assertBundleFailure(
    '/* hidden prefix */ import value from "https://example.com/module.js"; export default value;',
    /Remote import is not allowed/,
  );
});

test("build.sh performs a clean locked install and builds from another working directory", async () => {
  const temporaryParent = await mkdtemp(resolve(tmpdir(), "roam-template-clean-"));
  const checkout = resolve(temporaryParent, "checkout");
  const elsewhere = resolve(temporaryParent, "elsewhere");
  try {
    await cp(rootPath, checkout, {
      recursive: true,
      filter: (source) => ![".git", "node_modules"].includes(basename(source)),
    });
    await mkdir(elsewhere);
    const { stdout } = await run(resolve(checkout, "build.sh"), [], {
      cwd: elsewhere,
      timeout: 60_000,
    });
    assert.match(stdout, /Built extension\.js/);
    await access(resolve(checkout, "node_modules/esbuild/package.json"));
    await verifyGeneratedArtifacts(checkout);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});

test("generated artifact verification detects drift", async () => {
  const temporaryParent = await mkdtemp(resolve(tmpdir(), "roam-template-drift-"));
  const copyPath = resolve(temporaryParent, "repository");
  try {
    await cp(rootPath, copyPath, {
      recursive: true,
      filter: (source) => ![".git", "node_modules"].includes(basename(source)),
    });
    await writeFile(resolve(copyPath, "extension.js"), "// stale\n", "utf8");
    await assert.rejects(verifyGeneratedArtifacts(copyPath), /artifact drift/i);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});
