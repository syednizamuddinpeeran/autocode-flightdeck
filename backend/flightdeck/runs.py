"""Factory runs: read-only view of `.agent-work/issue-N/` across repos and worktrees."""

import os
import re
from typing import Any

from fastapi import APIRouter, HTTPException

from flightdeck.repos import _cached_scan

router = APIRouter(prefix="/api")

ARTIFACTS = (
    "brief.md",
    "plan.md",
    "verify.log",
    "review.md",
    "questions.md",
    "breakdown.md",
    "pr-body.md",
)
_ISSUE_DIR = re.compile(r"^issue-(\d+)$")
_TASK = re.compile(r"^###\s+T\d+\b", re.MULTILINE)
_VERDICT = re.compile(r"^\s*VERDICT:\s*(\S+)", re.MULTILINE)
_BLOCKING = re.compile(r"^\s*(?:[-*]\s*)?BLOCKING:", re.MULTILINE)
_NIT = re.compile(r"^\s*(?:[-*]\s*)?NIT:", re.MULTILINE)
_RESULT = re.compile(r"\b(PASS|FAIL)\b")


def _read(run_dir: str, name: str) -> str:
    try:
        with open(os.path.join(run_dir, name), encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def _verdict(run_dir: str) -> str | None:
    matches = _VERDICT.findall(_read(run_dir, "review.md"))
    return matches[-1] if matches else None


def _status(present: set[str], verdict: str | None) -> str:
    if "questions.md" in present:
        return "needs-input"
    if "breakdown.md" in present:
        return "breakdown"
    if verdict is not None:
        return "reviewed"
    if "plan.md" in present:
        return "implementing"
    return "intake"


def _issue_dirs(root: str) -> dict[int, str]:
    base = os.path.join(root, ".agent-work")
    try:
        names = os.listdir(base)
    except OSError:
        return {}
    found: dict[int, str] = {}
    for name in names:
        m = _ISSUE_DIR.match(name)
        path = os.path.join(base, name)
        if m and os.path.isdir(path):
            found[int(m.group(1))] = path
    return found


def _mtime(path: str) -> float:
    try:
        return os.stat(path).st_mtime
    except OSError:
        return 0.0


def _collect() -> list[tuple[dict[str, Any], int, str]]:
    """One (repo, issue, run_dir) per repo and issue; a worktree's run beats the main checkout."""
    out: list[tuple[dict[str, Any], int, str]] = []
    for repo in _cached_scan()["repos"]:
        chosen = _issue_dirs(repo["path"])
        wt_best: dict[int, str] = {}
        for wt in repo["worktrees"]:
            for issue, path in _issue_dirs(wt).items():
                if issue not in wt_best or _mtime(path) > _mtime(wt_best[issue]):
                    wt_best[issue] = path
        chosen.update(wt_best)
        out.extend((repo, issue, chosen[issue]) for issue in sorted(chosen))
    return out


def _entry(repo: dict[str, Any], issue: int, run_dir: str) -> dict[str, Any]:
    present = {a for a in ARTIFACTS if os.path.isfile(os.path.join(run_dir, a))}
    return {
        "repo_id": repo["id"],
        "repo_name": os.path.basename(os.path.normpath(repo["path"])),
        "issue": issue,
        "status": _status(present, _verdict(run_dir) if "review.md" in present else None),
        "artifacts": [a for a in ARTIFACTS if a in present],
        "source": run_dir,
    }


@router.get("/runs")
def list_runs() -> dict[str, Any]:
    return {"runs": [_entry(repo, issue, path) for repo, issue, path in _collect()]}


@router.get("/repos/{repo}/runs/{issue}")
def get_run(repo: str, issue: int) -> dict[str, Any]:
    for found_repo, found_issue, path in _collect():
        if found_repo["id"] == repo and found_issue == issue:
            entry = _entry(found_repo, issue, path)
            review = _read(path, "review.md")
            results = [
                line.strip()
                for line in _read(path, "verify.log").splitlines()
                if _RESULT.search(line)
            ]
            entry.update(
                plan_tasks=len(_TASK.findall(_read(path, "plan.md"))),
                review_verdict=_verdict(path),
                blocking=len(_BLOCKING.findall(review)),
                nit=len(_NIT.findall(review)),
                verify_result=results[-1] if results else None,
            )
            return entry
    raise HTTPException(status_code=404, detail="Run not found")
