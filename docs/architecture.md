# Architecture

How Flight deck works. Flight deck is the web UI and API for the autocode agent harness: it reads the
files the harness leaves in your repos and shows them in a browser. This page covers the system
architecture, the autocode workflow that produces the data, the data flow, and the scripts in
`scripts/factory/`.

## System architecture

```
Browser (React SPA)  --HTTP /api/*-->  FastAPI backend  --reads-->  watched folders on disk
frontend/src                           backend/flightdeck           (repos, worktrees, .agent-logs, .agent-work)
```

### Frontend

A React + TypeScript single-page app built with Vite (`frontend/`).

- `src/main.tsx` mounts `src/App.tsx`, which renders the shell: skip link, header, main navigation and the
  current page.
- Routing is a tiny hash router in `src/routes.ts`. The page is chosen from `location.hash`
  (`#/sessions`, `#/guard`, `#/runs`, `#/harness`, `#/trends`, `#/install`, `#/settings`); anything else
  falls back to Sessions. The older links `#session=<repo>/<id>` and `#settings` still work.
- Each page is a component in `src/`. A page may compose two components:

  | Page     | Components                    | Backend calls                                                                                 |
  | -------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
  | Sessions | `Sessions`, `SessionTimeline` | `GET /api/sessions`, `GET /api/repos/{repo}/sessions/{id}`                                    |
  | Guard    | `Guard`                       | `GET /api/guard/summary`                                                                      |
  | Runs     | `Runs`                        | `GET /api/runs`, `GET /api/repos/{repo}/runs/{issue}`                                         |
  | Harness  | `Harness`, `HarnessTemplate`  | `GET /api/repos`, `GET /api/repos/{repo}/harness`, `GET`/`PUT /api/settings/harness-template` |
  | Trends   | `Trends`, `Suggestions`       | `GET /api/trends`, `GET /api/suggestions`                                                     |
  | Install  | `Install`                     | `GET /api/repos`, `POST /api/install/preview`, `POST /api/install`                            |
  | Settings | `Settings`                    | `GET`/`POST /api/folders`, `DELETE /api/folders/{id}`                                         |

- `src/ui/` holds the shared presentational components (`Badge`, `Button`, `Card`, `Field`, `PageHeader`,
  `States`, `TableWrap`) re-exported from `ui/index.ts`, plus `statusTone.ts` for mapping statuses to badge
  tones. Theming lives in `src/theme.css`, `src/theme.ts` and `src/Appearance.tsx`; see
  [theming.md](theming.md).
- Tests use Vitest and jsdom (`*.test.ts(x)` next to the sources).

### Backend

A Python FastAPI package, `backend/flightdeck` (managed with uv).

- `main.py` creates the `FastAPI` app, includes one router per module and serves `GET /api/health`. It runs
  under uvicorn on port 8000 and binds to `127.0.0.1` unless `FLIGHTDECK_HOST` overrides it.
- Modules and endpoints:

  | Module              | Endpoints                                                                                    | Purpose                                                                                                    |
  | ------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
  | `folders.py`        | `GET`/`POST /api/folders`, `DELETE /api/folders/{id}`                                        | JSON-backed store of watched folders                                                                       |
  | `paths.py`          | none                                                                                         | Folder path validation and Windows-to-WSL (`C:\x` to `/mnt/c/x`) mapping                                   |
  | `scanner.py`        | none                                                                                         | Finds harness repos under a folder; attaches git worktrees to their parent repo                            |
  | `repos.py`          | `GET /api/repos`, `POST /api/repos/rescan`                                                   | Scans all watched folders (cached) and lists repos with stable ids                                         |
  | `sessions.py`       | `GET /api/sessions`                                                                          | Sessions from every repo and worktree, read from `.agent-logs/`                                            |
  | `session_detail.py` | `GET /api/repos/{repo}/sessions/{id}`                                                        | Ordered event timeline of one session                                                                      |
  | `runs.py`           | `GET /api/runs`, `GET /api/repos/{repo}/runs/{issue}`                                        | Factory runs from `.agent-work/issue-N/`                                                                   |
  | `guard.py`          | `GET /api/guard/summary`                                                                     | Allow/deny counts of logged `preToolUse` guard decisions                                                   |
  | `harness.py`        | `GET /api/repos/{repo}/harness`                                                              | Read-only overview of a repo's agents, skills, hooks, deny rules and config (secret-looking values masked) |
  | `trends.py`         | `GET /api/trends`                                                                            | Per-day health counts from session logs and verify results                                                 |
  | `suggestions.py`    | `GET /api/suggestions`                                                                       | Rule-based, read-only harness improvement suggestions                                                      |
  | `install.py`        | `GET`/`PUT /api/settings/harness-template`, `POST /api/install/preview`, `POST /api/install` | Installs the harness template into a git repo                                                              |

