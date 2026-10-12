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

from flightdeck.paths import InvalidPathError, validate_folder_path

_lock = threading.Lock()
_version = 0
router = APIRouter(prefix="/api/folders")


class DuplicateFolderError(Exception):
    """Raised when a folder is already watched."""


class FolderNotFoundError(Exception):
    """Raised when a folder id is not watched."""


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


def _bump() -> None:
    global _version
    _version += 1


def folders_version() -> int:
    """Counter bumped whenever the watched folders change (cache invalidation)."""
    return _version


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
        _bump()
    return folder


def remove_folder(folder_id: str) -> None:
    with _lock:
        data = _load()
        items: list[dict[str, str]] = data.get("folders", [])
        remaining = [item for item in items if item["id"] != folder_id]
        if len(remaining) == len(items):
            raise FolderNotFoundError(folder_id)
        data["folders"] = remaining
        _save(data)
        _bump()


class FolderIn(BaseModel):
    path: str


@router.get("")
def get_folders() -> list[dict[str, str]]:
    return list_folders()


@router.post("", status_code=201)
def post_folder(body: FolderIn) -> dict[str, str]:
    try:
        path = validate_folder_path(body.path)
    except InvalidPathError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    try:
        return add_folder(path)
    except DuplicateFolderError:
        raise HTTPException(status_code=409, detail="Folder already watched") from None


@router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: str) -> None:
    try:
        remove_folder(folder_id)
    except FolderNotFoundError:
        raise HTTPException(status_code=404, detail="Folder not found") from None
