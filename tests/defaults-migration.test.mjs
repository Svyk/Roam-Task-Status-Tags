import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MEDIA_STATUS_DEFAULTS,
  STATUS_DEFAULTS_VERSION,
  migrateStatusListDefaults,
  nextTaskCycleStatus,
} from "../src/extension.js";
import { isMediaStatus } from "../src/status-checkbox.js";

const v1List = [
  { key: "ACTIVE", name: "Active" },
  { key: "WAITING", name: "Waiting" },
  { key: "HOLDING", name: "Holding" },
  { key: "CANCELLED", name: "Cancelled" },
];

const mediaKeys = ["SERIES", "MOVIE", "WATCHING", "WATCHLIST", "UPCOMING", "REWATCH", "DROPPED"];

test("defaults version 3 appends In Review and then the media statuses", () => {
  assert.equal(STATUS_DEFAULTS_VERSION, 3);
  assert.deepEqual(MEDIA_STATUS_DEFAULTS.map((entry) => entry.key), mediaKeys);
  assert.equal(Object.isFrozen(MEDIA_STATUS_DEFAULTS), true);
  const migrated = migrateStatusListDefaults(v1List, undefined);
  assert.deepEqual(
    migrated.map((entry) => entry.key),
    ["ACTIVE", "WAITING", "IN_REVIEW", "HOLDING", "CANCELLED", ...mediaKeys]
  );
  assert.equal(migrated[2].name, "In Review");
  assert.equal(migrated.at(-1).name, "Dropped");
  assert.equal(v1List.length, 4);
});

test("In Review goes to the end of the task statuses when Waiting was removed", () => {
  const list = v1List.filter((entry) => entry.key !== "WAITING");
  const migrated = migrateStatusListDefaults(list, 1);
  assert.equal(migrated[list.length].key, "IN_REVIEW");
  assert.equal(migrated.at(-1).key, "DROPPED");
});

test("an existing In Review name, any case or key, blocks only that entry", () => {
  const list = [...v1List, { key: "CUSTOM_REVIEW", name: "in review" }];
  const migrated = migrateStatusListDefaults(list, 1);
  assert.equal(migrated.filter((entry) => /review/i.test(entry.name)).length, 1);
  assert.deepEqual(migrated.slice(-7).map((entry) => entry.key), mediaKeys);
});

test("a version 2 list gets only the media statuses", () => {
  const migrated = migrateStatusListDefaults(v1List, 2);
  assert.deepEqual(migrated.slice(0, 4), v1List);
  assert.deepEqual(migrated.slice(4).map((entry) => entry.key), mediaKeys);
  assert.equal(v1List.length, 4);
});

test("a hand-added Series keeps its key and no duplicate is added", () => {
  const list = [...v1List, { key: "CUSTOM_SERIES", name: "series" }];
  const migrated = migrateStatusListDefaults(list, 2);
  assert.deepEqual(migrated[4], { key: "CUSTOM_SERIES", name: "series" });
  assert.equal(migrated.length, 4 + 1 + 6);
  assert.equal(migrated.some((entry) => entry.key === "SERIES"), false);
  assert.deepEqual(migrated.slice(5).map((entry) => entry.key), mediaKeys.slice(1));
});

test("version 3 and fully populated lists return the same reference", () => {
  assert.equal(migrateStatusListDefaults(v1List, 3), v1List);
  assert.equal(migrateStatusListDefaults(v1List, "3"), v1List);
  const full = [...v1List, ...MEDIA_STATUS_DEFAULTS.map((entry) => ({ ...entry }))];
  assert.equal(migrateStatusListDefaults(full, 2), full);
  assert.equal(migrateStatusListDefaults("nope", 1), "nope");
});

test("migration never mutates its input", () => {
  const list = v1List.map((entry) => ({ ...entry }));
  const snapshot = JSON.stringify(list);
  migrateStatusListDefaults(list, 1);
  migrateStatusListDefaults(list, 2);
  assert.equal(JSON.stringify(list), snapshot);
});

test("cycling walks task statuses only and skips media", () => {
  const order = ["ACTIVE", "WAITING", "SERIES", "CANCELLED", "CUSTOM_TV", "MOVIE"];
  const names = { CUSTOM_TV: "Watchlist" };
  const media = (key) => isMediaStatus(key, names[key]);
  assert.equal(nextTaskCycleStatus(order, null, media), "ACTIVE");
  assert.equal(nextTaskCycleStatus(order, "ACTIVE", media), "WAITING");
  assert.equal(nextTaskCycleStatus(order, "WAITING", media), "CANCELLED");
  assert.equal(nextTaskCycleStatus(order, "CANCELLED", media), null);
  assert.equal(nextTaskCycleStatus(order, "SERIES", media), "ACTIVE");
  assert.equal(nextTaskCycleStatus(order, "CUSTOM_TV", media), "ACTIVE");
  assert.equal(nextTaskCycleStatus(["SERIES", "MOVIE"], null, media), null);
  assert.equal(nextTaskCycleStatus(["ACTIVE", "WAITING"], "ACTIVE"), "WAITING");
});

test("the runtime wrapper and chooser use the media-aware helpers", async () => {
  const source = await readFile(new URL("../src/extension.js", import.meta.url), "utf8");
  assert.match(source, /nextTaskCycleStatus\(CONFIG\.cycleOrder, currentStatus, statusIsMedia\)/);
  assert.match(source, /bp3-menu-divider ts-status-choice-divider/);
  assert.match(source, /setAttribute\("role", "separator"\)/);
  assert.match(source, /appendChoices\(activeKeys\.filter\(\(key\) => !statusIsMedia\(key\)\)\)/);
  assert.match(source, /statusNames: getStatusNameMap\(\)/);
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
