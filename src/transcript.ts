/**
 * Pull the turn's closing text from the session transcript, for the push body.
 *
 * Rule: the LAST assistant message that has text and NO tool part (a message
 * that calls a tool is not a conclusion). Trailing user messages with no reply
 * yet - e.g. an injected remote task - are skipped first, so the idle-race push
 * still shows the prior reply.
 */

/** Minimal shape of the opencode SDK client this module needs. */
export type TranscriptClient = {
  session: {
    messages(input: { path: { id: string } }): Promise<{ data?: MessageList }>;
    get(input: { path: { id: string } }): Promise<{ data?: { parentID?: string; title?: string } }>;
  };
};

/**
 * True when the session is a subagent (has a parentID).
 *
 * A subagent finishing emits the SAME `session.status idle` as a main session,
 * but the main one is still working - emailing "done" then is misleading and
 * noisy. Fails open (treats unknown as main) so a lookup error never suppresses
 * a real completion notice.
 */
export async function isSubagent(client: TranscriptClient, sessionID: string): Promise<boolean> {
  try {
    const res = await client.session.get({ path: { id: sessionID } });
    return Boolean(res.data?.parentID);
  } catch {
    return false;
  }
}

export type MessageList = Array<{
  info?: { role?: string };
  parts?: Array<{ type?: string; text?: string }>;
}>;

export function pickFinalText(messages: MessageList): string {
  let start = messages.length - 1;
  while (start >= 0 && messages[start]?.info?.role === "user") start--;

  for (let i = start; i >= 0; i--) {
    const m = messages[i]!;
    if (m.info?.role === "user") break;
    if (m.info?.role !== "assistant") continue;
    const parts = m.parts ?? [];
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
    const res = await client.session.messages({ path: { id: sessionID } });
    const messages = res.data;
    return Array.isArray(messages) ? pickFinalText(messages) : "";
  } catch {
    return "";
  }
}
