import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CARRY_OVER_STATUS_NAMES,
  createRepeatStatusReset,
  formatCarryOverSetting,
  parseCarryOverSetting,
  resetTagTitles,
  seriesParentFromProps,
} from "../src/repeat-status-reset.js";

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

// Fake graph: tag pages by title, blocks by uid, entity ids for the reverse
// refs a watch reports. A block's props appear after `propsAfterPulls`
// pulls, which is how Better Tasks writes `rt` last.
function fakeEnv({ pages = {}, blocks = {}, betterTasks = "v2", t0 = 1_000_000 } = {}) {
  const clock = { t: t0 };
  const watches = [];
  const removed = [];
  const requests = [];
  const pullCounts = new Map();
  const idToUid = new Map();
  let nextId = 100;
  const entityId = (uid) => {
    for (const [id, u] of idToUid) if (u === uid) return id;
    nextId += 1;
    idToUid.set(nextId, uid);
    return nextId;
  };
  for (const uid of Object.keys(blocks)) entityId(uid);

  const roamAlphaAPI = {
    data: {
      pull(_pattern, lookup) {
        if (Array.isArray(lookup) && lookup[0] === ":node/title") {
          const uid = pages[lookup[1]];
          return uid ? { ":block/uid": uid } : null;
        }
        const uid = idToUid.get(lookup);
        return uid ? { ":block/uid": uid } : null;
      },
      async: {
        async pull(_pattern, [, uid]) {
          const block = blocks[uid];
          if (!block) return null;
          const count = (pullCounts.get(uid) || 0) + 1;
          pullCounts.set(uid, count);
          const hasProps = count > (block.propsAfterPulls ?? 0);
          return {
            ":block/uid": uid,
            ":block/string": block.string,
            ":create/time": block.created,
            ":block/props": hasProps ? block.props : undefined,
          };
        },
      },
      addPullWatch(pattern, lookup, callback) {
        watches.push({ pattern, uid: lookup[1], callback });
      },
      removePullWatch(pattern, lookup, callback) {
        removed.push(lookup[1]);
        const index = watches.findIndex((w) => w.uid === lookup[1] && w.callback === callback);
        if (index >= 0) watches.splice(index, 1);
      },
    },
  };

  const v2 = {
    classifyBlock: () => ({}),
    async requestStatusTag(uid, options) {
      requests.push({ uid, ...options });
      return { status: "updated" };
    },
  };
  const windowLike = {};
  if (betterTasks === "v2") windowLike.betterTasks = { v2 };
  else if (betterTasks === "none") {
    /* absent */
  }

  const refsOf = (uids) => ({ ":block/_refs": uids.map((uid) => ({ ":db/id": entityId(uid) })) });
  return {
    clock,
    watches,
    removed,
    requests,
    roamAlphaAPI,
    windowLike,
    pullCounts,
    fire(pageUid, beforeUids, afterUids) {
      const watch = watches.find((w) => w.uid === pageUid);
      assert.ok(watch, `no watch on ${pageUid}`);
      watch.callback(beforeUids === null ? null : refsOf(beforeUids), refsOf(afterUids));
    },
    make(options = {}) {
      return createRepeatStatusReset({
        roamAlphaAPI,
        windowLike,
        getResetTagTitles: () => ["task-status/Active", "task-status/Series", "task-status/Gone"],
        now: () => clock.t,
        setTimer: (fn, ms) => {
          clock.t += ms;
          queueMicrotask(fn);
          return 1;
        },
        clearTimer: () => {},
        ...options,
      });
    },
  };
}

const SPAWN_STRING = "{{[[TODO]]}} #[[task-status/Active]] Water plants";
const PROPS = { rt: { id: "r1", parent: "series-1", tz: "UTC" } };

