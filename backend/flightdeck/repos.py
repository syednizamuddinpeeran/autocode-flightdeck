"""GET /api/repos: scan all watched folders and list harness repos."""

import hashlib
import os
import threading
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter

from flightdeck.folders import config_path, folders_version, list_folders
from flightdeck.scanner import HarnessRepo, scan_folder

router = APIRouter(prefix="/api/repos")


def repo_id(path: str) -> str:
    """Stable id derived from the normalised repo path."""
    return hashlib.sha1(os.path.normpath(path).encode("utf-8")).hexdigest()[:16]


def newest_log_mtime(repo_path: str, warnings: list[str]) -> str | None:
    """ISO-8601 UTC mtime of the newest file under the repo's log dir, or None."""
    logs = os.path.join(repo_path, ".agent-logs")
    if not os.path.isdir(logs):
        return None
    newest: float | None = None

    def on_error(exc: OSError) -> None:
        warnings.append(f"Skipped {exc.filename}: {exc.strerror or exc}")

    for dirpath, _dirs, files in os.walk(logs, onerror=on_error):
        for name in files:
            try:
                mtime = os.stat(os.path.join(dirpath, name)).st_mtime
            except OSError:
                continue
            if newest is None or mtime > newest:
                newest = mtime
    if newest is None:
        return None
    return datetime.fromtimestamp(newest, tz=UTC).isoformat()


def _repo_json(repo: HarnessRepo, folder_path: str, warnings: list[str]) -> dict[str, Any]:
    return {
        "id": repo_id(repo.path),
        "path": repo.path,
        "watched_folder": folder_path,
        "worktrees": list(repo.worktrees),
        "status": repo.status,
        "last_log_at": newest_log_mtime(repo.path, warnings),
    }


def scan_all() -> dict[str, Any]:
    repos: list[dict[str, Any]] = []
    warnings: list[str] = []
    seen: set[str] = set()
    for folder in list_folders():
        result = scan_folder(folder["path"])
        warnings.extend(result.warnings)
        for repo in result.repos:
            rid = repo_id(repo.path)
            if rid in seen:
                continue
            seen.add(rid)
            repos.append(_repo_json(repo, folder["path"], warnings))
    return {"repos": repos, "scan_warnings": warnings}


_cache_lock = threading.Lock()
_cache: tuple[tuple[str, int], dict[str, Any]] | None = None


def _cached_scan(force: bool = False) -> dict[str, Any]:
    """Serve the cached scan unless forced or the watched folders changed."""
    global _cache
    with _cache_lock:
        key = (str(config_path()), folders_version())
        if force or _cache is None or _cache[0] != key:
            _cache = (key, scan_all())
        return _cache[1]


@router.get("")
def get_repos() -> dict[str, Any]:
    return _cached_scan()


@router.post("/rescan")
def rescan_repos() -> dict[str, Any]:
    return _cached_scan(force=True)
