"""Scan a watched folder for harness repos."""

import os
from dataclasses import dataclass, field, replace

MAX_DEPTH = 4
SKIP_DIRS = frozenset({"node_modules", ".git", ".venv"})

STATUS_ACTIVE = "active"
STATUS_NO_LOGS = "no logs yet"


@dataclass(frozen=True)
class HarnessRepo:
    path: str
    status: str
    worktrees: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScanResult:
    repos: list[HarnessRepo] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _parent_of_worktree(directory: str) -> str | None:
    """Return the parent repo path if `directory` is a git worktree, else None."""
    git_path = os.path.join(directory, ".git")
    try:
        if not os.path.isfile(git_path):
            return None
        with open(git_path, encoding="utf-8") as fh:
            first = fh.readline().strip()
    except (OSError, ValueError):
        return None
    if not first.startswith("gitdir:"):
        return None
    gitdir = first[len("gitdir:") :].strip()
    if not os.path.isabs(gitdir):
        gitdir = os.path.join(directory, gitdir)
    gitdir = os.path.normpath(gitdir)
    marker = os.sep + ".git" + os.sep + "worktrees" + os.sep
    idx = gitdir.find(marker)
    if idx <= 0:
        return None
    return gitdir[:idx]


def _attach_worktrees(result: ScanResult) -> None:
    by_path = {os.path.normpath(r.path): r for r in result.repos}
    children: dict[str, list[str]] = {}
    attached: set[str] = set()
    for repo in result.repos:
        parent = _parent_of_worktree(repo.path)
        if parent is None:
            continue
        if parent in by_path and parent != os.path.normpath(repo.path):
            children.setdefault(parent, []).append(repo.path)
            attached.add(repo.path)
        else:
            result.warnings.append(
                f"Worktree {repo.path}: parent repo {parent} not found in this scan; "
                "listed on its own"
            )
    kept: list[HarnessRepo] = []
    for repo in result.repos:
        if repo.path in attached:
            continue
        wts = children.get(os.path.normpath(repo.path))
        kept.append(replace(repo, worktrees=tuple(sorted(wts))) if wts else repo)
    result.repos[:] = kept


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
    _attach_worktrees(result)
    result.repos.sort(key=lambda r: r.path)
    return result
