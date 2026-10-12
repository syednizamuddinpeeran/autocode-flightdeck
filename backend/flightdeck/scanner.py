"""Scan a watched folder for harness repos."""

import os
from dataclasses import dataclass, field

MAX_DEPTH = 4
SKIP_DIRS = frozenset({"node_modules", ".git", ".venv"})

STATUS_ACTIVE = "active"
STATUS_NO_LOGS = "no logs yet"


@dataclass(frozen=True)
class HarnessRepo:
    path: str
    status: str


@dataclass(frozen=True)
class ScanResult:
    repos: list[HarnessRepo] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _classify(directory: str) -> HarnessRepo | None:
    if not os.path.exists(os.path.join(directory, ".git")):
        return None
    has_logs = os.path.isdir(os.path.join(directory, ".agent-logs"))
    has_check = os.path.isfile(os.path.join(directory, "scripts", "factory", "check.sh"))
    if not (has_logs or has_check):
        return None
    return HarnessRepo(directory, STATUS_ACTIVE if has_logs else STATUS_NO_LOGS)


def _walk(directory: str, depth: int, result: ScanResult) -> None:
    try:
        with os.scandir(directory) as it:
            entries = list(it)
    except OSError as exc:
        result.warnings.append(f"Skipped {directory}: {exc.strerror or exc}")
        return
    repo = _classify(directory)
    if repo is not None:
        result.repos.append(repo)
    if depth >= MAX_DEPTH:
        return
    for entry in entries:
        if entry.name in SKIP_DIRS or entry.is_symlink():
            continue
        try:
            is_dir = entry.is_dir(follow_symlinks=False)
        except OSError:
            continue
        if is_dir:
            _walk(entry.path, depth + 1, result)


def scan_folder(root: str) -> ScanResult:
    """Return harness repos under `root` (depth 0) and warnings for skipped dirs."""
    result = ScanResult()
    _walk(root, 0, result)
    result.repos.sort(key=lambda r: r.path)
    return result