- Everything except folder settings and install is read-only. Repo ids in URLs come from the scan
  (a hash of the repo path), not from user-supplied paths, and file reads are checked to stay inside the
  repo's log directory.
- Tests are pytest tests in `backend/tests`.

### How they talk

The frontend calls the backend with plain `fetch` to relative `/api/...` URLs and JSON bodies. There is no
other channel and no push: each page loads its data when it mounts. In development Vite serves the app and
proxies `/api` to `http://localhost:8000` (`frontend/vite.config.ts`), so the browser sees one origin.

## The autocode workflow

Flight deck does not run the workflow; it shows its results. The harness (installed into a repo by the
Install page or `install.sh`) turns a human-written GitHub issue into a pull request. The `factory` agent
(`.claude/agents/factory.md`) orchestrates, delegating to the `planner`, `implementer` and `reviewer`
agents. Working files go in `.agent-work/issue-N/` (gitignored); hook and session logs go in `.agent-logs/`.

1. **Issue.** A human writes and reviews the issue (Goal, Acceptance criteria, Out of scope, Risk).
   `new-draft.sh` helps draft it, `check-ready.sh` validates it, `create-issue.sh` creates it.
2. **Brief.** The `issue-intake` skill turns the issue into `brief.md` with testable acceptance criteria. If
   the issue is unclear it writes `questions.md` and stops; nothing is guessed.
3. **Plan.** The `planner` writes `plan.md` (ordered, test-first tasks). `check-complexity.sh` measures it
   against `complexity.env`. If it is too big, the planner writes `breakdown.md` instead of code, checked
   by `check-breakdown.sh`, and a human creates the sub-issues with `create-issues.sh`.
4. **Implement.** The `implementer` agent completes one task per invocation, one commit per task.
5. **Verify.** The `verify-changes` skill runs `check.sh` (format, lint, typecheck, test, build), writing
   `verify.log`. Failures loop back to the implementer, at most 3 times.
6. **Review.** The `reviewer` writes `review.md` with a `VERDICT:` and `BLOCKING:`/`NIT:` items. Blocking
   items are fixed and re-verified, at most 2 review loops.
7. **PR.** The `open-pr` skill pushes the `agent/*` branch and opens the pull request (`pr-body.md`).
   Merging stays a human step.

Safety layers around the run: a separate git worktree per issue, `agent/*` branches, a `preToolUse` guard
hook that applies the deny lists in `.github/hooks/policy/`, and a stop gate that blocks the agent from
finishing until `check.sh` has passed on the current state.

## Data flow

Flight deck has no database. Its only state is a small config file; everything else is derived on request
from files the harness writes.

1. **Configure.** On the Settings page the user adds watched folders. `folders.py` validates each path
   (translating Windows paths on WSL) and stores it in `~/.config/flightdeck/config.json`, or the file named
   by `FLIGHTDECK_CONFIG`. The harness template path is stored in the same file.
2. **Scan.** `repos.py` runs `scanner.py` over each folder, up to 4 levels deep, skipping `node_modules`,
   `.git`, `.venv` and symlinks. A directory is a harness repo if it has a `.git` and either an `.agent-logs/`
   directory (status "active") or `scripts/factory/check.sh` (status "no logs yet"). Git worktrees are
   attached to their parent repo when it is in the same scan. The result is cached and refreshed when the
   watched folders change or on `POST /api/repos/rescan`.
