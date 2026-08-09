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

export function createBetterTasksStatusRouter({ windowLike, directWriter }) {
  if (!directWriter || typeof directWriter.apply !== "function") {
    throw new TypeError("directWriter.apply is required");
  }

  return Object.freeze({
    async apply({
      uid,
      expectedString,
      nextString,
      statusTagTitle,
      expectedLiveEditorString,
      editorString,
    }) {
      const editorOptions =
        expectedLiveEditorString === undefined && editorString === undefined
          ? {}
          : { expectedLiveEditorString, editorString };
      const provider = resolveBetterTasksProvider(windowLike);
      if (provider.kind === "absent") {
        return directWriter.apply({
          uid,
          expectedString,
          nextString,
          ...editorOptions,
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

      try {
        return await provider.capability.requestStatusTag(uid, {
          expectedString,
          statusTagTitle,
          source: "task-status-tags",
          ...editorOptions,
        });
      } catch (error) {
        return routed("unknown", { reason: "better-tasks-status-request-failed", error });
      }
    },
  });
}
