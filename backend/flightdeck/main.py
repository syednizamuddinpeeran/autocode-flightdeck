import os

import uvicorn
from fastapi import FastAPI

from flightdeck.folders import router as folders_router
from flightdeck.harness import router as harness_router
from flightdeck.install import router as install_router
from flightdeck.repos import router as repos_router
from flightdeck.runs import router as runs_router
from flightdeck.session_detail import router as session_detail_router
from flightdeck.sessions import router as sessions_router

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000

app = FastAPI(title="Flight deck")
app.include_router(folders_router)
app.include_router(repos_router)
app.include_router(harness_router)
app.include_router(install_router)
app.include_router(runs_router)
app.include_router(sessions_router)
app.include_router(session_detail_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def get_host() -> str:
    """Bind address; loopback unless FLIGHTDECK_HOST explicitly overrides it."""
    return os.environ.get("FLIGHTDECK_HOST") or DEFAULT_HOST


def run() -> None:
    uvicorn.run(app, host=get_host(), port=DEFAULT_PORT)


if __name__ == "__main__":
    run()
