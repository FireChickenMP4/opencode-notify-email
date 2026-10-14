/**
 * Event classification: turn an opencode event into an email, or nothing.
 *
 * Kept OUT of plugins/ on purpose (opencode treats every named export of a
 * plugins/*.ts file as a plugin function).
 */

/** Fields the permission branch reads off a V2 `permission.asked` event. */
export type PermissionData = {
  // The request id, used to tell a still-waiting request from an auto-accepted one.
  id?: string;
  // The permission/tool kind (V1 called this `permission`), e.g. "bash", "edit".
  action?: string;
  // The resources the request covers (V1 called these `patterns`).
  resources?: string[];
  metadata?: Record<string, unknown>;
  sessionID?: string;
};

export type NotifyEvent = {
  type?: string;
  /** The location the event was published for; the session's own directory. */
  location?: { directory?: string };
  // V2 carries the payload under `data`; V1 used `properties`.
  data?: PermissionData & {
    status?: { type?: string };
    /** Why a step ended; anything but "tool-calls" means the turn is over. */
    finish?: string;
    /** Present on `form.created`: what the agent is waiting to be answered. */
    form?: FormData;
  };
};

export type Notice = { subject: string; body: string };

/**
 * The email for a permission request, or null when none applies.
 *
 * A permission request means the agent is BLOCKED and cannot proceed without
 * the user, so it is notified even though it is not "completion". Unlike an
 * idle signal, a subagent's request still notifies: the main session is blocked
 * while it waits. Gated on the away switch, same as the completion push.
 *
 * Content follows the QQ notice (workspace, kind, command/scope), except the
 * reply line: email is one-way, so it says approval must happen in opencode.
 */
export function permissionNotice(event: NotifyEvent, away: boolean, workspace: string): Notice | null {
  if (event.type !== "permission.asked") return null;
  if (!away) return null;
  const p = event.data ?? {};
  const kind = typeof p.action === "string" ? p.action : "unknown";
  const patterns = Array.isArray(p.resources) ? p.resources.map(String) : [];
  const metadata = (p.metadata ?? {}) as Record<string, unknown>;
  return {
    subject: `opencode · 需要授权 [${workspace}]`,
    body: permissionBody(workspace, kind, metadata, patterns),
  };
}

/** Same layout as the QQ bridge's `formatPermission`, minus the reply options. */
function permissionBody(
  workspace: string,
  kind: string,
  metadata: Record<string, unknown>,
  patterns: string[],
): string {
  const lines = [`目录: \`${workspace}\``, `工具: **${kind}**`];

  if (kind === "external_directory") {
    const dirs = Array.isArray(metadata.directories) ? metadata.directories.map(String) : [];
    const command = typeof metadata.command === "string" ? metadata.command : "";
    if (dirs.length) {
      lines.push("", "访问目录:");
      for (const d of dirs) lines.push(`- \`${d}\``);
    }
    if (patterns.length) {
      lines.push("", "记住(always)范围:");
      for (const p of patterns) lines.push(`- \`${p}\``);
    }
    if (command) lines.push("", "命令:", "```sh", command.trim(), "```");
  } else {
    const command =
      (typeof metadata.command === "string" && metadata.command) ||
      (typeof metadata.filePath === "string" && metadata.filePath) ||
      (typeof metadata.filepath === "string" && metadata.filepath) ||
      (patterns.length ? patterns.join(" ") : "(no detail)");
    lines.push("", "```sh", String(command).trim(), "```");
  }

  lines.push("", "邮件不支持远程审批，请回到 opencode 处理。");
  return lines.join("\n");
}

/** The form payload of a V2 `form.created` event (the `question` tool uses this). */
export type FormData = {
  id?: string;
  sessionID?: string;
  title?: string;
  fields?: Array<{
    key?: string;
    type?: string;
    title?: string;
    description?: string;
    required?: boolean;
    options?: Array<{ value?: string; label?: string; description?: string }>;
  }>;
};

/**
 * The email for a form the agent is waiting on, or null when none applies.
 *
 * A form means the agent asked something and cannot proceed without an answer
 * (`question` tool). Gated on the away switch, same as the other pushes.
 */
export function formNotice(event: NotifyEvent, away: boolean, workspace: string): Notice | null {
  if (event.type !== "form.created") return null;
  if (!away) return null;
  const form = event.data?.form;
  if (!form) return null;
  return {
    subject: `opencode · 需要你回答 [${workspace}]`,
    body: formBody(workspace, form),
  };
}

/** Layout: workspace, then every field with its options, then the one-way note. */
function formBody(workspace: string, form: FormData): string {
  const lines = [`目录: \`${workspace}\``];
  if (form.title) lines.push(`标题: **${form.title}**`);

  const fields = Array.isArray(form.fields) ? form.fields : [];
  for (const f of fields) {
    const label = (typeof f.title === "string" && f.title) || (typeof f.key === "string" && f.key) || "(未命名)";
    lines.push("", `**${label}**${f.required ? "（必填）" : ""}`);
    if (typeof f.description === "string" && f.description) lines.push(f.description);
    const options = Array.isArray(f.options) ? f.options : [];
    for (const o of options) {
      const text = (typeof o.label === "string" && o.label) || (typeof o.value === "string" && o.value) || "";
      const desc = typeof o.description === "string" && o.description ? ` — ${o.description}` : "";
      lines.push(`- ${text}${desc}`);
    }
  }
  if (fields.length === 0) lines.push("", "(没有问题字段)");

  lines.push("", "邮件不支持回答问题，请回到 opencode 处理。");
  return lines.join("\n");
}
