import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from flightdeck import folders
from flightdeck.main import app

client = TestClient(app)

COMMANDS_SAMPLE = (
    "# comment\nTEST_CMD=npm test\nAPI_TOKEN=abc123\nexport DB_Password='pw'\nNOEQUALS\n"
)
COMPLEXITY_SAMPLE = "MAX_FILES=15\nSECRET_LIMIT=9\n"


@pytest.fixture(autouse=True)
def config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "cfg" / "config.json"
    monkeypatch.setenv("FLIGHTDECK_CONFIG", str(path))
    return path


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _register(tmp_path: Path, name: str = "r") -> tuple[Path, str]:
    watched = tmp_path / "w"
    repo = watched / name
    (repo / ".git").mkdir(parents=True)
    (repo / ".agent-logs").mkdir()
    folders.add_folder(str(watched))
    (item,) = client.get("/api/repos").json()["repos"]
    return repo, str(item["id"])


def test_unknown_repo_is_404() -> None:
    resp = client.get("/api/repos/nope/harness")
    assert resp.status_code == 404


def test_missing_parts_are_empty(tmp_path: Path) -> None:
    _, rid = _register(tmp_path)
    body = client.get(f"/api/repos/{rid}/harness").json()
    assert body == {
        "agents": [],
        "skills": [],
        "hooks": [],
        "deny_commands": {"text": "", "count": 0},
        "deny_paths": {"text": "", "count": 0},
        "commands": [],
        "complexity": [],
    }


def test_agents_and_skills(tmp_path: Path) -> None:
    repo, rid = _register(tmp_path)
    _write(
        repo / ".claude/agents/planner.md",
        "---\nname: planner\ndescription: Plans work\ntools: Read, Grep\n---\nbody\n",
    )
    _write(repo / ".github/agents/bare.md", "no front matter")
    _write(
        repo / ".claude/skills/intake/SKILL.md",
        "---\nname: issue-intake\ndescription: Make a brief\n---\n",
    )
    body = client.get(f"/api/repos/{rid}/harness").json()
    by_name = {a["name"]: a for a in body["agents"]}
    assert by_name["planner"]["description"] == "Plans work"
    assert by_name["planner"]["tools"] == ["Read", "Grep"]
    assert by_name["bare"]["tools"] == []
    assert body["skills"] == [{"name": "issue-intake", "description": "Make a brief"}]


def test_hooks_nested_claude_and_flat_copilot(tmp_path: Path) -> None:
    repo, rid = _register(tmp_path)
    claude = {
        "hooks": {
            "Stop": [
                {"hooks": [{"type": "command", "command": "bash", "args": ["s.sh"], "timeout": 20}]}
            ]
        }
    }
    copilot = {
        "version": 1,
        "hooks": {"sessionStart": [{"type": "command", "bash": "./log.sh", "timeoutSec": 10}]},
    }
    _write(repo / ".claude/settings.json", json.dumps(claude))
    _write(repo / ".github/hooks/h.json", json.dumps(copilot))
    _write(repo / ".github/hooks/broken.json", "{not json")
    hooks = client.get(f"/api/repos/{rid}/harness").json()["hooks"]
    assert {"event": "Stop", "script": "bash s.sh", "timeout": 20} in hooks
    assert {"event": "sessionStart", "script": "./log.sh", "timeout": 10} in hooks
    assert len(hooks) == 2


def test_policy_text_and_counts(tmp_path: Path) -> None:
    repo, rid = _register(tmp_path)
    policy = repo / ".github/hooks/policy"
    _write(policy / "deny-commands.txt", "# c\nrm -rf\n\nsudo\n")
    _write(policy / "deny-paths.txt", "\\.pem$\n")
    body = client.get(f"/api/repos/{rid}/harness").json()
    assert body["deny_commands"] == {"text": "# c\nrm -rf\n\nsudo\n", "count": 2}
    assert body["deny_paths"]["count"] == 1


def test_config_pairs_mask_secret_keys(tmp_path: Path) -> None:
    repo, rid = _register(tmp_path)
    _write(repo / "scripts/factory/commands.env", COMMANDS_SAMPLE)
    _write(repo / "scripts/factory/complexity.env", COMPLEXITY_SAMPLE)
    body = client.get(f"/api/repos/{rid}/harness").json()
    assert body["commands"] == [
        {"key": "TEST_CMD", "value": "npm test"},
        {"key": "API_TOKEN", "value": "********"},
        {"key": "DB_Password", "value": "********"},
    ]
    assert body["complexity"] == [
        {"key": "MAX_FILES", "value": "15"},
        {"key": "SECRET_LIMIT", "value": "********"},
    ]
    assert "abc123" not in json.dumps(body)
