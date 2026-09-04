# SuperProductivity Todo Sync

View and edit your [SuperProductivity](https://super-productivity.com) tasks
directly inside Obsidian, using SuperProductivity's local REST API — no
cloud account, no third-party server.

> 📂 Full source code: [github.com/oswaltx/obsidian-superproductivity-todo-sync](https://github.com/oswaltx/obsidian-superproductivity-todo-sync)

## Features

- A sidebar view listing your open SuperProductivity tasks, grouped into
  **Overdue**, **Due today**, **This week**, **No date**, and **Waiting**
  (tasks carrying a configurable "waiting" tag).
- Quick-add input with the same `@`/`#`/`+` shortcut syntax as
  SuperProductivity's own add-task bar, with autocomplete:
  - `@today`, `@tomorrow`, a weekday name, or `@nextweek` for the due date
  - `#tag` for an existing tag
  - `+project` for an existing project
  - `30m` / `2h` for a time estimate
- Checkboxes to mark tasks done, patched straight back to SuperProductivity.
- One-click "→ all to today" to reschedule every overdue task at once.
- If a task's notes contain an `obsidian://open?...&file=<path>` link, a small
  icon opens that note directly inside Obsidian.
- A guided setup wizard for the base URL and API token.

## Requirements

- The SuperProductivity desktop app, running locally.
- Its local REST API enabled: in SuperProductivity, go to
  **Settings → Misc → Enable local REST API**. SuperProductivity will then
  show you the base URL (e.g. `http://127.0.0.1:3876` — the port is not
  fixed) and an API token.
- Desktop Obsidian only (the plugin talks to `127.0.0.1` over Node's `http`
  module, which isn't available on mobile).

## Setup

1. Install and enable the plugin.
2. The setup wizard opens automatically on first activation (also available
   any time via the ribbon icon's "Open setup wizard" command, or the
   **Setup wizard** button at the top of the plugin's settings tab).
3. Enable the local REST API in SuperProductivity as described above, then
   paste the base URL and token into the wizard.
4. Click **Test connection** to confirm it works, then **Done**.

## Notes on tags and projects

SuperProductivity's REST API has no endpoints to create tags or projects, so
the quick-add parser only ever *matches* `#tag`/`+project` against tags and
projects that already exist in SuperProductivity. An unrecognized `#`/`+`
token is left as literal text in the task title instead of being silently
dropped.

In settings, **Priority sort order** lets you add any number of existing
SuperProductivity tags and reorder them (▲/▼); within the same day, tasks are
sorted by the position of their first matching tag (top = first), and tasks
with none of the listed tags sort last. The **Waiting tag** name is
separately configurable (case-insensitive) — leave it blank to hide that
section.

## Security: where the token is stored

The API token is saved in plain text in
`<vault>/.obsidian/plugins/superproductivity-todo-sync/data.json`. Obsidian's
plugin API has no secret-store facility, so this is the same approach every
community plugin that needs an API key uses — but it does mean the token
travels with that file.

If you sync `.obsidian/` with anything (Google Drive, iCloud, Syncthing,
[remotely-save](https://github.com/remotely-save/remotely-save), a git repo,
etc.), check whether your sync tool includes plugin data — many let you
exclude specific paths or turn off syncing the config folder entirely. If it
does sync `data.json`, treat the token like any other credential: avoid
pushing it somewhere you wouldn't push a password, and rotate it in
SuperProductivity's settings if you think it leaked. Since SuperProductivity's
REST server only listens on `127.0.0.1`, the token by itself is only useful
to someone who also has local access to the machine while SuperProductivity
is running — but it's still worth being deliberate about where it ends up.

## Why not `fetch()`?

SuperProductivity's local REST server rejects any request carrying an
`Origin` header (403, "Requests from web origins are not allowed"), which
`fetch()`/`XMLHttpRequest` always attach from a renderer context. This plugin
talks to the API through Node's `http`/`https` modules directly instead,
which never send an `Origin` header.

## Manual installation

The plugin isn't in the Community Plugins directory yet, so for now it has to
be installed manually:

1. **Build it** (or download `main.js`, `manifest.json`, and `styles.css`
   from a release, if one exists):
   ```bash
   git clone https://github.com/oswaltx/obsidian-superproductivity-todo-sync
   cd obsidian-superproductivity-todo-sync
   npm install
   npm run build
   ```
   This emits `main.js` at the repository root, alongside the existing
   `manifest.json` and `styles.css`.
2. **Create the plugin folder** inside your vault, if it doesn't exist yet:
   `<vault>/.obsidian/plugins/superproductivity-todo-sync/`
3. **Copy the three files** — `main.js`, `manifest.json`, `styles.css` — into
   that folder. (While developing, `npm run dev` rebuilds `main.js` on every
   change; symlinking the repo folder into `.obsidian/plugins/` instead of
   copying saves you the copy step on every rebuild.)
4. **Reload Obsidian** (Ctrl/Cmd+R, or close and reopen the vault).
5. Go to **Settings → Community plugins**, make sure "Restricted mode" is
   off, and enable **SuperProductivity Todo Sync** in the list.
6. The setup wizard should open automatically — enable the local REST API in
   SuperProductivity and follow the steps in [Setup](#setup) above.

## Alternative: dataviewjs snippet (no plugin install)

This plugin started life as a single `dataviewjs` code block. If you'd rather
not install a plugin at all — or you want something you can hack on directly
in your vault without touching TypeScript or rebuilding anything — the full
script lives at
[`dataviewjs/superproductivity-dashboard.js`](dataviewjs/superproductivity-dashboard.js).
Open it on GitHub, copy it with the button in the top-right corner of the
code view, and paste it into a `dataviewjs` code block in any note (requires
the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin,
with JavaScript queries enabled in its settings). It's plain code sitting in
your note, so edit it freely (tag names, groupings, colors, whatever) —
there's nothing to rebuild.

It's functionally the predecessor of this plugin: same REST API, same
`@`/`#`/`+` quick-add syntax and autocomplete, same due-date grouping — but
it re-fetches and re-renders on every note view instead of living in a
persistent sidebar, has no setup wizard (edit the `tokenPath`/token handling
in the script directly), and the priority/waiting tag names are hardcoded
at the top of the file rather than configurable in a settings UI.

## Building from source

```bash
npm install
npm run build
```

`main.js` is emitted at the repository root alongside `manifest.json` and
`styles.css`.

## Support

If this plugin is useful to you:

[![Buy Me A Coffee](https://img.shields.io/badge/-Buy%20Me%20A%20Coffee-orange?style=flat&logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/oswalt)

(Built with AI assistance — see the commit history for details.)

## License

MIT
