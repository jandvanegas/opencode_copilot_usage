# opencode-copilot-usage

Shows how much of your **GitHub Copilot** premium-request quota you have used
this billing period, inside [opencode](https://opencode.ai).

```
Copilot                      ← right sidebar
█████░░░░░░░░░░░░░░░
24.4% used (12199/50000)
resets 2026-11-01

Build · Claude Sonnet 5.5 GitHub Copilot · high      Copilot 24.4%   ← prompt row
```

- **Sidebar block**: bar, percentage, used/entitlement, reset date.
- **Prompt label**: compact `Copilot 24.4%` at the right of the prompt's bottom
  row, just above the session consumption. Yellow at 75%, red at 90%.
- **`/copilot-usage`** command and **`copilot_usage`** tool for a text report
  (all quotas, including unlimited chat/completions).
- Refreshes at startup and after every response (throttled to once per 5 s).

## Requirements

- opencode **1.19.x** (v1 plugin API; not tested on v2).
- Logged in to the `github-copilot` provider (`opencode auth login`). The
  plugin reuses that OAuth token from opencode's `auth.json`; set
  `COPILOT_USAGE_TOKEN` to override it.

## Install

This package ships two entrypoints, `./server` (tool + command) and `./tui`
(sidebar + prompt label), so it must be registered in both config files.

```sh
opencode plugin opencode-copilot-usage -g
```

or by hand:

`~/.config/opencode/opencode.json`
```json
{ "plugin": ["opencode-copilot-usage"] }
```

`~/.config/opencode/tui.json`
```json
{ "plugin": ["opencode-copilot-usage"] }
```

From a local checkout, use the absolute path instead of the package name:

```sh
opencode plugin /path/to/opencode-copilot-usage -g
```

Restart opencode afterwards.

The package has no runtime dependencies: `@opencode-ai/plugin`, `solid-js` and
`@opentui/solid` are provided by opencode itself (they are optional peer
dependencies, only there for type-checking).

## Caveats

- It calls `https://api.github.com/copilot_internal/user`, an **undocumented**
  endpoint used by the official Copilot editor extensions. It may change or
  break without notice.
- GitHub updates the usage counter with a delay, so the number can trail what
  you just consumed by a few minutes.
- The percentage is computed from `credits_used / entitlement` because the
  API's `percent_remaining` lags further behind.
- Accounts with unlimited premium requests show no percentage in the sidebar /
  prompt label.

## License

MIT
