import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from flightdeck import folders
from flightdeck.main import app
from flightdeck.suggestions import (
    COMPACT_SESSIONS,
    COMPLEXITY_ISSUES,
    DENY_COMMANDS,
    DENY_PATHS,
    GUARD_DENY_SESSIONS,
)

client = TestClient(app)
LOGS = ".agent-logs"


@pytest.fixture(autouse=True)
def config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "cfg" / "config.json"
    monkeypatch.setenv("FLIGHTDECK_CONFIG", str(path))
    return path


def _repo(tmp_path: Path) -> Path:
    repo = tmp_path / "w" / "r"
    (repo / ".git").mkdir(parents=True)
    (repo / LOGS).mkdir()
    folders.add_folder(str(tmp_path / "w"))
    return repo


def _log(repo: Path, sid: str, events: list[dict[str, Any]]) -> None:
    text = "\n".join(json.dumps({"ts": "2026-01-01T10:00:00Z", **e}) for e in events)
    (repo / LOGS / f"{sid}.jsonl").write_text(text + "\n")


def _run(repo: Path, issue: int, files: dict[str, str]) -> None:
    d = repo / ".agent-work" / f"issue-{issue}"
    d.mkdir(parents=True)
    for name, text in files.items():
        (d / name).write_text(text)


def _get() -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = client.get("/api/suggestions").json()["suggestions"]
    return found


def _deny(reason: str) -> dict[str, Any]:
    return {"event": "preToolUse", "decision": "deny", "reason": reason}


def test_empty() -> None:
    assert _get() == []


def test_guard_denials_at_threshold(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    for i in range(GUARD_DENY_SESSIONS):
        _log(repo, f"s{i}", [_deny("rm -rf blocked"), _deny("path secrets protected")])
    got = {s["evidence"]["reason"]: s for s in _get()}
    assert got["rm -rf blocked"]["config_file"] == DENY_COMMANDS
    assert got["path secrets protected"]["config_file"] == DENY_PATHS
    ev = got["rm -rf blocked"]["evidence"]
    assert ev["count"] == GUARD_DENY_SESSIONS
    assert ev["sessions"][0] == {"repo_id": got["rm -rf blocked"]["repo_id"], "session_id": "s0"}


def test_guard_denials_below_threshold(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    for i in range(GUARD_DENY_SESSIONS - 1):
        _log(repo, f"s{i}", [_deny("x"), _deny("x")])
    assert _get() == []


def test_compactions(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    for i in range(COMPACT_SESSIONS):
        _log(repo, f"s{i}", [{"event": "preCompact"}])
    got = _get()
    assert [s["type"] for s in got] == ["context-use"]
    assert got[0]["evidence"]["count"] == COMPACT_SESSIONS
    (repo / LOGS / "s0.jsonl").unlink()
    assert _get() == []


def test_complexity_needs_breakdowns(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    for i in range(COMPLEXITY_ISSUES):
        _run(repo, i + 1, {"plan.md": "x", "breakdown.md": "b"})
    _run(repo, 9, {"plan.md": "x"})
    got = _get()
    assert [s["type"] for s in got] == ["complexity-limits"]
    rid = got[0]["repo_id"]
    assert got[0]["evidence"]["runs"] == [
        {"repo_id": rid, "issue": 1},
        {"repo_id": rid, "issue": 2},
    ]


def test_complexity_below_threshold(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    _run(repo, 1, {"breakdown.md": "b"})
    assert _get() == []


def test_verify_loops_without_pass(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    _run(repo, 1, {"verify.log": "FAIL\nFAIL\nFAIL\n"})
    _run(repo, 2, {"verify.log": "FAIL\nFAIL\nFAIL\nPASS\n"})
    _run(repo, 3, {"verify.log": "FAIL\nFAIL\n"})
    _run(repo, 4, {"verify.log": ""})
    got = _get()
    assert [s["type"] for s in got] == ["verify-loops"]
    assert got[0]["evidence"]["runs"] == [{"repo_id": got[0]["repo_id"], "issue": 1}]


def test_changes_nothing_on_disk(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    for i in range(3):
        _log(repo, f"s{i}", [_deny("x"), {"event": "preCompact"}])
    _run(repo, 1, {"verify.log": "FAIL\nFAIL\nFAIL\n"})
    before = sorted((p, p.stat().st_mtime_ns) for p in repo.rglob("*"))
    assert _get()
    assert sorted((p, p.stat().st_mtime_ns) for p in repo.rglob("*")) == before