test("parseCarryOverSetting handles defaults, empty, dedupe, separators", () => {
  assert.deepEqual(parseCarryOverSetting(null), [...DEFAULT_CARRY_OVER_STATUS_NAMES]);
  assert.deepEqual(parseCarryOverSetting(undefined), [...DEFAULT_CARRY_OVER_STATUS_NAMES]);
  assert.equal(DEFAULT_CARRY_OVER_STATUS_NAMES.length, 7);
  assert.deepEqual(parseCarryOverSetting(""), []);
  assert.deepEqual(parseCarryOverSetting("Series, series,  MOVIE\nWatching,,"), [
    "Series",
    "MOVIE",
    "Watching",
  ]);
  assert.equal(formatCarryOverSetting(["a", "A", "b"]), "a, b");
});

test("resetTagTitles excludes carry-over by name in any case", () => {
  const titles = resetTagTitles(["Active", "Series", "waiting", "MOVIE", "Active"], "series, Movie");
  assert.deepEqual(titles, ["task-status/Active", "task-status/waiting"]);
  assert.deepEqual(resetTagTitles(["Series", "Active"], null), ["task-status/Active"]);
  assert.deepEqual(resetTagTitles(["Series"], ""), ["task-status/Series"]);
});

test("seriesParentFromProps reads every props shape", () => {
  assert.equal(seriesParentFromProps({ rt: { parent: "p" } }), "p");
  assert.equal(seriesParentFromProps({ ":rt": { ":parent": "p" } }), "p");
  assert.equal(seriesParentFromProps(JSON.stringify({ rt: { parent: "p" } })), "p");
  assert.equal(seriesParentFromProps("not json"), null);
  assert.equal(seriesParentFromProps({ rt: { id: "x" } }), null);
  assert.equal(seriesParentFromProps(undefined), null);
});

test("sync registers one watch per existing page, skips missing, is idempotent", () => {
  const env = fakeEnv({ pages: { "task-status/Active": "pg-active", "task-status/Series": "pg-series" } });
  const reset = env.make();
  reset.sync();
  assert.deepEqual(env.watches.map((w) => w.uid).sort(), ["pg-active", "pg-series"]);
  assert.deepEqual(reset.watchedTitles().sort(), ["task-status/Active", "task-status/Series"]);
  reset.sync();
  reset.sync();
  assert.equal(env.watches.length, 2);
});

test("sync picks up a page created later and unwatches titles dropped from the list", () => {
  const pages = { "task-status/Active": "pg-active" };
  const env = fakeEnv({ pages });
  let titles = ["task-status/Active", "task-status/Gone"];
  const reset = env.make({ getResetTagTitles: () => titles });
  reset.sync();
  assert.equal(env.watches.length, 1);
  pages["task-status/Gone"] = "pg-gone";
  reset.sync();
  assert.equal(env.watches.length, 2);
  titles = ["task-status/Gone"];
  reset.sync();
  assert.deepEqual(env.watches.map((w) => w.uid), ["pg-gone"]);
  assert.deepEqual(env.removed, ["pg-active"]);
});

test("dispose removes all watches", () => {
  const env = fakeEnv({ pages: { "task-status/Active": "pg-active", "task-status/Gone": "pg-gone" } });
  const reset = env.make();
  reset.sync();
  reset.dispose();
  assert.equal(env.watches.length, 0);
  assert.equal(env.removed.length, 2);
  reset.sync();
  assert.equal(env.watches.length, 0);
});

test("a spawned occurrence loses its tag with exactly one request", async () => {
  const env = fakeEnv({
    pages: { "task-status/Active": "pg-active" },
    blocks: {
      new1: { string: SPAWN_STRING, created: 1_000_000 - 200, props: PROPS, propsAfterPulls: 2 },
      done1: { string: "{{[[DONE]]}} #[[task-status/Active]] Water plants", created: 1, props: PROPS },
    },
  });
  const reset = env.make();
  reset.sync();
  env.fire("pg-active", ["done1"], ["done1", "new1"]);
  await flush();
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].uid, "new1");
  assert.equal(env.requests[0].statusTagTitle, null);
  assert.equal(env.requests[0].expectedString, SPAWN_STRING);
  assert.ok(env.pullCounts.get("new1") >= 3);
  assert.equal(env.pullCounts.get("done1") ?? 0, 0);
  assert.ok(env.requests.every((r) => r.uid !== "done1"));
});

