"""GET /api/trends: per-day health counts from session logs and verify results (read-only)."""

import json
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from flightdeck.repos import _cached_scan
from flightdeck.runs import _RESULT, _collect, _read
from flightdeck.sessions import INDEX_NAME, LOGS_DIR, _inside

router = APIRouter(prefix="/api")

MARKER = ".verified"
NOTE = "Trends need at least 2 days of data; showing totals only."
COUNTED = {
    "errorOccurred": "errors",
    "postToolUseFailure": "tool_failures",
    "preCompact": "compactions",
}
FIELDS = (
    "sessions",
    "errors",
    "tool_failures",
    "compactions",
    "stop_blocks",
    "verify_pass",
    "verify_fail",
)


def _day_of_ts(ts: object) -> str | None:
    return ts[:10] if isinstance(ts, str) and len(ts) >= 10 and ts[4] == "-" else None


def _bump(days: dict[str, dict[str, int]], day: str, field: str) -> None:
    days.setdefault(day, dict.fromkeys(FIELDS, 0))[field] += 1


def _scan_log(path: str, days: dict[str, dict[str, int]]) -> None:
    first: str | None = None
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                try:
                    ev = json.loads(raw)
                except ValueError:
                    continue
                day = _day_of_ts(ev.get("ts")) if isinstance(ev, dict) else None
                if day is None:
                    continue
                first = first or day
                name = ev.get("event")
                if name in COUNTED:
                    _bump(days, day, COUNTED[name])
                elif name == "agentStop" and ev.get("gate") == "blocked-unverified":
                    _bump(days, day, "stop_blocks")
    except OSError:
        return
    if first is not None:
        _bump(days, first, "sessions")


def _scan_logs(directory: str, days: dict[str, dict[str, int]]) -> None:
    logs = os.path.join(directory, LOGS_DIR)
    try:
        names = sorted(os.listdir(logs))
    except OSError:
        return
    for name in names:
        path = os.path.join(logs, name)
        if not name.endswith(".jsonl") or name == INDEX_NAME or not _inside(path, logs):
            continue
        if os.path.isfile(path):
            _scan_log(path, days)


def _iso(mtime: float) -> str:
    return datetime.fromtimestamp(mtime, timezone.utc).isoformat()


def _marker(directories: list[str]) -> dict[str, Any]:
    newest: float | None = None
    for directory in directories:
        logs = os.path.join(directory, LOGS_DIR)
        path = os.path.join(logs, MARKER)
        if os.path.isfile(path) and _inside(path, logs):
            mtime = os.stat(path).st_mtime
            newest = mtime if newest is None else max(newest, mtime)
    return {"exists": newest is not None, "mtime": _iso(newest) if newest is not None else None}


@router.get("/trends")
def get_trends(repo: str | None = None) -> dict[str, Any]:
    repos = _cached_scan()["repos"]
    if repo is not None:
        repos = [r for r in repos if r["id"] == repo]
        if not repos:
            raise HTTPException(status_code=404, detail=f"Unknown repo id: {repo}")
    days: dict[str, dict[str, int]] = {}
    verified = []
    for item in repos:
        directories = [item["path"], *item["worktrees"]]
        for directory in directories:
            _scan_logs(directory, days)
        verified.append({"repo_id": item["id"], **_marker(directories)})
    ids = {r["id"] for r in repos}
    for found_repo, _issue, run_dir in _collect():
        log = os.path.join(run_dir, "verify.log")
        if found_repo["id"] not in ids or not os.path.isfile(log):
            continue
        results = _RESULT.findall(_read(run_dir, "verify.log"))
        if results:
            day = _iso(os.stat(log).st_mtime)[:10]
            _bump(days, day, "verify_pass" if results[-1] == "PASS" else "verify_fail")
    rows = [{"date": d, **days[d]} for d in sorted(days)]
    totals = {f: sum(days[d][f] for d in days) for f in FIELDS}
    enough = len(rows) >= 2
    return {
        "days": rows,
        "totals": totals,
        "verified": verified,
        "enough_data": enough,
        "note": None if enough else NOTE,
    }
