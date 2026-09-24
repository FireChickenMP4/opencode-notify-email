# opencode-notify-email

Send opencode notifications by email, over SMTP.

## What it does / does not

- Sends an email when a turn finishes (if the away switch is ON).
- Exposes a `notify_email` tool so the agent can email you on purpose.
- Does **not** receive replies or act on them: email is one-way by design.
  Remote approval lives in the [QQ project](https://github.com/FireChickenMP4/opencode-notify-qq).

## Requirements

- [Bun](https://bun.sh) 1.3+
- An SMTP account. For CCNU / Tencent Exmail use `smtp.exmail.qq.com:465` with a
  **client-specific password** (Exmail: log in -> 设置 -> 客户端专用密码).

## Install

```powershell
git clone git@github.com:FireChickenMP4/opencode-notify-email.git
cd opencode-notify-email
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The installer copies the plugin + its sources to `~/.config/opencode/plugins/`,
installs `nodemailer` into the global config, and adds a `notify-email` shell
function.

### Configure

Create `~/.config/opencode/notify-email.json`:

```json
{
  "smtp": {
    "host": "smtp.exmail.qq.com",
    "port": 465,
    "secure": true,
    "user": "you@your.domain",
    "pass": "client-specific-password",
    "from": "opencode <you@your.domain>"
  },
  "to": "you@where-you-read-mail.com",
  "awayNotify": { "enabled": false }
}
```

- `from` is optional; it defaults to `user`.
- `to` may be one address or a list.

Verify (sends a test message):

```powershell
notify-email check
```

Restart opencode; the agent then has the `notify_email` tool.

## Usage

```powershell
notify-email           # status
notify-email on / off  # away auto-push (read fresh each event; no restart)
notify-email check     # send a test email
```

In a session, ask the agent to notify you, or it calls `notify_email` itself when
a long task finishes.

## Env

| Variable | Default | Purpose |
|---|---|---|
| `OPENCODE_NOTIFY_EMAIL_CONFIG` | `~/.config/opencode/notify-email.json` | config path |
| `OPENCODE_NOTIFY_EMAIL_LOG` | on | set `0` to disable the event log |
| `OPENCODE_NOTIFY_EMAIL_DEDUP_MS` | `5000` | idle de-dup window |

## Notes

- A failed send is retried (1s / 3s); if it still fails, the message is appended
  to `notify-email.undelivered.log` next to the plugin so nothing is lost
  silently.
- The plugin file exports only `NotifyEmailPlugin`; opencode calls **every** named
  export of a `plugins/*.ts` file as a plugin, so helpers live in `src/`.
