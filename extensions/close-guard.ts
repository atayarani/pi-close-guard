import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * pi-close-guard
 *
 * Confirms before `/new` discards a non-empty conversation, so you don't nuke a
 * session by reflex. Starting a new session fires `session_before_switch` with
 * reason "new"; declining the prompt cancels the switch. It hooks the event, not
 * a command name, so it catches whatever triggers a new session.
 *
 * `/resume` is off by default (it doesn't discard). `/quit` is not covered:
 * `session_shutdown` isn't cancelable, and quit leaves a resumable transcript.
 *
 * All user-facing text is config-driven so the prompt can be tailored without
 * editing code. Config is read from, in order: `$CLOSE_GUARD_CONFIG`,
 * `$PI_CODING_AGENT_DIR/close-guard.json`, or `~/.pi/agent/close-guard.json`.
 * Any subset of keys overrides the defaults.
 *
 * The pure helpers (`loadConfig`, `shouldPrompt`, `decide`, ...) are exported for
 * unit testing; the default export is a thin adapter that wires them to pi.
 */
export interface CloseGuardConfig {
  /** Confirm dialog title. */
  title?: string;
  /** Confirm dialog body. */
  message?: string;
  /** Guard the new-session path (`/new`, reason "new"). Default true. */
  guardNew?: boolean;
  /** Also guard `/resume` (reason "resume"). Default false. */
  guardResume?: boolean;
  /** Minimum user/assistant messages before guarding. Default 1 (skip empty sessions). */
  minMessages?: number;
}

export const DEFAULTS: Required<CloseGuardConfig> = {
  title: "Discard conversation?",
  message: "This will clear the current conversation. Continue?",
  guardNew: true,
  guardResume: false,
  minMessages: 1,
};

/** Resolve config from the first readable candidate file, merged over defaults. */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Required<CloseGuardConfig> {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  const candidates = [
    env.CLOSE_GUARD_CONFIG,
    env.PI_CODING_AGENT_DIR &&
      join(env.PI_CODING_AGENT_DIR, "close-guard.json"),
    join(home, ".pi", "agent", "close-guard.json"),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as CloseGuardConfig;
      return { ...DEFAULTS, ...parsed };
    } catch {
      // missing or invalid -> try the next candidate
    }
  }
  return DEFAULTS;
}

/** Minimal shapes we use from pi — kept local so tests need no pi runtime. */
export type SessionEntry = { type?: string; message?: { role?: string } };
interface GuardEvent {
  reason: string;
}
interface GuardCtx {
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
  sessionManager?: { getEntries?: () => SessionEntry[] };
}

/** Count real conversation turns (user/assistant messages) in a session. */
export function countConversationMessages(
  entries: readonly SessionEntry[],
): number {
  return entries.filter(
    (e) =>
      e?.type === "message" &&
      (e.message?.role === "user" || e.message?.role === "assistant"),
  ).length;
}

/** Pure gate: should we prompt before this switch? */
export function shouldPrompt(
  reason: string,
  entries: readonly SessionEntry[],
  hasUI: boolean,
  cfg: Required<CloseGuardConfig>,
): boolean {
  if (reason === "new" && !cfg.guardNew) return false;
  if (reason === "resume" && !cfg.guardResume) return false;
  if (reason !== "new" && reason !== "resume") return false;
  if (!hasUI) return false;
  return countConversationMessages(entries) >= cfg.minMessages;
}

/** Full decision: prompt when warranted; cancel the switch if the user declines. */
export async function decide(
  event: GuardEvent,
  ctx: GuardCtx,
  cfg: Required<CloseGuardConfig>,
): Promise<{ cancel: true } | undefined> {
  const entries = ctx.sessionManager?.getEntries?.() ?? [];
  if (!shouldPrompt(event.reason, entries, ctx.hasUI, cfg)) return undefined;
  const proceed = await ctx.ui.confirm(cfg.title, cfg.message);
  return proceed ? undefined : { cancel: true };
}

export default function (pi: ExtensionAPI) {
  const cfg = loadConfig();
  pi.on("session_before_switch", (event, ctx) => decide(event, ctx, cfg));
}
