import json
import os
import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from flightdeck import install
from flightdeck.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FLIGHTDECK_CONFIG", str(tmp_path / "cfg" / "config.json"))
    install._previews.clear()


@pytest.fixture
def template(tmp_path: Path) -> Path:
    """Fake harness: records argv instead of installing anything."""
    t = tmp_path / "template"
    t.mkdir()
    (t / "install.sh").write_text(
        'printf "%s\\n" "$@" > "$(dirname "$0")/argv.txt"; echo installed; exit 3\n'
    )
    assert client.put("/api/settings/harness-template", json={"path": str(t)}).status_code == 200
    return t


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    r = tmp_path / "repo"
    (r / ".git").mkdir(parents=True)
    return r


def _preview(target: Path, **extra: str) -> dict[str, Any]:
    res = client.post("/api/install/preview", json={"target": str(target), **extra})
    assert res.status_code == 200, res.text
    body: dict[str, Any] = res.json()
    return body


def _snapshot(root: Path) -> list[str]:
    return sorted(str(p) for p in root.rglob("*"))


def test_template_roundtrip_and_422(tmp_path: Path) -> None:
    assert client.get("/api/settings/harness-template").json() == {"path": None}
    empty = tmp_path / "empty"
    empty.mkdir()
    for bad in (str(empty), "relative", str(tmp_path / "nope"), "-x", "/a\nb"):
        assert client.put("/api/settings/harness-template", json={"path": bad}).status_code == 422
    (empty / "install.sh").write_text("")
    assert (
        client.put("/api/settings/harness-template", json={"path": str(empty)}).status_code == 200
    )
    assert client.get("/api/settings/harness-template").json() == {"path": str(empty)}


def test_template_keeps_folders(tmp_path: Path, template: Path) -> None:
    d = tmp_path / "w"
    d.mkdir()
    assert client.post("/api/folders", json={"path": str(d)}).status_code == 201
    cfg = json.loads((tmp_path / "cfg" / "config.json").read_text())
    assert cfg["harness_template"] == str(template)
    assert len(cfg["folders"]) == 1


def test_preview_lists_and_does_not_touch_disk(tmp_path: Path, template: Path, repo: Path) -> None:
    (repo / "AGENTS.md").write_text("x")
    before = _snapshot(tmp_path)
    body = _preview(repo)
    assert body["would_overwrite"] == ["AGENTS.md"]
    assert "scripts/factory" in body["would_create"]
    assert body["requires_overwrite"] is True
    assert _snapshot(tmp_path) == before


@pytest.mark.parametrize(
    "extra",
    [{"repo": "x"}, {"os": "mac"}, {"assistant": "gpt"}, {"cloud": "gcp"}, {"repo": "--force"}],
)
def test_preview_option_allowlist_422(template: Path, repo: Path, extra: dict[str, str]) -> None:
    res = client.post("/api/install/preview", json={"target": str(repo), **extra})
    assert res.status_code == 422


def test_preview_bad_targets_422(tmp_path: Path, template: Path, repo: Path) -> None:
    plain = tmp_path / "plain"
    plain.mkdir()
    a_file = tmp_path / "f"
    a_file.write_text("x")
    bad = [
        str(plain),
        str(a_file),
        str(tmp_path / "missing"),
        "rel/path",
        "-rf",
        f"{repo}\nx",
        f"{repo}\0x",
    ]
    for target in bad:
        res = client.post("/api/install/preview", json={"target": target})
        assert res.status_code == 422, target
        assert res.json()["detail"]
    assert not install._previews


def test_unwritable_target_422(template: Path, repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(os, "access", lambda *a: False)
    assert client.post("/api/install/preview", json={"target": str(repo)}).status_code == 422


def test_install_unknown_preview_404(template: Path) -> None:
    res = client.post("/api/install", json={"preview_id": "nope"})
    assert res.status_code == 404
    assert not (template / "argv.txt").exists()


def test_install_runs_argv_without_force(template: Path, repo: Path) -> None:
    pid = _preview(repo, repo="local", os="wsl", assistant="claude-code", cloud="aws")["preview_id"]
    res = client.post("/api/install", json={"preview_id": pid})
    assert res.status_code == 200
    assert res.json() == {"exit_code": 3, "output": "installed\n"}
    argv = (template / "argv.txt").read_text().split("\n")[:-1]
    assert argv == [
        str(repo), "--repo", "local", "--os", "wsl",
        "--assistant", "claude-code", "--cloud", "aws",
    ]  # fmt: skip


def test_preview_id_single_use(template: Path, repo: Path) -> None:
    pid = _preview(repo)["preview_id"]
    assert client.post("/api/install", json={"preview_id": pid}).status_code == 200
    assert client.post("/api/install", json={"preview_id": pid}).status_code == 404


def test_expired_preview_404(template: Path, repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pid = _preview(repo)["preview_id"]
    monkeypatch.setattr(time, "monotonic", lambda: 10**9)
    assert client.post("/api/install", json={"preview_id": pid}).status_code == 404
    assert not (template / "argv.txt").exists()


def test_existing_harness_409_without_overwrite_then_force(template: Path, repo: Path) -> None:
    (repo / "AGENTS.md").write_text("x")
    pid = _preview(repo)["preview_id"]
    res = client.post("/api/install", json={"preview_id": pid, "overwrite": False})
    assert res.status_code == 409
    assert "AGENTS.md" in res.json()["detail"]
    assert not (template / "argv.txt").exists()
    res = client.post("/api/install", json={"preview_id": pid, "overwrite": True})
    assert res.status_code == 200
    assert (template / "argv.txt").read_text().split("\n")[-2] == "--force"


def test_install_without_template_422(repo: Path) -> None:
    pid = _preview(repo)["preview_id"]
    assert client.post("/api/install", json={"preview_id": pid}).status_code == 422


def test_target_revalidated_at_install(template: Path, repo: Path) -> None:
    pid = _preview(repo)["preview_id"]
    (repo / ".git").rmdir()
    assert client.post("/api/install", json={"preview_id": pid}).status_code == 422
    assert not (template / "argv.txt").exists()
