# Installation

This guide sets up Flight deck on a fresh machine: a Python (FastAPI) backend in `backend/` and a
React + TypeScript (Vite) frontend in `frontend/`.

## Prerequisites

| Tool        | Required version                                                         | Install command                                           |
| ----------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Python      | `>=3.11` (`requires-python` in `backend/pyproject.toml`)                 | `uv python install 3.11` (or your OS package manager)     |
| uv          | No pin                                                                   | `curl -LsSf https://astral.sh/uv/install.sh \| sh`        |
| Node.js/npm | Not pinned in `frontend/package.json`; Node 18+ (derived from Vite `^5`) | `nvm install --lts` (or download from https://nodejs.org) |
| git         | Required by `scripts/factory/setup.sh`                                   | `sudo apt install git`                                    |
| jq          | Required by `scripts/factory/setup.sh`                                   | `sudo apt install jq`                                     |

`package.json` has no `engines` field, so the repo does not pin a Node version. The Node 18+ minimum
is inferred from `vite ^5.4.8`, not set by the project. See the platform table below for Windows
install commands.

Pinned package ranges:

- Backend (`backend/pyproject.toml`): `fastapi>=0.115`, `uvicorn>=0.30`. Dev extras: `pytest>=8`,
  `httpx>=0.27`, `ruff>=0.6`, `mypy>=1.11`.
- Frontend (`frontend/package.json`): `react ^18.3.1`, `react-dom ^18.3.1`, `vite ^5.4.8`,
  `typescript ^5.6.3`, `vitest ^2.1.2`, `eslint ^9.12.0`, `prettier ^3.3.3`.

## Install steps

These steps are the same on every platform.

1. Clone the repository and enter it:

   ```bash
   git clone <repository-url> autocode-flightdeck
   cd autocode-flightdeck
   ```

2. Run the setup script. It checks that `git` and `jq` are present, makes the scripts executable,
   creates `.agent-logs/` and `.agent-work/`, then installs both dependency sets:

   ```bash
   bash scripts/factory/setup.sh
   ```

   This is equivalent to running the two install commands yourself:

   ```bash
   (cd backend && uv sync --all-extras)
   (cd frontend && npm ci)
   ```

Only the tool installation and shell differ per platform:

| Step                 | WSL / Linux                                        | Windows (native)                                                                   |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Install git and jq   | `sudo apt install git jq`                          | `winget install Git.Git jqlang.jq`                                                 |
| Install uv           | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"`                      |
| Install Node.js      | `nvm install --lts`                                | `winget install OpenJS.NodeJS.LTS`                                                 |
| Install Python       | `uv python install 3.11`                           | `uv python install 3.11`                                                           |
| Run the setup script | `bash scripts/factory/setup.sh`                    | Run the same command from a WSL shell (recommended), or run the two commands above |
| Run the full check   | `bash scripts/factory/check.sh`                    | Run the same command from a WSL shell                                              |
| Path style           | `/home/<user>/autocode-flightdeck`                 | `C:\Users\<user>\autocode-flightdeck`                                              |

## Run

Start the backend and the frontend in two separate terminals.

Backend:

```bash
cd backend
uv run python -m flightdeck.main
```

Frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in a browser. To check the backend on its own, open
`http://127.0.0.1:8000/api/health`.

## Configuration

| Service  | Default host and port                                     | Source                                      | How to change                                                                                                                       |
| -------- | --------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | `127.0.0.1:8000` (`DEFAULT_HOST`, `DEFAULT_PORT`)         | `backend/flightdeck/main.py`                | Host: set the `FLIGHTDECK_HOST` environment variable. Port: edit `DEFAULT_PORT` in `main.py` (it is not read from the environment). |
| Frontend | `localhost:5173` (Vite default; not set anywhere in code) | Vite default, `frontend/vite.config.ts`     | `npm run dev -- --port <N>`                                                                                                         |
| API URL  | `/api` (relative), proxied to `http://localhost:8000`     | `server.proxy` in `frontend/vite.config.ts` | Edit the proxy target in `vite.config.ts` to match the backend host and port.                                                       |

The frontend calls the backend with relative `/api/...` paths. In development, Vite proxies them to
`http://localhost:8000`, so the browser never needs the backend address. If you change the backend
port in `main.py`, change the proxy target in `vite.config.ts` to the same port, then restart both
servers.

## Troubleshooting

### Port already in use

Symptom: the backend or Vite fails to start with an "address already in use" error.

1. Find the process using the port (8000 for the backend, 5173 for the frontend):
   - WSL / Linux: `ss -ltnp | grep :8000` or `lsof -i :8000`
   - Windows: `netstat -ano | findstr :8000`
2. Stop that process, or pick another port as described in [Configuration](#configuration).

### Wrong tool version

Symptom: `uv sync` or `npm ci` reports an unsupported version, or Vite fails on syntax errors.

1. Check what you have: `python --version`, `uv --version`, `node --version`.
2. Python must be 3.11 or newer: run `uv python install 3.11`.
3. Node must be 18 or newer (inferred from Vite 5): upgrade with `nvm install --lts` or the
   Windows installer from the Prerequisites table.

### `setup.sh` fails

| Symptom                                                   | Fix                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Missing required tool: git` or `jq`                      | Install the missing tool (see Prerequisites) and rerun.                                                                                        |
| `Permission denied` when running the script               | Run it with `bash scripts/factory/setup.sh` instead of executing the file directly.                                                            |
| `\r: command not found` or similar on Windows             | The files have Windows line endings. Run the script from WSL on a clone made inside WSL, or set `git config core.autocrlf input` and re-clone. |
| `uv: command not found` or `npm: command not found`       | Install uv or Node.js (see Prerequisites) and open a new shell so the `PATH` updates.                                                          |
| `npm ci` fails because `package-lock.json` is out of sync | Make sure you have a clean checkout of the lockfile (`git checkout -- frontend/package-lock.json`), then rerun.                                |
| `uv sync` fails on the Python version                     | Run `uv python install 3.11` and rerun.                                                                                                        |
