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


def _ev(ts: str, decision: str, reason: str | None = None, **extra: Any) -> str:
    data: dict[str, Any] = {"ts": ts, "event": "preToolUse", "decision": decision}
    if reason is not None:
        data["reason"] = reason
    data.update(extra)
    return json.dumps(data)


def _log(repo: Path, sid: str, lines: list[str]) -> None:
    (repo / LOGS / f"{sid}.jsonl").write_text("\n".join(lines) + "\n")


def test_empty_when_no_events(tmp_path: Path) -> None:
    folders.add_folder(str(tmp_path))
    body = client.get("/api/guard/summary").json()
    assert body == {"allow": 0, "deny": 0, "total": 0, "reasons": [], "skipped_lines": 0}


def test_totals_and_ranked_reasons_with_sessions(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    a = _repo(watched, "a")
    b = _repo(watched, "b")
    _log(
        a,
        "s1",
        [
            _ev("2026-01-01T10:00:00Z", "allow"),
            _ev("2026-01-01T10:01:00Z", "deny", "rm blocked"),
            _ev("2026-01-01T10:02:00Z", "deny", "rm blocked"),
            _ev("2026-01-01T10:03:00Z", "deny", "path [REDACTED]"),
        ],
    )
    _log(b, "s2", [_ev("2026-01-02T10:00:00Z", "deny", "rm blocked"), _ev("x", "maybe")])
    (a / LOGS / "index.jsonl").write_text(
        json.dumps({"ts": "t", "event": "sessionStart", "sessionId": "s1"}) + "\n"
    )
    folders.add_folder(str(watched))

    body = client.get("/api/guard/summary").json()
    assert (body["allow"], body["deny"], body["total"]) == (1, 4, 5)
    assert [(r["reason"], r["count"]) for r in body["reasons"]] == [
        ("rm blocked", 3),
        ("path [REDACTED]", 1),
    ]
    assert {s["session_id"] for s in body["reasons"][0]["sessions"]} == {"s1", "s2"}
    assert body["skipped_lines"] == 1


def test_missing_reason_is_bucketed(tmp_path: Path) -> None:
    a = _repo(tmp_path / "w", "a")
    _log(a, "s1", [_ev("2026-01-01T10:00:00Z", "deny", "")])
    folders.add_folder(str(tmp_path / "w"))
    reasons = client.get("/api/guard/summary").json()["reasons"]
    assert reasons[0]["reason"] == "(no reason logged)"


def test_filters_repo_since_until_and_unknown_404(tmp_path: Path) -> None:
    watched = tmp_path / "w"
    a = _repo(watched, "a")
    b = _repo(watched, "b")
    _log(
        a,
        "s1",
        [
            _ev("2026-01-01T00:00:00Z", "deny", "old"),
            _ev("2026-01-05T00:00:00Z", "deny", "mid"),
            _ev("2026-01-09T00:00:00Z", "allow"),
        ],
    )
    _log(b, "s2", [_ev("2026-01-05T00:00:00Z", "deny", "other")])
    folders.add_folder(str(watched))
    repos = {Path(r["path"]).name: r["id"] for r in client.get("/api/repos").json()["repos"]}

    only_a = client.get("/api/guard/summary", params={"repo": repos["a"]}).json()
    assert (only_a["allow"], only_a["deny"]) == (1, 2)
    windowed = client.get(
        "/api/guard/summary", params={"since": "2026-01-02", "until": "2026-01-08"}
    ).json()
    assert sorted(r["reason"] for r in windowed["reasons"]) == ["mid", "other"]
    assert windowed["allow"] == 0
    assert client.get("/api/guard/summary", params={"repo": "nope"}).status_code == 404


def test_malformed_lines_skipped_and_other_events_ignored(tmp_path: Path) -> None:
    a = _repo(tmp_path / "w", "a")
    (a / LOGS / "s1.jsonl").write_text(
        "not json\n[1]\n"
        + json.dumps({"ts": "2026-01-01T00:00:00Z", "event": "postToolUse"})
        + "\n"
        + _ev("2026-01-01T00:00:00Z", "maybe")
        + "\n"
        + _ev("2026-01-01T00:00:00Z", "allow")
        + "\n"
    )
    folders.add_folder(str(tmp_path / "w"))
    body = client.get("/api/guard/summary").json()
    assert (body["allow"], body["deny"], body["skipped_lines"]) == (1, 0, 3)