3. **Read.** Each endpoint reads files from the discovered repos and worktrees:

   | Data                      | Source on disk                                                                                                          | Used by                   |
   | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------- |
   | Session list and timeline | `.agent-logs/index.jsonl`, `.agent-logs/<session>.jsonl`                                                                | Sessions, session detail  |
   | Guard decisions           | `preToolUse` events in per-session logs                                                                                 | Guard, Suggestions        |
   | Factory runs              | `.agent-work/issue-N/` (`brief.md`, `plan.md`, `verify.log`, `review.md`, `questions.md`, `breakdown.md`, `pr-body.md`) | Runs, Trends, Suggestions |
   | Verify pass/fail          | `verify.log` and the `.verified` marker                                                                                 | Trends                    |
   | Harness configuration     | `.claude/` agents, skills and settings, `.github/hooks/`, `scripts/factory/*.env`                                       | Harness, Suggestions      |

   Log lines that cannot be parsed are skipped and counted, not fatal.

4. **Render.** The backend returns JSON; the page components render tables, timelines, status badges and
   charts. Status is never conveyed by colour alone.
5. **Write (only two cases).** Folder and template settings change the config file. Install runs
   `install.sh` from the configured template against a target repo, after a preview step
   (`POST /api/install/preview` returns `would_create` and `would_overwrite`; the preview id expires after
   15 minutes), and refuses to overwrite existing harness files unless asked.

## Scripts in `scripts/factory/`

All build and test commands are defined once in `commands.env`; the scripts read it rather than hardcoding
tools. Scripts marked human-only are denied to agents by the guard.

| File                  | What it does                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands.env`        | The one per-project config file: base branch, setup, format, lint, typecheck, test and build commands, and `ASSISTANT`                                              |
| `complexity.env`      | Limits for one factory run: acceptance criteria, tasks, files, estimated lines, areas, risk levels to split, breakdown size and `MAX_PARALLEL`                      |
| `hook-cases.txt`      | Allow/deny cases for the guard hook, shared by the hook self-test                                                                                                   |
| `setup.sh`            | Installs dependencies (`SETUP_CMD`) and creates `.agent-logs` and `.agent-work`; used by agents, CI and local runs                                                  |
| `check.sh`            | The verification gate: runs format, lint, typecheck, test and build in order and, on success, records the state hash the stop gate checks                           |
| `check-ready.sh`      | Deterministic check that an issue or task draft has Goal, Acceptance criteria, Out of scope and Risk, and nothing marked OPEN                                       |
| `check-complexity.sh` | Measures a plan and brief against `complexity.env` (exit 6 when too complex); `--diff <base>` checks the real diff afterwards                                       |
| `check-breakdown.sh`  | Validates a planner breakdown: item order, readiness, dependencies without cycles, acceptance criteria coverage; `--split <dir>` writes the items                   |
| `agent-cli.sh`        | Sourced helper that starts the configured assistant (Copilot or Claude Code) with CLI-level denies and refuses to run when cloud credentials are in the environment |
| `new-draft.sh`        | Interactive session with the `analyst` agent that writes an issue draft to `.agent-work/drafts/<id>.md`                                                             |
| `create-issue.sh`     | Human-only: creates a GitHub issue from a ready draft after confirmation                                                                                            |
| `create-issues.sh`    | Human-only: validates a breakdown and creates its sub-issues in dependency order with native blocked-by links                                                       |
| `run-issue.sh`        | Runs one issue end to end in its own worktree and `agent/*` branch, autonomously or with `--watch`; exit codes: 4 not ready, 5 needs answers, 6 breakdown proposed  |
| `run-batch.sh`        | Runs the unblocked sub-issues of a parent issue in dependency order, up to `--parallel` at a time; `--auto-continue` waits for merges, `--list` only shows state    |
| `test-hooks.sh`       | Self-test of the guard and stop-gate hooks in a throwaway git repo, using `hook-cases.txt`                                                                          |
