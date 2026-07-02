# pi-close-guard

A tiny [pi](https://github.com/badlogic/pi-mono) extension that **confirms before
`/clear` or `/new` throws away a non-empty conversation** — so you don't nuke a
session by reflex.

Both `/clear` and `/new` fire `session_before_switch` with reason `"new"`;
this extension intercepts that and cancels the switch if you decline the prompt.
It stays out of the way on empty/fresh sessions and in non-interactive runs.

## Install

```bash
pi install git:github.com/atayarani/pi-close-guard
```

Or try it for one run without installing:

```bash
pi -e git:github.com/atayarani/pi-close-guard
```

## Behavior

- Prompts before `/clear` and `/new` when the current session has at least one
  real message. Decline → the clear is cancelled; confirm → it proceeds.
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
| `guardNew` | `true` | Guard `/clear` and `/new` |
| `guardResume` | `false` | Also guard `/resume` |
| `minMessages` | `1` | Minimum user/assistant messages before guarding |

## License

MIT — see [LICENSE](LICENSE).
