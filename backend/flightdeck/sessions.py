"""GET /api/sessions: harness sessions from every discovered repo and worktree."""

import json
import os
import re
from typing import Any

from fastapi import APIRouter, HTTPException

from flightdeck.repos import _cached_scan

router = APIRouter(prefix="/api/sessions")

SESSION_LIMIT = 500
LOGS_DIR = ".agent-logs"
INDEX_NAME = "index.jsonl"
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")


def _inside(path: str, root: str) -> bool:
    real_root = os.path.realpath(root)
    real = os.path.realpath(path)
    return real == real_root or real.startswith(real_root + os.sep)


def _session_file_empty(logs: str, session_id: str) -> bool:
    """True when the session's own log file exists, is inside `logs`, and is empty."""
    if not _SAFE_ID.match(session_id) or session_id.startswith("."):
        return False
    path = os.path.join(logs, f"{session_id}.jsonl")
    if not _inside(path, logs):
        return False
    try:
        return os.stat(path).st_size == 0
    except OSError:
        return False


def _read_index(logs: str) -> tuple[list[dict[str, Any]], int]:
    """Parse index.jsonl read-only. Returns (events, skipped_line_count)."""
    path = os.path.join(logs, INDEX_NAME)
    if not os.path.isfile(path) or not _inside(path, logs):
        return [], 0
    events: list[dict[str, Any]] = []
    skipped = 0
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                line = raw.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except ValueError:
                    skipped += 1
                    continue
                if (
                    not isinstance(obj, dict)
                    or not isinstance(obj.get("sessionId"), str)
                    or not obj["sessionId"]
                    or obj.get("event") not in ("sessionStart", "sessionEnd")
                    or not isinstance(obj.get("ts"), str)
                ):
                    skipped += 1
                    continue
                events.append(obj)
    except OSError:
        return [], skipped
    return events, skipped


def _sessions_for(repo_id: str, directory: str) -> tuple[list[dict[str, Any]], int]:
    logs = os.path.join(directory, LOGS_DIR)
    events, skipped = _read_index(logs)
    by_id: dict[str, dict[str, Any]] = {}
    for ev in events:
        sid = ev["sessionId"]
        entry = by_id.setdefault(
            sid,
            {
                "repo_id": repo_id,
                "session_id": sid,
                "start": None,
                "end": None,
                "branch": None,
                "surface": None,
                "end_reason": None,
            },
        )
        if ev["event"] == "sessionStart":
            if entry["start"] is None or ev["ts"] < entry["start"]:
                entry["start"] = ev["ts"]
            entry["branch"] = ev.get("branch") or entry["branch"]
            entry["surface"] = ev.get("surface") or entry["surface"]
        else:
            if entry["end"] is None or ev["ts"] > entry["end"]:
                entry["end"] = ev["ts"]
                entry["end_reason"] = ev.get("reason")
            entry["branch"] = entry["branch"] or ev.get("branch")
            entry["surface"] = entry["surface"] or ev.get("surface")
    result = [e for sid, e in by_id.items() if not _session_file_empty(logs, sid)]
    return result, skipped


def _sort_key(session: dict[str, Any]) -> str:
    return str(session["start"] or session["end"] or "")


@router.get("")
def get_sessions(repo: str | None = None) -> dict[str, Any]:
    repos = _cached_scan()["repos"]
    if repo is not None:
        repos = [r for r in repos if r["id"] == repo]
        if not repos:
            raise HTTPException(status_code=404, detail=f"Unknown repo id: {repo}")
    sessions: list[dict[str, Any]] = []
    skipped = 0
    for item in repos:
        for directory in [item["path"], *item["worktrees"]]:
            found, bad = _sessions_for(item["id"], directory)
            sessions.extend(found)
            skipped += bad
    sessions.sort(key=_sort_key, reverse=True)
    return {"sessions": sessions[:SESSION_LIMIT], "skipped_lines": skipped}
