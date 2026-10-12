import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from flightdeck import folders
from flightdeck.main import app


@pytest.fixture(autouse=True)
def config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "cfg" / "config.json"
    monkeypatch.setenv("FLIGHTDECK_CONFIG", str(path))
    return path


def test_store_add_then_list() -> None:
    added = folders.add_folder("/a/b")
    assert added["path"] == "/a/b"
    assert added["id"]
    assert folders.list_folders() == [added]


def test_config_file_created_on_first_add(config_file: Path) -> None:
    assert folders.list_folders() == []
    assert not config_file.exists()
    folders.add_folder("/a/b")
    assert config_file.exists()


@pytest.mark.parametrize("dup", ["/a/b/", "/a/./b", "/a/c/../b"])
def test_store_duplicate_normalised(dup: str) -> None:
    folders.add_folder("/a/b")
    with pytest.raises(folders.DuplicateFolderError):
        folders.add_folder(dup)
    assert len(folders.list_folders()) == 1


def test_store_persists_across_reload() -> None:
    added = folders.add_folder("/a/b")
    assert folders.list_folders() == [added]


def test_default_config_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FLIGHTDECK_CONFIG")
    monkeypatch.setenv("HOME", str(tmp_path))
    assert folders.config_path() == tmp_path / ".config" / "flightdeck" / "config.json"


def test_post_then_list(config_file: Path) -> None:
    client = TestClient(app)
    assert client.get("/api/folders").json() == []
    assert not config_file.exists()
    res = client.post("/api/folders", json={"path": "/a/b/"})
    assert res.status_code == 201
    body = res.json()
    assert body["path"] == "/a/b"
    assert body["id"]
    assert client.get("/api/folders").json() == [body]
    assert config_file.exists()
    assert body["path"] in config_file.read_text()


@pytest.mark.parametrize("dup", ["/a/b/", "/a/./b", "/a/c/../b"])
def test_post_duplicate_returns_409(dup: str) -> None:
    client = TestClient(app)
    first = client.post("/api/folders", json={"path": "/a/b"}).json()
    res = client.post("/api/folders", json={"path": dup})
    assert res.status_code == 409
    assert client.get("/api/folders").json() == [first]


def test_api_persists_across_restart() -> None:
    created = TestClient(app).post("/api/folders", json={"path": "/a/b"}).json()
    assert TestClient(app).get("/api/folders").json() == [created]


def test_store_remove() -> None:
    keep = folders.add_folder("/a/keep")
    gone = folders.add_folder("/a/gone")
    folders.remove_folder(gone["id"])
    assert folders.list_folders() == [keep]


def test_store_remove_unknown() -> None:
    added = folders.add_folder("/a/b")
    with pytest.raises(folders.FolderNotFoundError):
        folders.remove_folder("nope")
    assert folders.list_folders() == [added]


def test_store_remove_twice_raises() -> None:
    added = folders.add_folder("/a/b")
    folders.remove_folder(added["id"])
    with pytest.raises(folders.FolderNotFoundError):
        folders.remove_folder(added["id"])


def test_tests_use_temp_config(config_file: Path, tmp_path: Path) -> None:
    assert os.environ["FLIGHTDECK_CONFIG"] == str(config_file)
    assert folders.config_path().is_relative_to(tmp_path)


def test_delete_removes_and_persists(config_file: Path) -> None:
    client = TestClient(app)
    body = client.post("/api/folders", json={"path": "/a/b"}).json()
    res = client.delete(f"/api/folders/{body['id']}")
    assert res.status_code == 204
    assert res.content == b""
    assert client.get("/api/folders").json() == []
    assert "/a/b" not in config_file.read_text()


def test_delete_unknown_returns_404() -> None:
    client = TestClient(app)
    kept = client.post("/api/folders", json={"path": "/a/b"}).json()
    res = client.delete("/api/folders/nope")
    assert res.status_code == 404
    assert res.json()["detail"]
    assert client.get("/api/folders").json() == [kept]


def test_delete_twice_returns_404() -> None:
    client = TestClient(app)
    body = client.post("/api/folders", json={"path": "/a/b"}).json()
    assert client.delete(f"/api/folders/{body['id']}").status_code == 204
    res = client.delete(f"/api/folders/{body['id']}")
    assert res.status_code == 404
    assert res.json()["detail"]
