import os
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from flightdeck import folders
from flightdeck.main import app

client = TestClient(app)
LOGS = ".agent-logs"


@pytest.fixture(autouse=True)
def config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "cfg" / "config.json"
    monkeypatch.setenv("FLIGHTDECK_CONFIG", str(path))
    return path


def _repo(root: Path, name: str, logs: bool = True) -> Path:
    repo = root / name
    (repo / ".git").mkdir(parents=True)
    if logs:
        (repo / LOGS).mkdir()
    else:
        (repo / "scripts" / "factory").mkdir(parents=True)
        (repo / "scripts" / "factory" / "check.sh").write_text("")
    return repo


def _ts(value: str) -> float:
    return datetime.fromisoformat(value).timestamp()


def test_empty_when_no_folders() -> None:
    resp = client.get("/api/repos")
    assert resp.status_code == 200
    assert resp.json() == {"repos": [], "scan_warnings": []}


def test_repo_fields_and_stable_id(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    repo = _repo(watched, "r")
    log = repo / LOGS / "a.log"
    log.write_text("x")
    os.utime(log, (1_700_000_000, 1_700_000_000))
    folders.add_folder(str(watched))
    first = client.get("/api/repos").json()
    second = client.get("/api/repos").json()
    assert first == second
    (item,) = first["repos"]
    assert item["id"]
    assert item["path"] == str(repo)
    assert item["watched_folder"] == str(watched)
    assert item["worktrees"] == []
    assert item["status"] == "active"
    assert _ts(item["last_log_at"]) == 1_700_000_000


def test_last_log_at_is_newest_nested_and_null_without_logs(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    repo = _repo(watched, "a")
    (repo / LOGS / "sub").mkdir()
    old = repo / LOGS / "old.log"
    new = repo / LOGS / "sub" / "new.log"
    old.write_text("x")
    new.write_text("x")
    os.utime(old, (1_000, 1_000))
    os.utime(new, (2_000, 2_000))
    _repo(watched, "b", logs=False)
    folders.add_folder(str(watched))
    by_name = {Path(r["path"]).name: r for r in client.get("/api/repos").json()["repos"]}
    assert _ts(by_name["a"]["last_log_at"]) == 2_000
    assert by_name["b"]["last_log_at"] is None
    assert by_name["b"]["status"] == "no logs yet"


def test_unreadable_subdir_reported_not_fatal(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    watched = tmp_path / "w"
    _repo(watched, "r")
    (watched / "bad").mkdir()
    real = os.scandir

    def fake(path: Any) -> Iterator[os.DirEntry[str]]:
        if str(path).endswith("bad"):
            raise PermissionError(13, "Permission denied", str(path))
        return real(path)

    monkeypatch.setattr("flightdeck.scanner.os.scandir", fake)
    folders.add_folder(str(watched))
    resp = client.get("/api/repos")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["repos"]) == 1
    assert len(body["scan_warnings"]) == 1
    assert "bad" in body["scan_warnings"][0]


def test_cached_until_rescan(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    _repo(watched, "a")
    folders.add_folder(str(watched))
    first = client.get("/api/repos").json()
    assert len(first["repos"]) == 1
    _repo(watched, "b")
    assert client.get("/api/repos").json() == first
    resp = client.post("/api/repos/rescan")
    assert resp.status_code == 200
    assert len(resp.json()["repos"]) == 2
    assert client.get("/api/repos").json() == resp.json()


def test_add_and_remove_folder_invalidate_cache(tmp_path: Path) -> None:
    one = tmp_path / "one"
    two = tmp_path / "two"
    _repo(one, "a")
    _repo(two, "b")
    folders.add_folder(str(one))
    assert len(client.get("/api/repos").json()["repos"]) == 1
    added = folders.add_folder(str(two))
    assert len(client.get("/api/repos").json()["repos"]) == 2
    folders.remove_folder(added["id"])
    assert len(client.get("/api/repos").json()["repos"]) == 1
