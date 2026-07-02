import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULTS,
  loadConfig,
  countConversationMessages,
  shouldPrompt,
  decide,
  type SessionEntry,
} from "../extensions/close-guard.ts";

const userMsg: SessionEntry = { type: "message", message: { role: "user" } };
const asstMsg: SessionEntry = {
  type: "message",
  message: { role: "assistant" },
};
const toolMsg: SessionEntry = {
  type: "message",
  message: { role: "toolResult" },
};
const meta: SessionEntry = { type: "branchSummary" };

// A clean env with an empty HOME so no stray ~/.pi/agent/close-guard.json leaks in.
function emptyEnv(): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "cg-home-"));
  return { HOME: home, USERPROFILE: home };
}

function writeConfig(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cg-cfg-"));
  const path = join(dir, "close-guard.json");
  writeFileSync(path, body);
  return path;
}

test("DEFAULTS are the safe, non-nagging baseline", () => {
  assert.equal(DEFAULTS.guardNew, true);
  assert.equal(DEFAULTS.guardResume, false);
  assert.equal(DEFAULTS.minMessages, 1);
});

test("loadConfig: no config anywhere -> defaults", () => {
  assert.deepEqual(loadConfig(emptyEnv()), DEFAULTS);
});

test("loadConfig: partial override merges over defaults", () => {
  const env = emptyEnv();
  env.CLOSE_GUARD_CONFIG = writeConfig('{"title":"Custom?"}');
  const cfg = loadConfig(env);
  assert.equal(cfg.title, "Custom?");
  assert.equal(cfg.message, DEFAULTS.message); // untouched
  assert.equal(cfg.guardNew, true);
});

test("loadConfig: invalid JSON falls back to defaults (no throw)", () => {
  const env = emptyEnv();
  env.CLOSE_GUARD_CONFIG = writeConfig("{ not json ");
  assert.deepEqual(loadConfig(env), DEFAULTS);
});

test("loadConfig: CLOSE_GUARD_CONFIG wins over PI_CODING_AGENT_DIR", () => {
  const env = emptyEnv();
  env.CLOSE_GUARD_CONFIG = writeConfig('{"title":"env-path"}');
  const piDir = mkdtempSync(join(tmpdir(), "cg-pi-"));
  writeFileSync(join(piDir, "close-guard.json"), '{"title":"pi-dir"}');
  env.PI_CODING_AGENT_DIR = piDir;
  assert.equal(loadConfig(env).title, "env-path");
});

test("loadConfig: missing CLOSE_GUARD_CONFIG falls through to PI_CODING_AGENT_DIR", () => {
  const env = emptyEnv();
  env.CLOSE_GUARD_CONFIG = join(tmpdir(), "does-not-exist-cg.json");
  const piDir = mkdtempSync(join(tmpdir(), "cg-pi-"));
  writeFileSync(join(piDir, "close-guard.json"), '{"title":"pi-dir"}');
  env.PI_CODING_AGENT_DIR = piDir;
  assert.equal(loadConfig(env).title, "pi-dir");
});

test("countConversationMessages counts only user/assistant messages", () => {
  assert.equal(countConversationMessages([]), 0);
  assert.equal(countConversationMessages([toolMsg, meta]), 0);
  assert.equal(countConversationMessages([userMsg, asstMsg, toolMsg]), 2);
});

test("shouldPrompt: guards /new by default when there's a conversation", () => {
  assert.equal(shouldPrompt("new", [userMsg], true, DEFAULTS), true);
});

test("shouldPrompt: no UI -> never prompt", () => {
  assert.equal(shouldPrompt("new", [userMsg], false, DEFAULTS), false);
});

test("shouldPrompt: empty/fresh session -> no nag", () => {
  assert.equal(shouldPrompt("new", [], true, DEFAULTS), false);
  assert.equal(shouldPrompt("new", [toolMsg], true, DEFAULTS), false);
});

test("shouldPrompt: guardNew:false disables the /new guard", () => {
  const cfg = { ...DEFAULTS, guardNew: false };
  assert.equal(shouldPrompt("new", [userMsg], true, cfg), false);
});

test("shouldPrompt: /resume off by default, on when enabled", () => {
  assert.equal(shouldPrompt("resume", [userMsg], true, DEFAULTS), false);
  const cfg = { ...DEFAULTS, guardResume: true };
  assert.equal(shouldPrompt("resume", [userMsg], true, cfg), true);
});

test("shouldPrompt: unrelated reasons are ignored", () => {
  assert.equal(shouldPrompt("fork", [userMsg], true, DEFAULTS), false);
});

test("shouldPrompt: minMessages threshold", () => {
  const cfg = { ...DEFAULTS, minMessages: 2 };
  assert.equal(shouldPrompt("new", [userMsg], true, cfg), false);
  assert.equal(shouldPrompt("new", [userMsg, asstMsg], true, cfg), true);
});

function ctx(hasUI: boolean, entries: SessionEntry[], confirmResult: boolean) {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    ctx: {
      hasUI,
      ui: {
        confirm: async (t: string, m: string) => {
          calls.push([t, m]);
          return confirmResult;
        },
      },
      sessionManager: { getEntries: () => entries },
    },
  };
}

test("decide: no prompt when not warranted, and confirm is never called", async () => {
  const { ctx: c, calls } = ctx(true, [], true); // empty session
  assert.equal(await decide({ reason: "new" }, c, DEFAULTS), undefined);
  assert.equal(calls.length, 0);
});

test("decide: prompt + confirm -> proceed (undefined)", async () => {
  const { ctx: c, calls } = ctx(true, [userMsg], true);
  assert.equal(await decide({ reason: "new" }, c, DEFAULTS), undefined);
  assert.deepEqual(calls, [[DEFAULTS.title, DEFAULTS.message]]);
});

test("decide: prompt + decline -> cancel the switch", async () => {
  const { ctx: c } = ctx(true, [userMsg], false);
  assert.deepEqual(await decide({ reason: "new" }, c, DEFAULTS), {
    cancel: true,
  });
});

test("decide: missing sessionManager is treated as empty (no prompt)", async () => {
  const result = await decide(
    { reason: "new" },
    { hasUI: true, ui: { confirm: async () => false } },
    DEFAULTS,
  );
  assert.equal(result, undefined);
});
