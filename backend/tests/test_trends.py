import json
import os
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from flightdeck import folders
from flightdeck.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "cfg" / "config.json"
    monkeypatch.setenv("FLIGHTDECK_CONFIG", str(path))
    return path


def _repo(root: Path, name: str) -> Path:
    repo = root / name
    (repo / ".git").mkdir(parents=True)
    (repo / ".agent-logs").mkdir()
    return repo


def _log(repo: Path, sid: str, events: list[tuple[str, str, dict[str, Any]]]) -> None:
    lines = [json.dumps({"ts": ts, "event": ev, **extra}) for ts, ev, extra in events]
    (repo / ".agent-logs" / f"{sid}.jsonl").write_text("\n".join(lines) + "\n")


def _trends(query: str = "") -> dict[str, Any]:
    body: dict[str, Any] = client.get(f"/api/trends{query}").json()
    return body


def _two_repos(tmp_path: Path) -> tuple[Path, Path]:
    a, b = _repo(tmp_path / "w", "a"), _repo(tmp_path / "w", "b")
    _log(
        a,
        "s1",
        [
            ("2026-05-01T10:00:00Z", "sessionStart", {}),
            ("2026-05-01T10:01:00Z", "errorOccurred", {}),
            ("2026-05-01T10:02:00Z", "postToolUseFailure", {}),
            ("2026-05-02T10:03:00Z", "preCompact", {}),
            ("2026-05-02T10:04:00Z", "agentStop", {"gate": "blocked-unverified"}),
            ("2026-05-02T10:05:00Z", "agentStop", {"gate": "verified"}),
        ],
    )
    _log(b, "s2", [("2026-05-02T09:00:00Z", "sessionStart", {})])
    folders.add_folder(str(tmp_path / "w"))
    return a, b


def test_empty_has_note() -> None:
    body = _trends()
    assert body["days"] == [] and body["enough_data"] is False and body["note"]


def test_counts_per_day_and_repo_filter(tmp_path: Path) -> None:
    _two_repos(tmp_path)
    body = _trends()
    day1, day2 = body["days"]
    assert day1 == {
        "date": "2026-05-01",
        "sessions": 1,
        "errors": 1,
        "tool_failures": 1,
        "compactions": 0,
        "stop_blocks": 0,
        "verify_pass": 0,
        "verify_fail": 0,
    }
    assert (day2["sessions"], day2["compactions"], day2["stop_blocks"]) == (1, 1, 1)
    assert body["enough_data"] is True and body["note"] is None
    assert body["totals"]["sessions"] == 2
    for entry in body["verified"]:
        only = _trends(f"?repo={entry['repo_id']}")
        assert only["totals"]["sessions"] == 1
    assert len({e["repo_id"] for e in body["verified"]}) == 2


def test_unknown_repo_404(tmp_path: Path) -> None:
    _two_repos(tmp_path)
    assert client.get("/api/trends?repo=nope").status_code == 404


def test_single_day_shows_totals_and_note(tmp_path: Path) -> None:
    _log(_repo(tmp_path / "w", "a"), "s", [("2026-05-01T10:00:00Z", "errorOccurred", {})])
    folders.add_folder(str(tmp_path / "w"))
    body = _trends()
    assert body["enough_data"] is False and body["note"]
    assert body["totals"]["errors"] == 1


def test_verified_marker(tmp_path: Path) -> None:
    a, _b = _two_repos(tmp_path)
    marker = a / ".agent-logs" / ".verified"
    marker.write_text("abc")
    os.utime(marker, (1_800_000_000, 1_800_000_000))
    by_repo = {v["exists"]: v for v in _trends()["verified"]}
    assert by_repo[False]["mtime"] is None
    assert by_repo[True]["mtime"].startswith("2027-01-15")


def test_verify_log_pass_fail_per_day(tmp_path: Path) -> None:
    a, b = _two_repos(tmp_path)
    for repo, issue, text, ts in (
        (a, 1, "x\nPASS\n", 1_800_000_000),
        (b, 2, "FAIL tests\n", 1_800_000_000),
    ):
        run = repo / ".agent-work" / f"issue-{issue}"
        run.mkdir(parents=True)
        (run / "verify.log").write_text(text)
        os.utime(run / "verify.log", (ts, ts))
    day = next(d for d in _trends()["days"] if d["date"] == "2027-01-15")
    assert (day["verify_pass"], day["verify_fail"]) == (1, 1)


def test_bad_lines_and_empty_logs_ignored(tmp_path: Path) -> None:
    a = _repo(tmp_path / "w", "a")
    (a / ".agent-logs" / "s.jsonl").write_text("not json\n[1]\n")
    (a / ".agent-logs" / "index.jsonl").write_text(
        json.dumps({"ts": "2026-05-01T00:00:00Z", "event": "errorOccurred"}) + "\n"
    )
    folders.add_folder(str(tmp_path / "w"))
    assert _trends()["totals"]["errors"] == 0
