"""Install the autocode harness into a git repo: template setting, preview, install."""

import os
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from flightdeck.folders import _load, _lock, _save
from flightdeck.paths import is_wsl, translate_windows_path

router = APIRouter(prefix="/api")

PREVIEW_TTL_SECONDS = 15 * 60
INSTALL_TIMEOUT_SECONDS = 300
# ASSUMPTION: the real install.sh is not readable here, so the footprint is a fixed path list.
HARNESS_FOOTPRINT = [
    "AGENTS.md",
    ".claude/agents",
    ".claude/skills",
    ".claude/settings.json",
    ".github/hooks",
    ".github/ISSUE_TEMPLATE/agent-task.yml",
    ".github/pull_request_template.md",
    "scripts/factory",
]

_previews: dict[str, dict[str, Any]] = {}
_previews_lock = threading.Lock()


def _check_text(raw: str, what: str) -> str:
    if "\n" in raw or "\r" in raw or "\0" in raw:
        raise HTTPException(status_code=422, detail=f"{what} must not contain newlines or NUL")
    if raw.startswith("-"):
        raise HTTPException(status_code=422, detail=f"{what} must not start with '-'")
    if is_wsl():
        raw = translate_windows_path(raw)
    if not os.path.isabs(raw):
        raise HTTPException(status_code=422, detail=f"{what} must be an absolute path")
    if not os.path.isdir(raw):
        raise HTTPException(status_code=422, detail=f"{what} is not a directory: {raw}")
    return os.path.normpath(raw)


def _valid_template(raw: str) -> str:
    path = _check_text(raw, "Template path")
    if not os.path.isfile(os.path.join(path, "install.sh")):
        raise HTTPException(status_code=422, detail=f"No install.sh in {path}")
    return path


def _valid_target(raw: str) -> str:
    path = _check_text(raw, "Target")
    if not os.access(path, os.W_OK | os.X_OK):
        raise HTTPException(status_code=422, detail=f"Target is not writable: {path}")
    if not os.path.exists(os.path.join(path, ".git")):
        raise HTTPException(status_code=422, detail=f"Target is not a git repo: {path}")
    return path


def _footprint(target: str) -> tuple[list[str], list[str]]:
    create: list[str] = []
    overwrite: list[str] = []
    for rel in HARNESS_FOOTPRINT:
        (overwrite if (Path(target) / rel).exists() else create).append(rel)
    return create, overwrite


class TemplateIn(BaseModel):
    path: str


class Options(BaseModel):
    repo: Literal["github", "local"] = "github"
    os: Literal["linux", "wsl", "windows"] = "linux"
    assistant: Literal["copilot", "claude-code"] = "copilot"
    cloud: Literal["none", "aws"] = "none"


class PreviewIn(Options):
    target: str


class InstallIn(BaseModel):
    preview_id: str
    overwrite: bool = False


@router.get("/settings/harness-template")
def get_template() -> dict[str, str | None]:
    return {"path": _load().get("harness_template")}


@router.put("/settings/harness-template")
def put_template(body: TemplateIn) -> dict[str, str | None]:
    path = _valid_template(body.path)
    with _lock:
        data = _load()
        data["harness_template"] = path
        _save(data)
    return {"path": path}


@router.post("/install/preview")
def preview(body: PreviewIn) -> dict[str, Any]:
    target = _valid_target(body.target)
    create, overwrite = _footprint(target)
    preview_id = uuid.uuid4().hex
    with _previews_lock:
        now = time.monotonic()
        for key in [k for k, v in _previews.items() if v["expires"] < now]:
            del _previews[key]
        _previews[preview_id] = {
            "target": target,
            "options": body.model_dump(exclude={"target"}),
            "expires": now + PREVIEW_TTL_SECONDS,
        }
    return {
        "preview_id": preview_id,
        "would_create": create,
        "would_overwrite": overwrite,
        "requires_overwrite": bool(overwrite),
    }


@router.post("/install")
def install(body: InstallIn) -> dict[str, Any]:
    with _previews_lock:
        entry = _previews.get(body.preview_id)
        if entry is None or entry["expires"] < time.monotonic():
            _previews.pop(body.preview_id, None)
            raise HTTPException(status_code=404, detail="Unknown or expired preview id")
    template_raw = _load().get("harness_template")
    if not template_raw:
        raise HTTPException(status_code=422, detail="Harness template is not configured")
    template = _valid_template(template_raw)
    target = _valid_target(entry["target"])
    _, existing = _footprint(target)
    if existing and not body.overwrite:
        raise HTTPException(status_code=409, detail=f"Harness files exist: {', '.join(existing)}")
    with _previews_lock:
        if _previews.pop(body.preview_id, None) is None:
            raise HTTPException(status_code=404, detail="Unknown or expired preview id")
    opts = entry["options"]
    argv = [
        "bash",
        os.path.join(template, "install.sh"),
        target,
        "--repo",
        opts["repo"],
        "--os",
        opts["os"],
        "--assistant",
        opts["assistant"],
        "--cloud",
        opts["cloud"],
    ]
    if body.overwrite:
        argv.append("--force")
    try:
        proc = subprocess.run(
            argv,
            shell=False,
            cwd=template,
            timeout=INSTALL_TIMEOUT_SECONDS,
            capture_output=True,
            text=True,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Installer timed out") from None
    return {"exit_code": proc.returncode, "output": proc.stdout + proc.stderr}
