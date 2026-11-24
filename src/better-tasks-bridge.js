function callable(value, name) {
  return value && typeof value[name] === "function";
}

export function resolveBetterTasksProvider(windowLike) {
  const namespace = windowLike?.betterTasks;
  const v2 = namespace?.v2;
  if (callable(v2, "classifyBlock") && callable(v2, "requestStatusTag")) {
    return { kind: "v2", capability: v2 };
  }
  const v1 = namespace?.v1;
  if (callable(v1, "classifyBlock")) {
    return { kind: "v1", capability: v1 };
  }
  const legacy = windowLike?.RoamExtensionTools?.["better-tasks"];
  if (namespace != null || legacy != null) return { kind: "legacy", capability: null };
  return { kind: "absent", capability: null };
}

function routed(status, fields = {}) {
  return { status, didWrite: status === "updated", ...fields };
}

export function createBetterTasksStatusRouter({
  windowLike,
  directWriter,
  activityRecorder = null,
  readChildStrings = null,
}) {
  if (!directWriter || typeof directWriter.apply !== "function") {
    throw new TypeError("directWriter.apply is required");
  }
  if (activityRecorder != null && typeof activityRecorder.record !== "function") {
    throw new TypeError("activityRecorder.record must be a function");
  }
  if (readChildStrings != null && typeof readChildStrings !== "function") {
    throw new TypeError("readChildStrings must be a function");
  }

  // Better Tasks v2 `requestStatusTag` certifies the string change but records
  // no activity-log event. Append the one line ourselves, unless Better Tasks
  // reports that it already did (`activity` present on its result).
  async function recordActivity(outcome, { uid, expectedString, nextString, statusTagTitle, userUid }) {
    if (!activityRecorder || outcome?.status !== "updated") return outcome;
    if (outcome.activity !== undefined) return outcome;
    let activity;
    try {
      const recordArgs = {
        uid,
        previousString: expectedString,
        nextString: typeof outcome.string === "string" ? outcome.string : nextString,
        statusTagTitle,
      };
      if (typeof userUid === "string" && userUid.trim()) {
        recordArgs.userUid = userUid.trim();
      }
      activity = await activityRecorder.record(recordArgs);
    } catch (error) {
      activity = { recorded: false, reason: "activity-recorder-threw", error };
    }
    return { ...outcome, activity };
  }

  return Object.freeze({
    async apply({
      uid,
      expectedString,
      nextString,
      statusTagTitle,
      expectedLiveEditorString,
      editorString,
      userUid,
      requireExistingTask = false,
      requireBetterTasksReady = false,
    }) {
      const editorOptions =
        expectedLiveEditorString === undefined && editorString === undefined
          ? {}
          : { expectedLiveEditorString, editorString };
      const normalizedUserUid =
        typeof userUid === "string" && userUid.trim() ? userUid.trim() : null;
      const directExtra = {};
      if (normalizedUserUid) directExtra.userUid = normalizedUserUid;
      if (requireExistingTask) directExtra.requireExistingTask = true;

      const provider = resolveBetterTasksProvider(windowLike);
      if (provider.kind === "absent") {
        if (requireBetterTasksReady) {
          if (typeof readChildStrings !== "function") {
            return routed("unknown", { reason: "better-tasks-children-read-unavailable" });
          }
          let childStrings;
          try {
            childStrings = await readChildStrings(uid);
          } catch (error) {
            return routed("unknown", { reason: "better-tasks-children-read-failed", error });
          }
          if (
            Array.isArray(childStrings) &&
            childStrings.some(
              (child) => typeof child === "string" && child.trimStart().startsWith("BT_attr")
            )
          ) {
            return routed("rejected", { reason: "better-tasks-not-ready" });
          }
        }
        return directWriter.apply({
          uid,
          expectedString,
          nextString,
          ...editorOptions,
          ...directExtra,
        });
      }
      if (provider.kind === "legacy") {
        return routed("rejected", { reason: "better-tasks-capability-unavailable" });
      }

      let classification;
      try {
        classification = await provider.capability.classifyBlock(uid);
        if (classification?.kind === "ordinary") {
          classification = await provider.capability.classifyBlock(uid, {
            includeDescendants: true,
          });
        }
      } catch (error) {
        return routed("unknown", { reason: "better-tasks-classification-failed", error });
      }
      if (!classification || classification.kind === "unknown") {
        return routed("unknown", {
          reason: classification?.reason || "better-tasks-classification-unknown",
          classification,
        });
      }
      if (classification.kind === "task-owned") {
        return routed("rejected", { reason: "better-tasks-owned-child", classification });
      }
      if (classification.kind === "ordinary") {
        if (classification.containsManagedTasks) {
          return routed("rejected", {
            reason: "contains-better-tasks-descendants",
            classification,
          });
        }
        return directWriter.apply({
          uid,
          expectedString,
          nextString,
          ...editorOptions,
          ...directExtra,
        });
      }
      if (classification.kind !== "task") {
        return routed("unknown", { reason: "unsupported-classification", classification });
      }
      if (provider.kind !== "v2") {
        return routed("rejected", {
          reason: "better-tasks-v2-required",
          classification,
        });
      }

      let outcome;
      try {
        outcome = await provider.capability.requestStatusTag(uid, {
          expectedString,
          statusTagTitle,
          source: "task-status-tags",
          ...editorOptions,
        });
      } catch (error) {
        return routed("unknown", { reason: "better-tasks-status-request-failed", error });
      }
      return recordActivity(outcome, {
        uid,
        expectedString,
        nextString,
        statusTagTitle,
        userUid: normalizedUserUid,
      });
    },
  });
}
