import os
from pathlib import Path

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


def _run(repo: Path, issue: int, files: dict[str, str]) -> Path:
    d = repo / ".agent-work" / f"issue-{issue}"
    d.mkdir(parents=True)
    for name, text in files.items():
        (d / name).write_text(text)
    return d


def _runs() -> list[dict[str, object]]:
    runs: list[dict[str, object]] = client.get("/api/runs").json()["runs"]
    return runs


def test_empty() -> None:
    assert _runs() == []


def test_lists_artifacts_one_entry_per_issue(tmp_path: Path) -> None:
    repo = _repo(tmp_path / "w", "r")
    _run(repo, 3, {"brief.md": "x", "plan.md": "y", "junk.txt": "z"})
    _run(repo, 5, {})
    (repo / ".agent-work" / "notes").mkdir()
    folders.add_folder(str(tmp_path / "w"))
    runs = _runs()
    assert [(r["issue"], r["repo_name"]) for r in runs] == [(3, "r"), (5, "r")]
    assert runs[0]["artifacts"] == ["brief.md", "plan.md"]
    assert runs[1]["artifacts"] == []


@pytest.mark.parametrize(
    ("files", "status"),
    [
        ({}, "intake"),
        ({"brief.md": ""}, "intake"),
        ({"plan.md": ""}, "implementing"),
        ({"plan.md": "", "review.md": "no verdict here"}, "implementing"),
        ({"plan.md": "", "review.md": "VERDICT: approve"}, "reviewed"),
        ({"review.md": "VERDICT: approve", "breakdown.md": ""}, "breakdown"),
        ({"breakdown.md": "", "questions.md": ""}, "needs-input"),
    ],
)
def test_status_precedence(tmp_path: Path, files: dict[str, str], status: str) -> None:
    repo = _repo(tmp_path / "w", "r")
    _run(repo, 1, files)
    folders.add_folder(str(tmp_path / "w"))
    assert _runs()[0]["status"] == status


def test_worktree_run_wins_and_source_reported(tmp_path: Path) -> None:
    repo = _repo(tmp_path / "w", "r")
    main_dir = _run(repo, 7, {"brief.md": ""})
    wt = tmp_path / "w" / "r-wt"
    wt.mkdir()
    gitdir = repo / ".git" / "worktrees" / "wt"
    gitdir.mkdir(parents=True)
    (wt / ".git").write_text(f"gitdir: {gitdir}\n")
    (wt / ".agent-logs").mkdir()
    wt_dir = _run(wt, 7, {"brief.md": "", "plan.md": ""})
    folders.add_folder(str(tmp_path / "w"))
    (run,) = _runs()
    assert run["source"] == str(wt_dir)
    assert run["source"] != str(main_dir)
    assert run["status"] == "implementing"


def test_detail(tmp_path: Path) -> None:
    repo = _repo(tmp_path / "w", "r")
    _run(
        repo,
        4,
        {
            "plan.md": "### T1: a\n### T2: b\n#### T3 not a task\n",
            "review.md": (
                "- BLOCKING: a.py:1 bad\n- NIT: b.py:2\nNIT: c\nVERDICT: changes-required\n"
            ),
            "verify.log": "format: PASS\nlint: FAIL (2)\nRESULT: FAIL (lint)\nnoise\n",
        },
    )
    folders.add_folder(str(tmp_path / "w"))
    rid = _runs()[0]["repo_id"]
    body = client.get(f"/api/repos/{rid}/runs/4").json()
    assert body["plan_tasks"] == 2
    assert body["review_verdict"] == "changes-required"
    assert (body["blocking"], body["nit"]) == (1, 2)
    assert body["verify_result"] == "RESULT: FAIL (lint)"
    assert body["status"] == "reviewed"


def test_detail_without_review_or_verify(tmp_path: Path) -> None:
    repo = _repo(tmp_path / "w", "r")
    _run(repo, 2, {"brief.md": ""})
    folders.add_folder(str(tmp_path / "w"))
    body = client.get(f"/api/repos/{_runs()[0]['repo_id']}/runs/2").json()
    assert body["plan_tasks"] == 0
    assert body["review_verdict"] is None
    assert body["verify_result"] is None


def test_detail_404(tmp_path: Path) -> None:
    repo = _repo(tmp_path / "w", "r")
    _run(repo, 2, {})
    folders.add_folder(str(tmp_path / "w"))
    rid = _runs()[0]["repo_id"]
    assert client.get(f"/api/repos/{rid}/runs/99").status_code == 404
    assert client.get("/api/repos/nope/runs/2").status_code == 404
    assert os.path.isdir(repo)
