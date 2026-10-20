# Using Flight deck

Flight deck is a web UI and API for the autocode agent harness. It reads the repos and session logs on your
machine and shows what the agents did.

## Local use only

Flight deck is for local use only. It has no sign-in and no access control. Run it on your own machine and do not
expose it to a network (no port forwarding, tunnels, reverse proxies or public bind addresses).

## Environment and config

| Setting             | Kind         | What it does                                                                                                         | Example value      |
| ------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `FLIGHTDECK_HOST`   | env variable | Address the API binds to. Unset or empty means `127.0.0.1` (loopback only). Leave it unset unless you have a reason. | `127.0.0.1`        |
| `FLIGHTDECK_CONFIG` | env variable | Path of the JSON config file that stores your watched folders. Unset means `~/.config/flightdeck/config.json`.       | `<path-to-config>` |

The server listens on port 8000. The config file is created the first time you add a watched folder.

Flight deck also checks `WSL_DISTRO_NAME` (set by WSL itself, not by you) to decide whether to translate Windows
folder paths such as `C:\<folder>` to `/mnt/c/<folder>`.

## Using the UI

The navigation bar switches between pages. The page is kept in the URL hash (for example `#/runs`), so reload and
back/forward work.

- **Sessions** (default): the agent sessions found in your watched folders. Open one to see its timeline.
  Suggestions based on past sessions appear here too.
- **Guard**: the decisions the guard hooks made, so you can see what was allowed or denied.
- **Runs**: the list of harness runs. Select a run to see its detail.
- **Harness**: what the harness is configured with in a repo: agents, skills, hooks, deny commands, deny paths,
  commands and complexity limits.
- **Trends**: daily health counts (for example tool failures) as charts, with a table of the same values.
- **Install**: install the harness into a repo. Pick a discovered repo or type a path, choose options, then
  Preview. The preview lists what would be created and what would be overwritten. Tick the overwrite box if it asks
  for one, then Confirm. After a successful install the repos are rescanned.
- **Settings**: Appearance (theme mode and palette) and Watched folders. Type a folder path and Add it, or Remove
  one. Folders are saved to the config file above.

## Appearance

Choose Light, Dark or System, and a palette, under Settings. See [theming](theming.md) for how themes work and how
to add one.
