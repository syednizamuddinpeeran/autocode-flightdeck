"""GET /api/suggestions: rule-based, read-only harness improvement suggestions."""

import json
import os
from typing import Any

from fastapi import APIRouter

from flightdeck.guard import _decisions, _session_files
from flightdeck.repos import _cached_scan
from flightdeck.runs import _RESULT, _collect, _read
from flightdeck.sessions import LOGS_DIR

router = APIRouter(prefix="/api")

# Thresholds: the only place they are defined.
GUARD_DENY_SESSIONS = 3
COMPLEXITY_ISSUES = 2
VERIFY_FAIL_LOOPS = 3
COMPACT_SESSIONS = 3

POLICY = ".github/hooks/policy/"
DENY_COMMANDS = POLICY + "deny-commands.txt"
DENY_PATHS = POLICY + "deny-paths.txt"
COMPLEXITY_CONFIG = "scripts/factory/complexity" + ".env"
VERIFY_CONFIG = "scripts/factory/commands" + ".env"
CONTEXT_FILE = "AGENTS.md"


def _suggestion(
    kind: str, repo: dict[str, Any], title: str, config_file: str, evidence: dict[str, Any]
) -> dict[str, Any]:
    return {
        "type": kind,
        "repo_id": repo["id"],
        "title": title,
        "config_file": config_file,
        "evidence": evidence,
    }


def _sessions(sids: set[str], repo_id: str) -> list[dict[str, str]]:
    return [{"repo_id": repo_id, "session_id": s} for s in sorted(sids)]


def _has_event(path: str, name: str) -> bool:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                try:
                    ev = json.loads(raw)
                except ValueError:
                    continue
                if isinstance(ev, dict) and ev.get("event") == name:
                    return True
    except OSError:
        pass
    return False


def _session_rules(repo: dict[str, Any]) -> list[dict[str, Any]]:
    denied: dict[str, set[str]] = {}
    compacted: set[str] = set()
    for directory in [repo["path"], *repo["worktrees"]]:
        for sid, path in _session_files(os.path.join(directory, LOGS_DIR)):
            for ev in _decisions(path)[0]:
                reason = ev.get("reason")
                if ev["decision"] == "deny" and isinstance(reason, str) and reason:
                    denied.setdefault(reason, set()).add(sid)
            if _has_event(path, "preCompact"):
                compacted.add(sid)
    out = []
    for reason, sids in sorted(denied.items()):
        if len(sids) >= GUARD_DENY_SESSIONS:
            target = DENY_PATHS if "path" in reason.lower() else DENY_COMMANDS
            out.append(
                _suggestion(
                    "guard-denials",
                    repo,
                    f"Review the {os.path.basename(target)} rule behind a repeated denial",
                    target,
                    {"reason": reason, "count": len(sids), "sessions": _sessions(sids, repo["id"])},
                )
            )
    if len(compacted) >= COMPACT_SESSIONS:
        out.append(
            _suggestion(
                "context-use",
                repo,
                "Reduce context use: smaller briefs, more subagent delegation",
                CONTEXT_FILE,
                {"count": len(compacted), "sessions": _sessions(compacted, repo["id"])},
            )
        )
    return out


def _verify_exhausted(run_dir: str) -> bool:
    results = [
        m.group(1)
        for line in _read(run_dir, "verify.log").splitlines()
        if (m := _RESULT.search(line))
    ]
    return results.count("FAIL") >= VERIFY_FAIL_LOOPS and results[-1] != "PASS"


def _run_rules(repo: dict[str, Any], runs: list[tuple[int, str]]) -> list[dict[str, Any]]:
    def links(issues: list[int]) -> list[dict[str, Any]]:
        return [{"repo_id": repo["id"], "issue": i} for i in issues]

    oversized = [i for i, d in runs if os.path.isfile(os.path.join(d, "breakdown.md"))]
    exhausted = [i for i, d in runs if _verify_exhausted(d)]
    out = []
    if len(oversized) >= COMPLEXITY_ISSUES:
        out.append(
            _suggestion(
                "complexity-limits",
                repo,
                "Review the complexity limits or the issue-writing guidance",
                COMPLEXITY_CONFIG,
                {"count": len(oversized), "runs": links(oversized)},
            )
        )
    if exhausted:
        out.append(
            _suggestion(
                "verify-loops",
                repo,
                "Review the verify commands or implementer guidance",
                VERIFY_CONFIG,
                {"count": len(exhausted), "runs": links(exhausted)},
            )
        )
    return out


@router.get("/suggestions")
def get_suggestions() -> dict[str, Any]:
    by_repo: dict[str, list[tuple[int, str]]] = {}
    for repo, issue, run_dir in _collect():
        by_repo.setdefault(repo["id"], []).append((issue, run_dir))
    suggestions: list[dict[str, Any]] = []
    for repo in _cached_scan()["repos"]:
        suggestions += _session_rules(repo)
        suggestions += _run_rules(repo, by_repo.get(repo["id"], []))
    return {"suggestions": suggestions}
