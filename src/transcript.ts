/**
 * Pull the turn's closing text from the session transcript, for the push body.
 *
 * Rule: the LAST assistant message that has text and NO tool part (a message
 * that calls a tool is not a conclusion). Trailing messages that are not
 * assistant replies are skipped first - an injected remote task (a user
 * message) or a V2 turn-end marker - so the idle-race push still shows the
 * prior reply.
 */

/**
 * Minimal shape of the V2 plugin session domain this module needs.
 *
 * V2 returns the session record and the transcript directly; V1 wrapped them in
 * a `{ data }` envelope and took `{ path: { id } }` inputs.
 */
export type TranscriptClient = {
  session: {
    get(input: { sessionID: string }): Promise<{ parentID?: string; title?: string; metadata?: { aside?: boolean } }>;
    context(input: { sessionID: string }): Promise<MessageList>;
  };
};

/**
 * The message shapes this module reads. V2 tags each message with `type` and
 * keeps assistant output in `content`; every other message kind is ignored.
 */
export type SessionMessage = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

export type MessageList = readonly SessionMessage[];

/**
 * True when this session's completion should stay quiet.
 *
 * Two cases:
 *   - a subagent (has a parentID): it finishes while the main session is still
 *     working, so "done" would be misleading and noisy;
 *   - a `.bt` aside fork (no parentID, marked by the QQ bridge): the bridge
 *     relays that answer itself, so a second notice is pure noise.
 *
 * Fails open (treats unknown as main) so a lookup error never suppresses a real
 * completion notice.
 */
export async function isQuietSession(client: TranscriptClient, sessionID: string): Promise<boolean> {
  try {
    const session = await client.session.get({ sessionID });
    return (
      Boolean(session.parentID) ||
      session.metadata?.aside === true ||
      Boolean(session.title?.startsWith("旁问 ·"))
    );
  } catch {
    return false;
  }
}

export function pickFinalText(messages: MessageList): string {
  // V2 appends messages of their own kind at a turn boundary, so "trailing"
  // covers more than just `user`; skip everything that is not a reply.
  let start = messages.length - 1;
  while (start >= 0 && messages[start]?.type !== "assistant") start--;

  for (let i = start; i >= 0; i--) {
    const m = messages[i]!;
    if (m.type === "user") break;
    if (m.type !== "assistant") continue;
    const parts = m.content ?? [];
    if (parts.some((p) => p.type === "tool")) continue;
    const text = parts
      .filter((p) => p.type === "text" && p.text?.trim())
      .map((p) => p.text!.trim())
      .join("\n\n")
      .trim();
    if (text) return text;
  }
  return "";
}

/** Read the session transcript and return the closing text ("" on any error). */
export async function lastAssistantText(client: TranscriptClient, sessionID: string): Promise<string> {
  try {
    const messages = await client.session.context({ sessionID });
    return Array.isArray(messages) ? pickFinalText(messages) : "";
  } catch {
    return "";
  }
}
