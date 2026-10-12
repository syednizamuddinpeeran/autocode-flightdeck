"""JSON-backed store of watched folders."""

import json
import os
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

_lock = threading.Lock()
router = APIRouter(prefix="/api/folders")


class DuplicateFolderError(Exception):
    """Raised when a folder is already watched."""


def config_path() -> Path:
    env = os.environ.get("FLIGHTDECK_CONFIG")
    if env:
        return Path(env)
    return Path.home() / ".config" / "flightdeck" / "config.json"


def _load() -> dict[str, Any]:
    path = config_path()
    if not path.exists():
        return {}
    data: dict[str, Any] = json.loads(path.read_text())
    return data


def _save(data: dict[str, Any]) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def list_folders() -> list[dict[str, str]]:
    folders: list[dict[str, str]] = _load().get("folders", [])
    return folders


def add_folder(path: str) -> dict[str, str]:
    normalised = os.path.normpath(path)
    with _lock:
        data = _load()
        items: list[dict[str, str]] = data.get("folders", [])
        if any(item["path"] == normalised for item in items):
            raise DuplicateFolderError(normalised)
        folder = {"id": uuid.uuid4().hex, "path": normalised}
        data["folders"] = [*items, folder]
        _save(data)
    return folder


class FolderIn(BaseModel):
    path: str


@router.get("")
def get_folders() -> list[dict[str, str]]:
    return list_folders()


@router.post("", status_code=201)
def post_folder(body: FolderIn) -> dict[str, str]:
    try:
        return add_folder(body.path)
    except DuplicateFolderError:
        raise HTTPException(status_code=409, detail="Folder already watched") from None
