/**
 * Everything the plugin needs, in one place.
 *
 * Kept OUT of plugins/ on purpose: opencode calls every named export of a
 * plugins/*.ts file as a plugin function, so helpers must live in a sibling
 * module. This is the single aggregation point the plugin imports.
 */

import { loadConfig, awayEnabled, configPath, recipients, resolvedSmtp, setAwayNotify } from "./config";
import { sendEmail, resetTransport } from "./mail";
import { sendWithRetry } from "./retry";
import { lastAssistantText, isSubagent } from "./transcript";

export {
  loadConfig,
  awayEnabled,
  configPath,
  recipients,
  resolvedSmtp,
  setAwayNotify,
  sendEmail,
  resetTransport,
  sendWithRetry,
  lastAssistantText,
  isSubagent,
};
