// Better Tasks keeps an append-only activity log under each managed task:
// one child block whose string is the locale container title (English
// `**Activity log**`), with one child per event shaped
// `YYYY-MM-DD HH:MM — <label>` plus `:block/props` `{ bt: { kind: "event", … } }`.
// Better Tasks' `requestStatusTag` updates the task string but does not record
// an event, so this module appends the one line a status change deserves.
// It only ever writes into a container Better Tasks already created, never
// creates one, and never touches the task string.

export const ACTIVITY_LOG_CONTAINER_TITLES = Object.freeze([
  "**Activity log**",
  "**Aktivitätsprotokoll**",
  "**Journal d'activité**",
  "**Log de atividade**",
  "**Registo de atividade**",
  "**Registro attività**",
  "**Registro de actividad**",
  "**Журнал активности**",
  "**سجل النشاط**",
  "**活动日志**",
  "**活動ログ**",
  "**活動日誌**",
  "**활동 로그**",
]);

const CONTAINER_TITLE_SET = new Set(ACTIVITY_LOG_CONTAINER_TITLES);
const STATUS_PREFIX = "task-status/";
const TASK_TOKEN_RE = /^\s*(?:\{\{\s*(?:\[\[\s*)?(?:TODO|DONE)(?:\s*\]\])?\s*\}\}|TODO|DONE)(?=$|[ \t\r\n])/i;
const STATUS_TAG_RE = /^[ \t]*#(?:\[\[(task-status\/[^\]\r\n]+)\]\]|(task-status\/[^\s.,;:!?)\]}\r\n]+))/i;
const ACTIVITY_FIELD = "status";
const ACTIVITY_SOURCE = "task-status-tags";

export const TASK_CHILDREN_PULL_PATTERN =
  "[:block/uid {:block/children [:block/uid :block/string :block/order]}]";

function valueAt(value, keyword, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const plain = keyword.replace(/^:/, "");
  return value[keyword] ?? value[plain] ?? value[plain.replace(/^block\//, "")] ?? fallback;
}

function orderedChildren(block) {
  const children = valueAt(block, ":block/children", []);
  if (!Array.isArray(children)) return [];
  return children
    .map((child) => ({
      uid: valueAt(child, ":block/uid", null),
      string: valueAt(child, ":block/string", null),
      order: Number(valueAt(child, ":block/order", 0)) || 0,
    }))
    .filter((child) => typeof child.uid === "string")
    .sort((a, b) => a.order - b.order);
}

export function isActivityLogContainerString(value) {
  return typeof value === "string" && CONTAINER_TITLE_SET.has(value.trim());
}

export function statusLabelFromTaskText(text) {
  const source = String(text || "");
  const token = source.match(TASK_TOKEN_RE);
  if (!token) return null;
  const tag = source.slice(token[0].length).match(STATUS_TAG_RE);
  const title = tag?.[1] || tag?.[2];
  return title ? title.slice(STATUS_PREFIX.length) : null;
}

export function statusLabelFromTagTitle(title) {
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  if (!trimmed.toLowerCase().startsWith(STATUS_PREFIX)) return null;
  const label = trimmed.slice(STATUS_PREFIX.length);
  return label || null;
}

export function formatActivityTimestamp(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Mirrors Better Tasks' English `attr_change` / `attr_removed` templates.
export function renderStatusActivityLine({ to, ts }) {
  const label = to ? `${ACTIVITY_FIELD} → ${to}` : `${ACTIVITY_FIELD} removed`;
  return `${formatActivityTimestamp(ts)} — ${label}`;
}

export function buildStatusActivityProps({ from, to, ts }) {
  const bt = { kind: "event", event: "attr_change", ts, field: ACTIVITY_FIELD, source: ACTIVITY_SOURCE };
  if (from) bt.from = from;
  if (to) bt.to = to;
  return { bt };
}

function result(recorded, fields = {}) {
  return { recorded, ...fields };
}

// Roam functions are resolved per call: the extension loads before the
// bridge is ever used, and a missing surface must degrade to "not recorded",
// never block the certified status write.
function resolveRoamSurface(roamAlphaAPI) {
  const pull = roamAlphaAPI?.data?.async?.pull;
  const create = roamAlphaAPI?.data?.block?.create;
  const generateUID = roamAlphaAPI?.util?.generateUID;
  if ([pull, create, generateUID].some((fn) => typeof fn !== "function")) return null;
  return {
    pull: (...args) => pull.call(roamAlphaAPI.data.async, ...args),
    create: (...args) => create.call(roamAlphaAPI.data.block, ...args),
    generateUID: () => generateUID.call(roamAlphaAPI.util),
  };
}

export function createBetterTasksActivityRecorder({ roamAlphaAPI, now = Date.now }) {
  async function pullChildren(roam, uid) {
    const block = await roam.pull(TASK_CHILDREN_PULL_PATTERN, [":block/uid", uid]);
    if (valueAt(block, ":block/uid", null) !== uid) return null;
    return orderedChildren(block);
  }

  return Object.freeze({
    async record({ uid, previousString, nextString, statusTagTitle }) {
      if (typeof uid !== "string" || !uid.trim()) return result(false, { reason: "invalid-uid" });
      const roam = resolveRoamSurface(roamAlphaAPI);
      if (!roam) return result(false, { reason: "roam-api-unavailable" });
      const from = statusLabelFromTaskText(previousString);
      const to = statusTagTitle == null
        ? statusLabelFromTaskText(nextString)
        : statusLabelFromTagTitle(statusTagTitle);
      if ((from || null) === (to || null)) return result(false, { reason: "status-unchanged" });

      let containerUid;
      let siblings;
      try {
        const taskChildren = await pullChildren(roam, uid);
        if (!taskChildren) return result(false, { reason: "block-not-found" });
        const container = taskChildren.find((child) => isActivityLogContainerString(child.string));
        if (!container) return result(false, { reason: "no-activity-log" });
        containerUid = container.uid;
        siblings = (await pullChildren(roam, containerUid)) || [];
      } catch (error) {
        return result(false, { reason: "activity-read-failed", error });
      }

      const ts = now();
      const text = renderStatusActivityLine({ to, ts });
      const last = siblings[siblings.length - 1];
      if (last && last.string === text) {
        return result(false, { reason: "duplicate", containerUid, entryUid: last.uid, text });
      }

      const entryUid = roam.generateUID();
      try {
        // One write: Roam's block.create takes props, so the line and its event map land together (one undo step).
        await roam.create({
          location: { "parent-uid": containerUid, order: "last" },
          block: { uid: entryUid, string: text, props: buildStatusActivityProps({ from, to, ts }) },
        });
      } catch (error) {
        return result(false, { reason: "activity-write-failed", error, containerUid });
      }
      return result(true, { reason: "recorded", containerUid, entryUid, text });
    },
  });
}
