import json
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


def _repo(root: Path, name: str) -> Path:
    repo = root / name
    (repo / ".git").mkdir(parents=True)
    (repo / LOGS).mkdir()
    return repo


def _worktree(root: Path, name: str, parent: Path) -> Path:
    wt = root / name
    wt.mkdir(parents=True)
    gitdir = parent / ".git" / "worktrees" / name
    gitdir.mkdir(parents=True)
    (wt / ".git").write_text(f"gitdir: {gitdir}\n")
    (wt / LOGS).mkdir()
    return wt


def _event(sid: str, event: str, ts: str, **extra: Any) -> str:
    data = {"ts": ts, "event": event, "sessionId": sid, "branch": "agent/x", "surface": "cli"}
    data.update(extra)
    return json.dumps(data)


def _write_index(repo: Path, lines: list[str]) -> None:
    (repo / LOGS / "index.jsonl").write_text("\n".join(lines) + "\n")


def test_empty_when_no_folders() -> None:
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    assert resp.json() == {"sessions": [], "skipped_lines": 0}


def test_sessions_across_repos_and_worktrees_newest_first(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    a = _repo(watched, "a")
    b = _repo(watched, "b")
    wt = _worktree(watched, "a-wt", a)
    _write_index(
        a,
        [
            _event("s1", "sessionStart", "2026-01-01T10:00:00.000Z"),
            _event("s1", "sessionEnd", "2026-01-01T10:05:00.000Z", reason="complete"),
        ],
    )
    _write_index(wt, [_event("s2", "sessionStart", "2026-01-03T10:00:00.000Z")])
    _write_index(b, [_event("s3", "sessionStart", "2026-01-02T10:00:00.000Z", surface="cloud")])
    folders.add_folder(str(watched))

    body = client.get("/api/sessions").json()
    assert [s["session_id"] for s in body["sessions"]] == ["s2", "s3", "s1"]
    by_id = {s["session_id"]: s for s in body["sessions"]}
    assert by_id["s1"] == {
        "repo_id": by_id["s1"]["repo_id"],
        "session_id": "s1",
        "start": "2026-01-01T10:00:00.000Z",
        "end": "2026-01-01T10:05:00.000Z",
        "branch": "agent/x",
        "surface": "cli",
        "end_reason": "complete",
    }
    assert by_id["s2"]["end"] is None
    assert by_id["s2"]["repo_id"] == by_id["s1"]["repo_id"]
    assert by_id["s3"]["surface"] == "cloud"
    assert by_id["s3"]["repo_id"] != by_id["s1"]["repo_id"]


def test_filter_by_repo_and_unknown_404(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    a = _repo(watched, "a")
    b = _repo(watched, "b")
    wt = _worktree(watched, "a-wt", a)
    _write_index(a, [_event("s1", "sessionStart", "2026-01-01T10:00:00.000Z")])
    _write_index(wt, [_event("s2", "sessionStart", "2026-01-02T10:00:00.000Z")])
    _write_index(b, [_event("s3", "sessionStart", "2026-01-03T10:00:00.000Z")])
    folders.add_folder(str(watched))
    repos = {Path(r["path"]).name: r["id"] for r in client.get("/api/repos").json()["repos"]}

    only_a = client.get("/api/sessions", params={"repo": repos["a"]}).json()
    assert [s["session_id"] for s in only_a["sessions"]] == ["s2", "s1"]
    assert client.get("/api/sessions", params={"repo": "nope"}).status_code == 404


def test_malformed_lines_skipped_and_counted(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    a = _repo(watched, "a")
    _write_index(
        a,
        [
            "{not json",
            "[1, 2]",
            json.dumps({"event": "sessionStart"}),
            _event("s1", "sessionStart", "2026-01-01T10:00:00.000Z"),
        ],
    )
    folders.add_folder(str(watched))
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["skipped_lines"] == 3
    assert [s["session_id"] for s in body["sessions"]] == ["s1"]


def test_empty_unknown_session_file_produces_no_entry(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    a = _repo(watched, "a")
    (a / LOGS / "unknown-session.jsonl").write_text("")
    _write_index(
        a,
        [
            _event("unknown-session", "sessionStart", "2026-01-01T10:00:00.000Z"),
            _event("s1", "sessionStart", "2026-01-02T10:00:00.000Z"),
        ],
    )
    folders.add_folder(str(watched))
    body = client.get("/api/sessions").json()
    assert [s["session_id"] for s in body["sessions"]] == ["s1"]


def test_index_symlink_outside_logs_is_ignored(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    a = _repo(watched, "a")
    outside = tmp_path / "outside.jsonl"
    outside.write_text(_event("evil", "sessionStart", "2026-01-01T10:00:00.000Z") + "\n")
    (a / LOGS / "index.jsonl").symlink_to(outside)
    folders.add_folder(str(watched))
    assert client.get("/api/sessions").json() == {"sessions": [], "skipped_lines": 0}


def test_limited_to_500_sessions(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    a = _repo(watched, "a")
    _write_index(
        a,
        [
            _event(f"s{i}", "sessionStart", f"2026-01-01T10:{i // 60:02d}:{i % 60:02d}.000Z")
            for i in range(510)
        ],
    )
    folders.add_folder(str(watched))
    sessions = client.get("/api/sessions").json()["sessions"]
    assert len(sessions) == 500
    assert sessions[0]["session_id"] == "s509"
