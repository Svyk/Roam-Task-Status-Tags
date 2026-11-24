export const EXTENSION_ID_NEEDLE = "roam-task-status-tags";

function normalizeId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function findExtensionSettingsCandidates({ depot, extensionId = null } = {}) {
  const candidates = [];
  const seen = new Set();
  const addCandidate = (value) => {
    const id = normalizeId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    candidates.push(id);
  };

  addCandidate(extensionId);

  if (typeof depot?.getInstalledExtensions !== "function") {
    return candidates;
  }

  let installed;
  try {
    installed = depot.getInstalledExtensions();
  } catch (_) {
    return candidates;
  }

  if (!installed || typeof installed !== "object") {
    return candidates;
  }

  const entries = Array.isArray(installed)
    ? installed.map((entry) => [entry?.id, entry])
    : Object.entries(installed);

  for (const [key, entry] of entries) {
    if (!entry || entry.running !== true) continue;
    const id = normalizeId(entry.id) || normalizeId(key);
    if (!id) continue;
    if (id.toLowerCase().includes(EXTENSION_ID_NEEDLE)) {
      addCandidate(id);
    }
  }

  return candidates;
}

export function canOpenExtensionSettings({ roamAlphaAPI, extensionId = null } = {}) {
  const depot = roamAlphaAPI?.depot;
  if (typeof depot?.openSettings !== "function") return false;
  return findExtensionSettingsCandidates({ depot, extensionId }).length > 0;
}

export async function openExtensionSettings({
  roamAlphaAPI,
  extensionId = null,
  warn = console.warn,
} = {}) {
  const depot = roamAlphaAPI?.depot;
  if (typeof depot?.openSettings !== "function") {
    return { opened: false, reason: "api-unavailable" };
  }

  const candidates = findExtensionSettingsCandidates({ depot, extensionId });
  if (!candidates.length) {
    return { opened: false, reason: "no-candidates" };
  }

  let lastError = null;
  for (const id of candidates) {
    try {
      await depot.openSettings({ id });
      return { opened: true, id };
    } catch (error) {
      lastError = error;
    }
  }

  try {
    warn?.("[TaskStatus] Failed to open extension settings", lastError);
  } catch (_) {}
  return { opened: false, reason: "rejected", error: lastError };
}