test("a carry-over status is not watched and writes nothing", async () => {
  const env = fakeEnv({
    pages: { "task-status/Series": "pg-series" },
    blocks: { s1: { string: "{{[[TODO]]}} #[[task-status/Series]] Show", created: 999_900, props: PROPS } },
  });
  const reset = env.make({ getResetTagTitles: () => ["task-status/Active"] });
  reset.sync();
  assert.equal(env.watches.length, 0);
  assert.equal(env.requests.length, 0);
  const direct = await reset.handle("s1", env.clock.t);
  assert.equal(direct.reason, "carries-over");
  assert.equal(env.requests.length, 0);
});

test("an old block gaining a ref is not touched", async () => {
  const env = fakeEnv({
    pages: { "task-status/Active": "pg-active" },
    blocks: { old1: { string: SPAWN_STRING, created: 1_000_000 - 60_000, props: PROPS } },
  });
  const reset = env.make();
  reset.sync();
  env.fire("pg-active", [], ["old1"]);
  await flush();
  assert.equal(env.requests.length, 0);
});

test("a new block with the tag but no rt.parent is left alone", async () => {
  const env = fakeEnv({
    pages: { "task-status/Active": "pg-active" },
    blocks: { typed: { string: SPAWN_STRING, created: 1_000_000 - 50, props: undefined } },
  });
  const reset = env.make();
  reset.sync();
  env.fire("pg-active", [], ["typed"]);
  await flush();
  assert.equal(env.requests.length, 0);
  assert.ok(env.pullCounts.get("typed") > 1);
});

test("the same uid seen twice still gives one write", async () => {
  const env = fakeEnv({
    pages: { "task-status/Active": "pg-active" },
    blocks: { new1: { string: SPAWN_STRING, created: 1_000_000 - 50, props: PROPS } },
  });
  const reset = env.make();
  reset.sync();
  env.fire("pg-active", [], ["new1"]);
  env.fire("pg-active", [], ["new1"]);
  await flush();
  env.fire("pg-active", ["new1"], []);
  env.fire("pg-active", [], ["new1"]);
  await flush();
  assert.equal(env.requests.length, 1);
});

test("a baseline fire with no before state does nothing", async () => {
  const env = fakeEnv({
    pages: { "task-status/Active": "pg-active" },
    blocks: { new1: { string: SPAWN_STRING, created: 1_000_000 - 50, props: PROPS } },
  });
  const reset = env.make();
  reset.sync();
  env.fire("pg-active", null, ["new1"]);
  await flush();
  assert.equal(env.requests.length, 0);
});

test("without Better Tasks v2 nothing is written", async () => {
  const env = fakeEnv({
    pages: { "task-status/Active": "pg-active" },
    blocks: { new1: { string: SPAWN_STRING, created: 1_000_000 - 50, props: PROPS } },
    betterTasks: "none",
  });
  const reset = env.make();
  reset.sync();
  const result = await reset.handle("new1", env.clock.t);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "better-tasks-v2-required");
  assert.equal(env.requests.length, 0);
});

test("a DONE block is not touched", async () => {
  const env = fakeEnv({
    pages: { "task-status/Active": "pg-active" },
    blocks: {
      d1: { string: "{{[[DONE]]}} #[[task-status/Active]] Water plants", created: 1_000_000 - 50, props: PROPS },
    },
  });
  const reset = env.make();
  reset.sync();
  env.fire("pg-active", [], ["d1"]);
  await flush();
  assert.equal(env.requests.length, 0);
});

test("props arrive in every shape", async () => {
  const shapes = [
    { rt: { parent: "s" } },
    { ":rt": { ":parent": "s" } },
    JSON.stringify({ rt: { parent: "s" } }),
  ];
  for (const [index, props] of shapes.entries()) {
    const env = fakeEnv({
      pages: { "task-status/Active": "pg-active" },
      blocks: { b: { string: SPAWN_STRING, created: 1_000_000 - 50, props, propsAfterPulls: index } },
    });
    const reset = env.make();
    reset.sync();
    env.fire("pg-active", [], ["b"]);
    await flush();
    assert.equal(env.requests.length, 1, `shape ${index}`);
  }
});
