import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * pi-close-guard
 *
 * Confirms before `/clear` or `/new` discards a non-empty conversation, so you
 * don't lose the current session by reflex. `/clear` and `/new` both fire
 * `session_before_switch` with reason "new"; this cancels the switch if you
 * decline the prompt.
 *
 * `/resume` is off by default (it doesn't discard). `/quit` is not covered:
 * `session_shutdown` is a cleanup hook and isn't cancelable — and quit leaves a
 * resumable transcript anyway.
 *
 * Everything user-facing is configurable so the prompt can be tailored (or made
 * to reference your own pre-clear ritual) without editing code. Config is read
 * from, in order: `$CLOSE_GUARD_CONFIG`, `$PI_CODING_AGENT_DIR/close-guard.json`,
 * or `~/.pi/agent/close-guard.json`. Any subset of keys overrides the defaults.
 */
interface CloseGuardConfig {
  /** Confirm dialog title. */
  title?: string;
  /** Confirm dialog body. */
  message?: string;
  /** Guard `/clear` and `/new` (reason "new"). Default true. */
  guardNew?: boolean;
  /** Also guard `/resume` (reason "resume"). Default false. */
  guardResume?: boolean;
  /** Minimum user/assistant messages before guarding. Default 1 (skip empty sessions). */
  minMessages?: number;
}

const DEFAULTS: Required<CloseGuardConfig> = {
  title: "Discard conversation?",
  message: "This will clear the current conversation. Continue?",
  guardNew: true,
  guardResume: false,
  minMessages: 1,
};

function loadConfig(): Required<CloseGuardConfig> {
  const candidates = [
    process.env.CLOSE_GUARD_CONFIG,
    process.env.PI_CODING_AGENT_DIR &&
      join(process.env.PI_CODING_AGENT_DIR, "close-guard.json"),
    join(homedir(), ".pi", "agent", "close-guard.json"),
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

export default function (pi: ExtensionAPI) {
  const cfg = loadConfig();

  pi.on("session_before_switch", async (event, ctx) => {
    const reason = event.reason;
    if (reason === "new" && !cfg.guardNew) return;
    if (reason === "resume" && !cfg.guardResume) return;
    if (reason !== "new" && reason !== "resume") return;

    // No prompt possible without an interactive UI (e.g. -p / json / rpc runs).
    if (!ctx.hasUI) return;

    // Only intervene if there's an actual conversation worth keeping.
    const entries = (ctx.sessionManager?.getEntries?.() ?? []) as Array<{
      type?: string;
      message?: { role?: string };
    }>;
    const count = entries.filter(
      (e) =>
        e?.type === "message" &&
        (e.message?.role === "user" || e.message?.role === "assistant"),
    ).length;
    if (count < cfg.minMessages) return;

    const proceed = await ctx.ui.confirm(cfg.title, cfg.message);
    if (!proceed) return { cancel: true };
  });
}
