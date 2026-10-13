"""GET /api/guard/summary: allow/deny counts of logged preToolUse guard decisions."""

import json
import os
from collections import Counter
from typing import Any

from fastapi import APIRouter, HTTPException

from flightdeck.repos import _cached_scan
from flightdeck.sessions import INDEX_NAME, LOGS_DIR, _inside

router = APIRouter(prefix="/api/guard")

REASON_LIMIT = 50
SESSIONS_PER_REASON = 20
NO_REASON = "(no reason logged)"


def _session_files(logs: str) -> list[tuple[str, str]]:
    """(session_id, path) for each per-session log file inside `logs`."""
    try:
        names = sorted(os.listdir(logs))
    except OSError:
        return []
    found = []
    for name in names:
        stem, ext = os.path.splitext(name)
        if ext != ".jsonl" or name == INDEX_NAME or stem.startswith("."):
            continue
        path = os.path.join(logs, name)
        if os.path.isfile(path) and _inside(path, logs):
            found.append((stem, path))
    return found


def _decisions(path: str) -> tuple[list[dict[str, Any]], int]:
    """Read-only parse of one session log. Returns (preToolUse decisions, skipped lines)."""
    decisions: list[dict[str, Any]] = []
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
                if not isinstance(obj, dict):
                    skipped += 1
                    continue
                if obj.get("event") != "preToolUse":
                    continue
                if obj.get("decision") not in ("allow", "deny") or not isinstance(
                    obj.get("ts"), str
                ):
                    skipped += 1
                    continue
                decisions.append(obj)
    except OSError:
        pass
    return decisions, skipped


@router.get("/summary")
def get_summary(
    repo: str | None = None, since: str | None = None, until: str | None = None
) -> dict[str, Any]:
    repos = _cached_scan()["repos"]
    if repo is not None:
        repos = [r for r in repos if r["id"] == repo]
        if not repos:
            raise HTTPException(status_code=404, detail=f"Unknown repo id: {repo}")
    allow = deny = skipped = 0
    reasons: Counter[str] = Counter()
    sessions: dict[str, dict[tuple[str, str], None]] = {}
    for item in repos:
        for directory in [item["path"], *item["worktrees"]]:
            for sid, path in _session_files(os.path.join(directory, LOGS_DIR)):
                found, bad = _decisions(path)
                skipped += bad
                for ev in found:
                    ts = ev["ts"]
                    if (since and ts < since) or (until and ts > until):
                        continue
                    if ev["decision"] == "allow":
                        allow += 1
                        continue
                    deny += 1
                    reason = ev.get("reason")
                    reason = reason if isinstance(reason, str) and reason else NO_REASON
                    reasons[reason] += 1
                    sessions.setdefault(reason, {})[(item["id"], sid)] = None
    ranked = sorted(reasons.items(), key=lambda kv: (-kv[1], kv[0]))[:REASON_LIMIT]
    return {
        "allow": allow,
        "deny": deny,
        "total": allow + deny,
        "reasons": [
            {
                "reason": reason,
                "count": count,
                "sessions": [
                    {"repo_id": r, "session_id": s}
                    for r, s in sorted(sessions[reason])[:SESSIONS_PER_REASON]
                ],
            }
            for reason, count in ranked
        ],
        "skipped_lines": skipped,
    }
