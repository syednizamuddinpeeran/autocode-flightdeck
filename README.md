# Flight deck

## Overview

Flight deck is the web UI and API for the autocode agent harness. It has a React and TypeScript frontend (`frontend/`) and a Python FastAPI backend (`backend/`).

## Local use only

Flight deck is for local use only. Run it on your own machine and do not expose it to a network or the internet.

## Prerequisites

- Python with [uv](https://docs.astral.sh/uv/)
- Node.js and npm
- Git
- WSL/Linux, or native Windows with PowerShell

See [docs/installation.md](docs/installation.md) for versions and details.

## Quick install

### WSL/Linux

```bash
git clone <repository-url> autocode-flightdeck
cd autocode-flightdeck
bash scripts/factory/setup.sh
```

The setup script needs `git` and `jq`. It is equivalent to running the two install commands yourself:

```bash
(cd backend && uv sync --all-extras)
(cd frontend && npm ci)
```

### Windows

On native Windows, skip the setup script and run the two install commands from PowerShell:

```powershell
git clone <repository-url> autocode-flightdeck
cd autocode-flightdeck
cd backend
uv sync --all-extras
cd ..
cd frontend
npm ci
cd ..
```

See [docs/installation.md](docs/installation.md) for tool installation, versions and troubleshooting.

## Quick start

Start the backend and the frontend in two separate terminals. The commands are the same on WSL/Linux and Windows.

### WSL/Linux

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

Open `http://localhost:5173` in a browser. To check the backend on its own, open `http://127.0.0.1:8000/api/health`.

### Windows

Run the same two commands from PowerShell, in two separate terminals. Each terminal starts in the repository root:

```powershell
cd backend
uv run python -m flightdeck.main
```

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173` in a browser. See [docs/usage.md](docs/usage.md) for using the UI.

## Documentation

- [Installation](docs/installation.md)
- [Usage](docs/usage.md)
- [Architecture](docs/architecture.md)
- [Theming](docs/theming.md)
