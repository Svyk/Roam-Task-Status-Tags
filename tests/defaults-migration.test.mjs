import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  STATUS_DEFAULTS_VERSION,
  migrateStatusListDefaults,
} from "../src/extension.js";

const v1List = [
  { key: "ACTIVE", name: "Active" },
  { key: "WAITING", name: "Waiting" },
  { key: "HOLDING", name: "Holding" },
  { key: "CANCELLED", name: "Cancelled" },
];

test("defaults version 2 appends In Review right after Waiting", () => {
  assert.equal(STATUS_DEFAULTS_VERSION, 2);
  const migrated = migrateStatusListDefaults(v1List, undefined);
  assert.deepEqual(
    migrated.map((entry) => entry.key),
    ["ACTIVE", "WAITING", "IN_REVIEW", "HOLDING", "CANCELLED"]
  );
  assert.equal(migrated[2].name, "In Review");
  assert.equal(v1List.length, 4);
});

test("In Review goes to the end when Waiting was removed", () => {
  const list = v1List.filter((entry) => entry.key !== "WAITING");
  const migrated = migrateStatusListDefaults(list, 1);
  assert.equal(migrated.at(-1).key, "IN_REVIEW");
});

test("an existing In Review name, any case or key, blocks the migration", () => {
  const list = [...v1List, { key: "CUSTOM_REVIEW", name: "in review" }];
  assert.equal(migrateStatusListDefaults(list, 1), list);
});

test("already-migrated installs are never re-added after a delete", () => {
  assert.equal(migrateStatusListDefaults(v1List, 2), v1List);
  assert.equal(migrateStatusListDefaults(v1List, "2"), v1List);
});

test("runtime persists the version and routes through the migration", async () => {
  const source = await readFile(new URL("../src/extension.js", import.meta.url), "utf8");
  assert.match(source, /defaultsVersion: "defaults-version"/);
  assert.match(source, /migrateStatusListDefaults\(normalized, storedVersion\)/);
  assert.match(source, /saveSetting\(SETTINGS_KEYS\.defaultsVersion, STATUS_DEFAULTS_VERSION\)/);
});

test("slash command and palette labels are built from the status label", async () => {
  const source = await readFile(new URL("../src/extension.js", import.meta.url), "utf8");
  assert.match(source, /`task status: \$\{status\.label\}`/);
  assert.match(source, /`Task Status: Set \$\{status\.label\}`/);
});
