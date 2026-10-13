import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from flightdeck import folders
from flightdeck.main import app
from flightdeck.repos import repo_id
from flightdeck.session_detail import get_session

client = TestClient(app)
LOGS = ".agent-logs"


@pytest.fixture(autouse=True)
def config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "cfg" / "config.json"
    monkeypatch.setenv("FLIGHTDECK_CONFIG", str(path))
    return path


def _setup(tmp_path: Path, sid: str, events: list[dict[str, Any]] | None) -> str:
    watched = tmp_path / "w"
    repo = watched / "a"
    (repo / ".git").mkdir(parents=True)
    (repo / LOGS).mkdir()
    if events is not None:
        lines = [json.dumps(e) for e in events]
        (repo / LOGS / f"{sid}.jsonl").write_text("\n".join(lines) + "\n")
    folders.add_folder(str(watched))
    return repo_id(str(repo))


def _ev(ts: str, event: str, **extra: Any) -> dict[str, Any]:
    return {"ts": ts, "event": event, **extra}


def test_events_ordered_pairing_and_clip(tmp_path: Path) -> None:
    rid = _setup(
        tmp_path,
        "s1",
        [
            _ev("2026-01-01T00:00:03.000Z", "postToolUse", toolName="Bash"),
            _ev("2026-01-01T00:00:01.000Z", "userPromptSubmitted", prompt="x" * 500),
            _ev("2026-01-01T00:00:02.000Z", "preToolUse", toolName="Bash"),
            _ev("2026-01-01T00:00:04.000Z", "preToolUse", toolName="Edit"),
            _ev("2026-01-01T00:00:04.500Z", "postToolUseFailure", toolName="Edit", error="boom"),
        ],
    )
    resp = client.get(f"/api/repos/{rid}/sessions/s1")
    assert resp.status_code == 200
    events = resp.json()["events"]
    assert [e["ts"] for e in events] == sorted(e["ts"] for e in events)
    assert len(events[0]["summary"]) == 200
    assert events[1]["duration_ms"] == 1000 and events[2]["duration_ms"] == 1000
    assert events[3]["duration_ms"] == 500 and events[3]["failed"] is True
    assert events[4]["failed"] is True


def test_denied_and_error_flags(tmp_path: Path) -> None:
    rid = _setup(
        tmp_path,
        "s2",
        [
            _ev("2026-01-01T00:00:01Z", "preToolUse", toolName="Bash", decision="deny"),
            _ev("2026-01-01T00:00:02Z", "errorOccurred", error="bad"),
        ],
    )
    events = client.get(f"/api/repos/{rid}/sessions/s2").json()["events"]
    assert events[0]["denied"] is True and events[0]["duration_ms"] is None
    assert events[1]["failed"] is True and events[1]["summary"] == "bad"


def test_empty_session(tmp_path: Path) -> None:
    rid = _setup(tmp_path, "s3", [])
    resp = client.get(f"/api/repos/{rid}/sessions/s3")
    assert resp.status_code == 200 and resp.json()["events"] == []


def test_unknown_repo_and_session(tmp_path: Path) -> None:
    rid = _setup(tmp_path, "s4", None)
    assert client.get("/api/repos/nope/sessions/s4").status_code == 404
    assert client.get(f"/api/repos/{rid}/sessions/missing").status_code == 404


@pytest.mark.parametrize("bad", ["..%2Fx", "a%2Fb", "a%5Cb", ".hidden"])
def test_unsafe_session_id_rejected(tmp_path: Path, bad: str) -> None:
    rid = _setup(tmp_path, "s5", [_ev("2026-01-01T00:00:01Z", "sessionStart")])
    assert client.get(f"/api/repos/{rid}/sessions/{bad}").status_code == 400


def test_dotdot_rejected_before_any_read() -> None:
    with pytest.raises(HTTPException) as exc:
        get_session("any", "..")
    assert exc.value.status_code == 400
