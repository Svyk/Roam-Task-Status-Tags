import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { scanSecrets } from "../scripts/scan-secrets.mjs";

test("secret scanner finds credentials and permits documented synthetic false positives", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "roam-template-secrets-"));
  const synthetic = ["sk", "-", "A".repeat(24)].join("");
  const fixture = resolve(root, "fixture.txt");
  try {
    await writeFile(fixture, `${synthetic}\n`, "utf8");
    const failed = await scanSecrets(root);
    assert.deepEqual(failed.findings.map(({ rule }) => rule), ["openai-key"]);

    await writeFile(
      fixture,
      `# secret-scan: allow openai-key -- synthetic test fixture only\n${synthetic}\n`,
      "utf8",
    );
    const allowed = await scanSecrets(root);
    assert.equal(allowed.findings.length, 0);
    assert.equal(allowed.allowances.length, 1);
    assert.equal(allowed.allowances[0].reason, "synthetic test fixture only");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


