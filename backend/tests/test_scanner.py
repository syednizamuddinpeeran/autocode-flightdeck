import os
from pathlib import Path

import pytest

from flightdeck.scanner import scan_folder


def make_repo(
    path: Path,
    *,
    git: str = "dir",
    check_sh: bool = False,
    logs: bool = False,
) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    if git == "dir":
        (path / ".git").mkdir()
    elif git == "file":
        (path / ".git").write_text("gitdir: /elsewhere\n")
    if check_sh:
        (path / "scripts" / "factory").mkdir(parents=True)
        (path / "scripts" / "factory" / "check.sh").write_text("#!/bin/bash\n")
    if logs:
        (path / ".agent-logs").mkdir()
    return path


def paths(root: Path) -> list[str]:
    return [r.path for r in scan_folder(str(root)).repos]


def test_finds_repo_with_git_dir_and_check_sh(tmp_path: Path) -> None:
    repo = make_repo(tmp_path / "a", check_sh=True)
    assert paths(tmp_path) == [str(repo)]


def test_finds_repo_with_git_file_and_agent_logs(tmp_path: Path) -> None:
    repo = make_repo(tmp_path / "a", git="file", logs=True)
    assert paths(tmp_path) == [str(repo)]


def test_ignores_git_repo_without_harness(tmp_path: Path) -> None:
    make_repo(tmp_path / "a")
    assert paths(tmp_path) == []


def test_ignores_non_git_dir_with_check_sh(tmp_path: Path) -> None:
    make_repo(tmp_path / "a", git="none", check_sh=True, logs=True)
    assert paths(tmp_path) == []


def test_status_no_logs_yet(tmp_path: Path) -> None:
    make_repo(tmp_path / "a", check_sh=True)
    assert scan_folder(str(tmp_path)).repos[0].status == "no logs yet"


def test_status_active(tmp_path: Path) -> None:
    make_repo(tmp_path / "a", check_sh=True, logs=True)
    assert scan_folder(str(tmp_path)).repos[0].status == "active"


def test_skips_node_modules_and_venv(tmp_path: Path) -> None:
    make_repo(tmp_path / "node_modules" / "x", check_sh=True)
    make_repo(tmp_path / ".venv" / "y", check_sh=True)
    assert paths(tmp_path) == []


def test_depth_limit(tmp_path: Path) -> None:
    ok = make_repo(tmp_path / "1" / "2" / "3" / "4", check_sh=True)
    make_repo(tmp_path / "1" / "2" / "3" / "4" / "5", check_sh=True)
    assert paths(tmp_path) == [str(ok)]


def test_does_not_follow_symlinks(tmp_path: Path) -> None:
    target = make_repo(tmp_path / "elsewhere" / "repo", check_sh=True)
    watched = tmp_path / "watched"
    watched.mkdir()
    (watched / "link").symlink_to(target, target_is_directory=True)
    assert paths(watched) == []


def test_unreadable_dir_becomes_warning(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    good = make_repo(tmp_path / "good", check_sh=True)
    bad = tmp_path / "bad"
    make_repo(bad / "repo", check_sh=True)
    real_scandir = os.scandir

    def fake_scandir(p):  # type: ignore[no-untyped-def]
        if str(p) == str(bad):
            raise PermissionError(13, "Permission denied", str(p))
        return real_scandir(p)

    monkeypatch.setattr(os, "scandir", fake_scandir)
    result = scan_folder(str(tmp_path))
    assert [r.path for r in result.repos] == [str(good)]
    assert len(result.warnings) == 1
    assert str(bad) in result.warnings[0]
