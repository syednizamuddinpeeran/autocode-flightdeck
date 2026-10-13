"""GET /api/repos/{repo}/sessions/{id}: the ordered event timeline of one session."""

import json
import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException

from flightdeck.repos import _cached_scan
from flightdeck.sessions import _SAFE_ID, LOGS_DIR, _inside

router = APIRouter(prefix="/api/repos")

SUMMARY_LIMIT = 200
_SUMMARY_KEYS = (
    "prompt",
    "initialPrompt",
    "toolName",
    "tool_name",
    "agentName",
    "agent_type",
    "error",
    "message",
    "reason",
    "source",
)
_STOP_KEYS = ("prompt", "initialPrompt", "error", "message")
_POST = ("postToolUse", "postToolUseFailure")


def _parse_ts(ts: str) -> datetime | None:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def _summary(ev: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in _SUMMARY_KEYS:
        value = ev.get(key)
        if isinstance(value, str) and value:
            parts.append(value)
        elif isinstance(value, dict):
            parts.append(json.dumps(value, ensure_ascii=False))
        if parts and key in _STOP_KEYS:
            break
    return " ".join(parts)[:SUMMARY_LIMIT]


def _tool(ev: dict[str, Any]) -> str:
    return str(ev.get("toolName") or ev.get("tool_name") or "")


def _read_events(path: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                try:
                    obj = json.loads(raw)
                except ValueError:
                    continue
                if isinstance(obj, dict) and isinstance(obj.get("ts"), str):
                    events.append(obj)
    except OSError:
        return []
    return events


def build_timeline(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events = sorted(events, key=lambda e: e["ts"])  # stable: ties keep file order
    out: list[dict[str, Any]] = []
    pending: dict[str, list[int]] = {}  # tool name -> indexes of unpaired preToolUse
    for ev in events:
        name = str(ev.get("event", ""))
        item: dict[str, Any] = {
            "ts": ev["ts"],
            "event": name,
            "summary": _summary(ev),
            "duration_ms": None,
            "failed": name in ("postToolUseFailure", "errorOccurred"),
            "denied": name == "preToolUse" and ev.get("decision") == "deny",
        }
        out.append(item)
        tool = _tool(ev)
        if name == "preToolUse" and not item["denied"]:
            pending.setdefault(tool, []).append(len(out) - 1)
        elif name in _POST and pending.get(tool):
            pre = out[pending[tool].pop(0)]
            start, end = _parse_ts(pre["ts"]), _parse_ts(item["ts"])
            if start and end:
                ms = round((end - start).total_seconds() * 1000)
                pre["duration_ms"] = item["duration_ms"] = ms
            pre["failed"] = item["failed"]
    return out


@router.get("/{repo}/sessions/{session_id:path}")
def get_session(repo: str, session_id: str) -> dict[str, Any]:
    if not _SAFE_ID.match(session_id) or session_id.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid session id")
    item = next((r for r in _cached_scan()["repos"] if r["id"] == repo), None)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Unknown repo id: {repo}")
    for directory in [item["path"], *item["worktrees"]]:
        logs = os.path.join(directory, LOGS_DIR)
        path = os.path.join(logs, f"{session_id}.jsonl")
        if os.path.isfile(path) and _inside(path, logs):
            events = build_timeline(_read_events(path))
            return {"repo_id": repo, "session_id": session_id, "events": events}
    raise HTTPException(status_code=404, detail=f"Unknown session id: {session_id}")
