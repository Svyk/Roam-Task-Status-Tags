export const BLOCK_STRING_PULL_PATTERN = "[:block/uid :block/string]";

function valueAt(value, keyword, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = keyword.replace(/^:/, "");
  return value[keyword] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}

export function createFreshBlockStringReader(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  if (typeof pull !== "function") {
    throw new TypeError("roamAlphaAPI.data.async.pull is required");
  }
  return async (uid) => {
    const value = await pull.call(
      roamAlphaAPI.data.async,
      BLOCK_STRING_PULL_PATTERN,
      [":block/uid", uid]
    );
    const pulledUid = valueAt(value, ":block/uid", null);
    const string = valueAt(value, ":block/string", null);
    if (pulledUid !== uid || typeof string !== "string") return null;
    return string;
  };
}

function result(status, fields = {}) {
  return { status, didWrite: status === "updated", ...fields };
}

async function certify({ uid, expectedString, nextString, readFresh, writeError = null }) {
  let observed;
  try {
    observed = await readFresh(uid);
  } catch (error) {
    return result("unknown", {
      reason: "post-write-read-failed",
      error: writeError || error,
    });
  }
  if (observed === nextString) {
    return result("updated", {
      reason: writeError ? "write-threw-after-commit" : "certified",
      string: observed,
    });
  }
  if (observed === expectedString) {
    return result("not-updated", {
      reason: writeError ? "write-failed-before-commit" : "write-not-observed",
      error: writeError || undefined,
      string: observed,
    });
  }
  return result("conflict", {
    reason: observed == null ? "block-missing-after-write" : "third-state-after-write",
    error: writeError || undefined,
    string: observed,
  });
}

export function createCertifiedBlockStringWriter({
  readFresh,
  updateBlock,
  getLiveEditorString = () => null,
}) {
  if (typeof readFresh !== "function") throw new TypeError("readFresh must be a function");
  if (typeof updateBlock !== "function") throw new TypeError("updateBlock must be a function");
  if (typeof getLiveEditorString !== "function") {
    throw new TypeError("getLiveEditorString must be a function");
  }

  return Object.freeze({
    async apply({
      uid,
      expectedString,
      nextString,
      expectedLiveEditorString,
      editorString,
    }) {
      if (typeof uid !== "string" || !uid.trim()) {
        return result("rejected", { reason: "invalid-uid" });
      }
      if (typeof expectedString !== "string" || typeof nextString !== "string") {
        return result("rejected", { reason: "invalid-string" });
      }

      let before;
      try {
        before = await readFresh(uid);
      } catch (error) {
        return result("unknown", { reason: "pre-write-read-failed", error });
      }
      if (before == null) return result("rejected", { reason: "block-not-found" });
      if (before !== expectedString) {
        return result("conflict", { reason: "stale-expected-string", string: before });
      }

      const hasEditorHandoff =
        expectedLiveEditorString !== undefined || editorString !== undefined;
      if (
        hasEditorHandoff &&
        (typeof expectedLiveEditorString !== "string" || typeof editorString !== "string")
      ) {
        return result("rejected", { reason: "invalid-editor-handoff" });
      }
      if (hasEditorHandoff) {
        const live = getLiveEditorString(uid);
        if (live !== expectedLiveEditorString && live !== editorString) {
          return result("conflict", {
            reason: "active-editor-diverged",
            string: typeof live === "string" ? live : null,
          });
        }
      }
      if (nextString === expectedString) {
        return result("unchanged", { reason: "already-current", string: before });
      }

      try {
        await updateBlock(uid, nextString);
      } catch (error) {
        return certify({ uid, expectedString, nextString, readFresh, writeError: error });
      }
      return certify({ uid, expectedString, nextString, readFresh });
    },
  });
}
