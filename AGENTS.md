# AGENTS.md — pi-close-guard

A single-purpose [pi](https://github.com/badlogic/pi-mono) extension: **confirm
before `/clear` or `/new` discards a non-empty conversation.** Distributed as a
git-installable pi package. Keep it tiny, generic, and dependency-light.

## Structure

- `extensions/close-guard.ts` — the whole extension. One `session_before_switch`
  handler; all user-facing text is config-driven.
- `package.json` — `pi.extensions` manifest + `pi-package` keyword; peer-deps on
  `@earendil-works/pi-coding-agent` (provided by pi at runtime).
- `tsconfig.json` — typecheck only (`noEmit`, `skipLibCheck`).
- `.github/workflows/ci.yml` — CI (typecheck + format) and auto-release.

## How it works

`/clear` and `/new` both fire `session_before_switch` with `reason: "new"`. The
handler returns `{ cancel: true }` to block the switch when the user declines.
It stays silent without a UI (`ctx.hasUI`) and on empty sessions (checks for
real user/assistant messages). `/resume` is opt-in; `/quit` is intentionally not
covered (`session_shutdown` isn't cancelable, and quit leaves a resumable
transcript).

## Configuration

Never hardcode user-facing strings. All text/behavior comes from config, read in
order: `$CLOSE_GUARD_CONFIG` → `$PI_CODING_AGENT_DIR/close-guard.json` →
`~/.pi/agent/close-guard.json`, merged over defaults. Keys: `title`, `message`,
`guardNew`, `guardResume`, `minMessages`. This keeps the published code free of
any consumer's private wording.

## Develop

```bash
npm install        # dev deps (typescript, prettier, pi types)
npm run check      # typecheck + format:check (exactly what CI runs)
npm run format     # auto-fix formatting
```

## Release (automated — do not tag by hand)

1. Edit `extensions/close-guard.ts`.
2. Bump `version` in `package.json`.
3. Commit + push to `main`.

CI runs `check`, then — if that version isn't already released — tags `vX.Y.Z`
and creates a GitHub Release with generated notes. Consumers pin to tags
(`pi install git:github.com/atayarani/pi-close-guard@vX.Y.Z`).

## Conventions / guardrails

- **Single purpose.** Guard the clear/new discard path — nothing else.
- **Generic only.** No references to any specific consumer, persona, or workflow;
  those live in the consumer's config file, not here.
- **Dependency-light.** Node built-ins + pi peer-deps. Don't add runtime deps.
- **Fail safe & quiet.** Missing/invalid config → defaults. No UI → no-op. Never
  throw out of the handler.
- **Bump `version` for any shipped change** so the release automation fires.
