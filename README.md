# pi-close-guard

[![CI](https://github.com/atayarani/pi-close-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/atayarani/pi-close-guard/actions/workflows/ci.yml)

A tiny [pi](https://github.com/badlogic/pi-mono) extension that **confirms before
`/new` throws away a non-empty conversation** — so you don't nuke a session by
reflex.

Starting a new session (`/new`) fires `session_before_switch` with reason
`"new"`; this extension intercepts that and cancels the switch if you decline the
prompt. Because it hooks the event (not a command name), it catches whatever
triggers a new session. It stays out of the way on empty/fresh sessions and in
non-interactive runs.

## Install

```bash
pi install git:github.com/atayarani/pi-close-guard
```

Or try it for one run without installing:

```bash
pi -e git:github.com/atayarani/pi-close-guard
```

## Behavior

- Prompts before `/new` (start-a-new-session) when the current session has at
  least one real message. Decline → the switch is cancelled; confirm → it proceeds.
- Leaves `/resume` alone by default (it doesn't discard).
- Does **not** guard `/quit`: `session_shutdown` isn't cancelable, and quit leaves
  a resumable transcript anyway.
- Silent in non-interactive modes (`-p`, `--mode json`, `--mode rpc`).

## Configuration

All user-facing text is configurable, so you can tailor the prompt (for example,
to reference your own pre-clear ritual) without touching code. Config is read
from the first of these that exists:

1. `$CLOSE_GUARD_CONFIG` (a path)
2. `$PI_CODING_AGENT_DIR/close-guard.json`
3. `~/.pi/agent/close-guard.json`

Any subset of keys overrides the defaults:

```json
{
  "title": "Discard conversation?",
  "message": "This will clear the current conversation. Continue?",
  "guardNew": true,
  "guardResume": false,
  "minMessages": 1
}
```

| Key | Default | Meaning |
|-----|---------|---------|
| `title` | `"Discard conversation?"` | Confirm dialog title |
| `message` | `"This will clear the current conversation. Continue?"` | Confirm dialog body |
| `guardNew` | `true` | Guard `/new` (reason `"new"`) |
| `guardResume` | `false` | Also guard `/resume` |
| `minMessages` | `1` | Minimum user/assistant messages before guarding |

## Development

```bash
npm install      # dev deps (typescript, prettier, pi types)
npm run check    # typecheck + format check (what CI runs)
npm run format   # auto-fix formatting
```

## Releasing

Releases are automatic. To cut one:

1. Make your change to `extensions/close-guard.ts`.
2. Bump `version` in `package.json`.
3. Commit and push to `main`.

CI typechecks, then — if that `version` isn't already released — tags `vX.Y.Z` and
creates a matching GitHub Release with generated notes. No manual tagging. Consumers
pin to the tag (e.g. `pi install git:github.com/atayarani/pi-close-guard@vX.Y.Z`).

## License

MIT — see [LICENSE](LICENSE).
